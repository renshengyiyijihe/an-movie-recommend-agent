import { useState } from 'react';
import useAuth from '../store/auth';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AuthModal({ visible, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);

  if (!visible) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (!email || !password) {
        setError('请填写邮箱和密码');
        return;
      }
      setLoading(true);
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!name) {
          setError('请填写姓名');
          setLoading(false);
          return;
        }
        await register(name, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || '发生错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>{mode === 'login' ? '登录' : '注册'}</h3>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' ? (
            <label>
              姓名
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          ) : null}
          <label>
            邮箱
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="auth-actions">
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}</button>
            <button type="button" className="btn-outline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '去注册' : '去登录'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
