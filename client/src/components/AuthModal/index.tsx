import { useState, type FormEvent } from 'react';
import useAuth from '@/store/auth';
import styles from './index.module.less';

interface Props {
  visible: boolean;
  mode: 'login' | 'register';
  onClose: () => void;
  onSwitchMode: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthModal({ visible, mode, onClose, onSwitchMode }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);

  if (!visible) return null;

  function validateEmail(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '请输入邮箱';
    if (!EMAIL_RE.test(trimmed)) return '请输入有效的邮箱格式';
    return '';
  }

  function validatePassword(value: string) {
    if (!value) return '请输入密码';
    if (value.length < 6) return '密码至少 6 位';
    return '';
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedUsername = username.trim();

    const nextEmailError = validateEmail(trimmedEmail);
    const nextUsernameError = mode === 'register' && !trimmedUsername ? '请输入用户名' : '';
    const nextPasswordError = validatePassword(trimmedPassword);
    setEmailError(nextEmailError);
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextUsernameError || nextPasswordError) {
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(trimmedEmail, trimmedPassword);
      } else {
        await register(trimmedUsername, trimmedEmail, trimmedPassword);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || '发生错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose} type="button">×</button>
        <h3>{mode === 'login' ? '登录' : '注册'}</h3>
        <form onSubmit={handleSubmit} className={styles.authForm}>
          {mode === 'register' ? (
            <label className={styles.fieldLabel}>
              用户名
              <input
                value={username}
                aria-invalid={Boolean(usernameError || error)}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError('');
                  if (error) setError('');
                }}
                placeholder="取一个好记的用户名"
              />
              {usernameError ? <div className={styles.fieldError}>{usernameError}</div> : null}
            </label>
          ) : null}

          <label className={styles.fieldLabel}>
            邮箱
            <input
              type="email"
              value={email}
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(emailError || error)}
              onChange={(e) => {
                const nextValue = e.target.value;
                setEmail(nextValue);
                setEmailError(validateEmail(nextValue));
                if (error) setError('');
              }}
              onBlur={() => setEmailError(validateEmail(email))}
              placeholder="name@example.com"
            />
            {emailError ? <div className={styles.fieldError}>{emailError}</div> : null}
          </label>

          <label className={styles.fieldLabel}>
            密码
            <input
              type="password"
              value={password}
              aria-invalid={Boolean(passwordError || error)}
              onChange={(e) => {
                const nextValue = e.target.value;
                setPassword(nextValue);
                setPasswordError(validatePassword(nextValue));
                if (error) setError('');
              }}
              onBlur={() => setPasswordError(validatePassword(password))}
              placeholder="至少 6 位"
            />
            {passwordError ? <div className={styles.fieldError}>{passwordError}</div> : null}
          </label>

          {error ? <div className={styles.authError}>{error}</div> : null}

          <div className={styles.authActions}>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
            <button type="button" className={styles.btnOutline} onClick={onSwitchMode}>
              {mode === 'login' ? '去注册' : '去登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
