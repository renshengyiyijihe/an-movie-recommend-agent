import { useEffect, useState } from 'react';
import { request } from '../api';
import useAuth from '../store/auth';
import AuthModal from '../components/AuthModal';
import AppLogo from '../components/AppLogo';
import ConfigModal from '../components/ConfigModal';
import RecommendationPoster from '../components/RecommendationPoster';
import TopBar from '../components/TopBar';
import { convertConversationToMessages, convertResultToMessages, getRecommendationGenres, renderMessageText } from '../utils/chatUtils';
import { getTmdbImage } from '../utils/tmdb';
import type { ChatMessage, ConversationDetail, ConversationSummary, RecommendationItem } from '../types';

const quickPrompts = ['想看一部科幻大片，时长2小时以内', '想要轻松爱情片，适合晚上放松', '推荐几部张力强、节奏快的动作片'];

export default function HomePage() {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageData, setImageData] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = useAuth((s) => s.token);

  async function fetchConversations() {
    if (!token) return;

    setHistoryLoading(true);
    try {
      const result = await request<{ conversations: ConversationSummary[] }>({ method: 'GET', url: '/api/message/conversations' });
      setConversationList(result.conversations ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function fetchConversationDetail(conversationId: string) {
    setDetailsLoading(true);
    try {
      const detail = await request<ConversationDetail>({ method: 'GET', url: `/api/message/conversations/${conversationId}` });
      setSelectedConversation(detail);
      setConversationId(detail.conversation_id);
      setMessages(convertConversationToMessages(detail.messages));
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  }

  function openConfigModal() {
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    setShowConfigModal(true);
    void fetchConversations();
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setSelectedConversation(null);
  }

  useEffect(() => {
    if (!file) {
      setImagePreview('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(file);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function sendMessage() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    setError('');

    const userMessage: ChatMessage = { role: 'user', text: trimmedMessage, imagePreview: imagePreview || undefined };
    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({ role: item.role === 'user' ? 'user' : 'assistant', content: item.text.trim() }));

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    setFile(null);
    setLoading(true);

    try {
      const result = await request<any>({
        method: 'POST',
        url: '/api/movie/recommend',
        data: { message: userMessage.text, imageData, history, conversationId },
      });
      setMessages((prev) => [...prev, ...convertResultToMessages(result)]);
      if (result?.conversationId) setConversationId(result.conversationId);
    } catch {
      setError('请求后端失败，请检查服务是否启动');
      setMessages((prev) => [...prev, { role: 'assistant-error', text: '请求失败，请稍后再试。', type: 'error' }]);
    } finally {
      setLoading(false);
      setImageData('');
    }
  }

  function renderRecommendationCard(item: RecommendationItem, index: number) {
    const title = item.title || item.name || item.original_title || '未知电影';
    const subtitle = item.original_title && item.original_title !== title ? item.original_title : '';
    const reason = item.reason || item.summary || item.overview || '暂无说明';
    const releaseDate = item.release_date ? item.release_date : '未知日期';
    const rating = typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : '暂无';
    const voteCount = typeof item.vote_count === 'number' ? `${item.vote_count}` : '0';
    const popularity = typeof item.popularity === 'number' ? `${item.popularity.toFixed(1)}` : '暂无';
    const language = item.original_language || '未知';
    const genres = getRecommendationGenres(item);
    const posterUrl = getTmdbImage(item.poster_url || item.poster_path);

    return (
      <div className="recommendation-card" key={`${title}-${index}`}>
        <div className="recommendation-card__media">
          <RecommendationPoster src={posterUrl} alt={title} />
        </div>
        <div className="recommendation-card__body">
          <div className="recommendation-card__header">
            <div>
              <h4>{title}</h4>
              {subtitle ? <p className="recommendation-card__subtitle">{subtitle}</p> : null}
            </div>
            {item.tmdb_url ? (
              <a href={item.tmdb_url} target="_blank" rel="noreferrer" className="recommendation-card__link">查看详情</a>
            ) : null}
          </div>
          <p className="recommendation-card__reason" data-tooltip={reason} aria-label={reason}>{reason}</p>
          <div className="recommendation-card__meta-row" aria-label="影片信息">
            <span>上映: {releaseDate}</span>
            <span>评分: {rating}</span>
            <span>评分人数: {voteCount}</span>
            <span>热度: {popularity}</span>
            <span>语言: {language}</span>
            {item.adult ? <span>成人内容</span> : null}
            {item.video ? <span>含视频</span> : null}
          </div>
          {genres.length > 0 ? (
            <div className="recommendation-card__chip-row" aria-label="影片类型">
              <span className="recommendation-card__chip recommendation-card__chip--label">类型</span>
              {genres.map((genre) => (
                <span className="recommendation-card__chip" key={`${title}-${genre}`}>{genre}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        onOpenConfig={openConfigModal}
        onOpenLogin={() => setShowLoginModal(true)}
        onOpenRegister={() => setShowRegisterModal(true)}
      />

      <section className="chat-panel">
        <ConfigModal
          visible={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSelectConversation={(id) => void fetchConversationDetail(id)}
          conversations={conversationList}
          selectedConversation={selectedConversation}
          loading={historyLoading}
          detailLoading={detailsLoading}
        />
        <AuthModal visible={showLoginModal} mode="login" onClose={() => setShowLoginModal(false)} onSwitchMode={() => { setShowLoginModal(false); setShowRegisterModal(true); }} />
        <AuthModal visible={showRegisterModal} mode="register" onClose={() => setShowRegisterModal(false)} onSwitchMode={() => { setShowRegisterModal(false); setShowLoginModal(true); }} />

        <header className="hero-header">
          <div className="title-row">
            <div>
              <h1>为你挑选你喜欢的电影</h1>
              <p>说出你的口味、风格和观影需求，马上帮你推荐合适影片。</p>
            </div>
          </div>
          <div className="quick-prompts">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" className="chip-button" onClick={() => setMessage(prompt)}>{prompt}</button>
            ))}
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <AppLogo className="empty-state-icon" size={44} />
              <h3>从一句简单的话开始</h3>
              <p>比如“想看一部剧情片，时长2小时以内，最好有温情结局”。</p>
            </div>
          ) : (
            <>
              {messages.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`message ${item.role === 'user' ? 'user' : item.role === 'assistant-error' ? 'assistant-error' : 'assistant'}`}>
                  <div className="message-role">{item.role === 'user' ? '你' : item.role === 'assistant-error' ? '智能体（异常）' : '智能体'}</div>
                  <div className="message-text">
                    {item.type === 'recommendation' ? (
                      <div className="recommendation-list">
                        {(() => {
                          try {
                            const parsed = JSON.parse(item.text) as RecommendationItem[];
                            return Array.isArray(parsed)
                              ? parsed.map((recommendation, recommendationIndex) => renderRecommendationCard(recommendation, recommendationIndex))
                              : null;
                          } catch {
                            return <p>推荐内容暂时无法展示，请稍后再试。</p>;
                          }
                        })()}
                      </div>
                    ) : (
                      renderMessageText(item.text).map((line, lineIndex) => (<p key={`${item.role}-${index}-${lineIndex}`}>{line}</p>))
                    )}
                  </div>
                  {item.imagePreview ? <img src={item.imagePreview} alt="uploaded preview" className="message-image" /> : null}
                </div>
              ))}
              {loading ? (
                <div className="message assistant loading">
                  <div className="message-role">智能体</div>
                  <div className="message-text">
                    <div className="loading-dots" aria-label="智能体正在思考"></div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="input-area">
          <div className="input-card">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="输入你的观影偏好、类型或心情，比如：想看科幻片，2小时以内，有精彩视觉效果。"
            />
            <div className="input-actions">
              <label className="file-input">
                <span>📷 上传图片（可选）</span>
                <input type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <div className="action-buttons">
                <button type="button" className="btn-new-conversation" onClick={startNewConversation}>新会话</button>
                <button type="button" className="send-button" onClick={() => void sendMessage()} disabled={loading}>{loading ? '发送中...' : '发送'}</button>
              </div>
            </div>
            {imagePreview ? <img src={imagePreview} alt="图片预览" className="preview-image" /> : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
