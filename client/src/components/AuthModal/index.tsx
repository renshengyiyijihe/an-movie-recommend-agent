import { useEffect, useState, type FormEvent } from 'react';
import Dialog from '@mui/material/Dialog';
import { AUTH_PASSWORD_MIN_LENGTH, AUTH_USERNAME_MIN_LENGTH, TEXT } from '@/constant';
import { ApiError } from '@/api';
import useAuth from '@/store/auth';
import styles from './index.module.less';

interface Props {
  visible: boolean;
  mode: 'login' | 'register';
  onClose: () => void;
  onSwitchMode: () => void;
  /** 注册成功后由父组件切到登录，而不是写入登录态 */
  onRegistered?: (email: string) => void;
  initialEmail?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthModal({
  visible,
  mode,
  onClose,
  onSwitchMode,
  onRegistered,
  initialEmail,
}: Props) {
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
  const titleId = mode === 'login' ? 'auth-dialog-login-title' : 'auth-dialog-register-title';

  useEffect(() => {
    if (!visible) return;
    if (initialEmail) setEmail(initialEmail);
  }, [visible, initialEmail]);

  function handleDialogClose(_event: unknown, reason: 'backdropClick' | 'escapeKeyDown') {
    if (reason === 'backdropClick') return;
    onClose();
  }

  function validateEmail(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return TEXT.auth.emailRequired;
    if (!EMAIL_RE.test(trimmed)) return TEXT.auth.emailInvalid;
    return '';
  }

  function validateUsername(value: string) {
    if (!value) return TEXT.auth.usernameRequired;
    if (value.length < AUTH_USERNAME_MIN_LENGTH) return TEXT.auth.usernameMin;
    return '';
  }

  function validatePassword(value: string) {
    if (!value) return TEXT.auth.passwordRequired;
    if (value.length < AUTH_PASSWORD_MIN_LENGTH) return TEXT.auth.passwordMin;
    return '';
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedUsername = username.trim();

    const nextEmailError = validateEmail(trimmedEmail);
    const nextUsernameError = mode === 'register' ? validateUsername(trimmedUsername) : '';
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
        onClose();
      } else {
        await register(trimmedUsername, trimmedEmail, trimmedPassword);
        if (onRegistered) {
          onRegistered(trimmedEmail);
        } else {
          onSwitchMode();
        }
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  function formatAuthError(err: unknown): string {
    if (err instanceof ApiError && err.code && err.code in TEXT.errors) {
      return TEXT.errors[err.code as keyof typeof TEXT.errors];
    }
    if (err instanceof Error && err.message) return err.message;
    return TEXT.auth.genericError;
  }

  return (
    <Dialog
      open={visible}
      onClose={handleDialogClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      disableAutoFocus
      slotProps={{ paper: { className: styles.modal } }}
    >
      <button
        className={styles.modalClose}
        onClick={onClose}
        type="button"
        aria-label={TEXT.auth.closeDialog}
      >
        ×
      </button>
      <h3 id={titleId}>{mode === 'login' ? TEXT.auth.login : TEXT.auth.register}</h3>
      <form onSubmit={handleSubmit} className={styles.authForm}>
        {mode === 'register' ? (
          <label className={styles.fieldLabel}>
            {TEXT.auth.username}
            <input
              value={username}
              autoFocus
              aria-invalid={Boolean(usernameError || error)}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameError('');
                if (error) setError('');
              }}
              placeholder={TEXT.auth.usernamePlaceholder}
            />
            {usernameError ? <div className={styles.fieldError}>{usernameError}</div> : null}
          </label>
        ) : null}

        <label className={styles.fieldLabel}>
          {TEXT.auth.email}
          <input
            type="email"
            value={email}
            autoFocus={mode === 'login'}
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
            placeholder={TEXT.auth.emailPlaceholder}
          />
          {emailError ? <div className={styles.fieldError}>{emailError}</div> : null}
        </label>

        <label className={styles.fieldLabel}>
          {TEXT.auth.password}
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
            placeholder={TEXT.auth.passwordPlaceholder}
          />
          {passwordError ? <div className={styles.fieldError}>{passwordError}</div> : null}
        </label>

        {error ? <div className={styles.authError}>{error}</div> : null}

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? TEXT.auth.submitting : mode === 'login' ? TEXT.auth.login : TEXT.auth.register}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onSwitchMode}>
            {mode === 'login' ? TEXT.auth.goRegister : TEXT.auth.goLogin}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
