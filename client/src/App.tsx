import { useEffect, useState } from 'react';
import { request } from './api';
import useAuth from './store/auth';
import AuthModal from './components/AuthModal';
import AppLogo from './components/AppLogo';

interface RecommendationItem {
  name: string;
  reason: string;
  taobao: string;
  jd: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'assistant-error';
  text: string;
  type?: 'recommendation' | 'explanation' | 'fallback' | 'error';
  imagePreview?: string;
}

const quickPrompts = ['想看一部科幻大片，时长2小时以内', '想要轻松爱情片，适合晚上放松', '推荐几部张力强、节奏快的动作片'];

function App() {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageData, setImageData] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  useEffect(() => {
    if (!file) {
      setImagePreview('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
    };
    reader.readAsDataURL(file);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  function renderMessageText(text: string) {
    return text.split('\n').filter((line) => line.trim() !== '');
  }

  async function sendMessage() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    // require login before sending
    if (!token) {
      setShowLoginModal(true);
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      text: trimmedMessage,
      imagePreview: imagePreview || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    setFile(null);
    setLoading(true);
    setError('');

    try {
      const result = await request<any>({
        method: 'POST',
        url: '/api/movie/recommend',
        data: { message: userMessage.text, imageData },
      });
      const assistantItems = convertResultToMessages(result);
      setMessages((prev) => [...prev, ...assistantItems]);
    } catch {
      setError('请求后端失败，请检查服务是否启动');
      setMessages((prev) => [...prev, { role: 'assistant-error', text: '请求失败，请稍后再试。', type: 'error' }]);
    } finally {
      setLoading(false);
      setImageData('');
    }
  }

  function convertResultToMessages(result: any): ChatMessage[] {
    if (!result?.data) {
      return [{ role: 'assistant-error', text: '未收到有效响应，请重试。', type: 'error' }];
    }

    const { data } = result;
    const sections: ChatMessage[] = [];

    if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
      const recommendationText = data.recommendations
        .map(
          (item: RecommendationItem, index: number) =>
            `${index + 1}. ${item.name}\n理由: ${item.reason}`,
        )
        .join('\n\n');

      sections.push({
        role: 'assistant',
        text: `推荐结果：\n${recommendationText}`,
        type: 'recommendation',
      });
    }

    if (data.explanation) {
      sections.push({
        role: 'assistant',
        text: `推荐说明：\n${data.explanation}`,
        type: 'explanation',
      });
    }

    if ((!data.recommendations || data.recommendations.length === 0) && (data.message || data.fallback_reason)) {
      sections.push({
        role: 'assistant-error',
        text: data.message ? `${data.message}` : `兜底说明：\n${data.fallback_reason}`,
        type: 'fallback',
      });
    } else {
      if (data.message) {
        sections.push({
          role: 'assistant',
          text: `${data.message}`,
          type: 'explanation',
        });
      }
    }

    if (sections.length === 0) {
      return [{ role: 'assistant-error', text: '无法生成推荐内容，请稍后重试。', type: 'error' }];
    }

    return sections;
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="top-bar__title">
          <AppLogo className="top-bar__icon" size={24} />
          <span>An-movie</span>
        </div>
        <div className="auth-buttons" role="toolbar">
          {token ? (
            <>
              <div className="user-pill" aria-label="当前登录用户">
                <span className="user-pill__name">{user?.username ?? '用户'}</span>
              </div>
              <button className="btn-logout" onClick={() => logout()} aria-label="登出">登出</button>
            </>
          ) : (
            <>
              <button className="btn-outline" onClick={() => setShowLoginModal(true)}>登录</button>
              <button className="btn-primary" onClick={() => setShowRegisterModal(true)}>注册</button>
            </>
          )}
        </div>
      </div>

      <section className="chat-panel">
        <AuthModal
          visible={showLoginModal}
          mode="login"
          onClose={() => setShowLoginModal(false)}
          onSwitchMode={() => {
            setShowLoginModal(false);
            setShowRegisterModal(true);
          }}
        />
        <AuthModal
          visible={showRegisterModal}
          mode="register"
          onClose={() => setShowRegisterModal(false)}
          onSwitchMode={() => {
            setShowRegisterModal(false);
            setShowLoginModal(true);
          }}
        />

        <header className="hero-header">
          <div className="title-row">
            <div>
              <h1>为你挑选你喜欢的电影</h1>
              <p>说出你的口味、风格和观影需求，马上帮你推荐合适影片。</p>
            </div>
          </div>
          <div className="quick-prompts">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" className="chip-button" onClick={() => setMessage(prompt)}>
                {prompt}
              </button>
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
            messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`message ${item.role === 'user' ? 'user' : item.role === 'assistant-error' ? 'assistant-error' : 'assistant'}`}>
                <div className="message-role">
                  {item.role === 'user' ? '你' : item.role === 'assistant-error' ? '智能体（异常）' : '智能体'}
                </div>
                <div className="message-text">
                  {renderMessageText(item.text).map((line, lineIndex) => (
                    <p key={`${item.role}-${index}-${lineIndex}`}>{line}</p>
                  ))}
                </div>
                {item.imagePreview ? <img src={item.imagePreview} alt="uploaded preview" className="message-image" /> : null}
              </div>
            ))
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
              <button type="button" className="send-button" onClick={() => void sendMessage()} disabled={loading}>
                {loading ? '发送中...' : '发送'}
              </button>
            </div>
            {imagePreview ? <img src={imagePreview} alt="图片预览" className="preview-image" /> : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}

export default App;
