import { useEffect, useState } from 'react';

interface RecommendationItem {
  name: string;
  reason: string;
  taobao: string;
  jd: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  imagePreview?: string;
}

function App() {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageData, setImageData] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  async function sendMessage() {
    if (!message.trim()) {
      return;
    }

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const userMessage: ChatMessage = {
      role: 'user',
      text: message.trim(),
      imagePreview: imagePreview || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    setFile(null);
    setLoading(true);
    setError('');

    try {
      const resp = await fetch(`${apiBaseUrl}/api/noodle/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.text, imageData }),
      });
      const result = await resp.json();
      const assistantItems = convertResultToMessages(result);
      setMessages((prev) => [...prev, ...assistantItems]);
    } catch {
      setError('请求后端失败，请检查服务是否启动');
      setMessages((prev) => [...prev, { role: 'assistant', text: '请求失败，请稍后再试。' }]);
    } finally {
      setLoading(false);
      setImageData('');
    }
  }

  function convertResultToMessages(result: any): ChatMessage[] {
    if (!result?.data) {
      return [{ role: 'assistant', text: '未收到有效响应，请重试。' }];
    }

    const { data } = result;
    const sections: ChatMessage[] = [];

    if (data.recommendations) {
      const recommendationText = data.recommendations
        .map(
          (item: RecommendationItem, index: number) =>
            `${index + 1}. ${item.name}\n理由: ${item.reason}\n淘宝: ${item.taobao}\n京东: ${item.jd}`,
        )
        .join('\n\n');

      sections.push({ role: 'assistant', text: `推荐结果：\n${recommendationText}` });
    }

    if (data.explanation) {
      sections.push({ role: 'assistant', text: `推荐说明：\n${data.explanation}` });
    }

    if (data.fallback_reason) {
      sections.push({ role: 'assistant', text: `兜底说明：\n${data.fallback_reason}` });
    }

    if (sections.length === 0) {
      sections.push({ role: 'assistant', text: JSON.stringify(data, null, 2) });
    }

    return sections;
  }

  return (
    <div className="app-shell">
      <section className="chat-panel">
        <header>
          <div className="title-row">
            <div>
              <h1>泡面智能推荐</h1>
              <p>基于你的口味和预算，给出更适合的泡面选择。</p>
            </div>
          </div>
        </header>

        <div className="messages">
          {messages.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`message ${item.role === 'user' ? 'user' : 'assistant'}`}>
              <div className="message-role">{item.role === 'user' ? '你' : '智能体'}</div>
              <div>{item.text}</div>
              {item.imagePreview ? <img src={item.imagePreview} alt="uploaded preview" className="message-image" /> : null}
            </div>
          ))}
        </div>

        <div className="input-area">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="输入你的口味、预算、偏好，比如：我想吃麻辣、价格在 30 元以内、希望方便快捷。"
          />
          <label className="file-input">
            <span>上传图片（可选）</span>
            <input type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          {imagePreview ? <img src={imagePreview} alt="图片预览" className="preview-image" /> : null}
          <button type="button" onClick={sendMessage} disabled={loading}>
            {loading ? '发送中...' : '发送给智能体'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}

export default App;
