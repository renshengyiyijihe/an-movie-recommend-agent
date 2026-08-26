import { useEffect, useState } from 'react';
import { Controller, useForm, type Control, type FieldPath, type RegisterOptions } from 'react-hook-form';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
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

interface AuthFormValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface AuthFieldProps<T extends FieldPath<AuthFormValues>> {
  control: Control<AuthFormValues>;
  name: T;
  rules?: RegisterOptions<AuthFormValues, T>;
  label: string;
  type?: 'text' | 'email';
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
  passwordToggle?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  onAfterChange?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '14px',
    backgroundColor: '#f8fafc',
  },
} as const;

function AuthField<T extends FieldPath<AuthFormValues>>({
  control,
  name,
  rules,
  label,
  type = 'text',
  autoComplete,
  autoFocus,
  placeholder,
  passwordToggle = false,
  showPasswordLabel,
  hidePasswordLabel,
  onAfterChange,
}: AuthFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  const inputType = passwordToggle ? (visible ? 'text' : 'password') : type;

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field: { ref, onChange, ...field }, fieldState }) => (
        <TextField
          {...field}
          inputRef={ref}
          type={inputType}
          label={label}
          autoFocus={autoFocus}
          placeholder={placeholder}
          fullWidth
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message}
          sx={FIELD_SX}
          onChange={(event) => {
            onChange(event);
            onAfterChange?.();
          }}
          slotProps={{
            htmlInput: {
              autoComplete,
              spellCheck: passwordToggle ? false : undefined,
              inputMode: type === 'email' ? 'email' : undefined,
            },
            input: passwordToggle
              ? {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        type="button"
                        edge="end"
                        aria-label={visible ? hidePasswordLabel : showPasswordLabel}
                        aria-pressed={visible}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setVisible((open) => !open)}
                      >
                        {visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              : undefined,
          }}
        />
      )}
    />
  );
}

function formatAuthError(err: unknown): string {
  if (err instanceof ApiError && err.code && err.code in TEXT.errors) {
    return TEXT.errors[err.code as keyof typeof TEXT.errors];
  }
  if (err instanceof Error && err.message) return err.message;
  return TEXT.auth.genericError;
}

export default function AuthModal({
  visible,
  mode,
  onClose,
  onSwitchMode,
  onRegistered,
  initialEmail,
}: Props) {
  const login = useAuth((s) => s.login);
  const registerUser = useAuth((s) => s.register);
  const titleId = mode === 'login' ? 'auth-dialog-login-title' : 'auth-dialog-register-title';
  const {
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  useEffect(() => {
    if (!visible || !initialEmail) return;
    setValue('email', initialEmail);
  }, [visible, initialEmail, setValue]);

  function handleDialogClose(_event: unknown, reason: 'backdropClick' | 'escapeKeyDown') {
    if (reason === 'backdropClick') return;
    onClose();
  }

  async function onSubmit(values: AuthFormValues) {
    const email = values.email.trim();
    const password = values.password.trim();
    const username = values.username.trim();

    try {
      if (mode === 'login') {
        await login(email, password);
        onClose();
        return;
      }
      await registerUser(username, email, password);
      if (onRegistered) {
        onRegistered(email);
      } else {
        onSwitchMode();
      }
    } catch (err) {
      setError('root', { message: formatAuthError(err) });
    }
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        onChange={() => clearErrors('root')}
        className={styles.authForm}
      >
        {mode === 'register' ? (
          <AuthField
            control={control}
            name="username"
            label={TEXT.auth.username}
            autoFocus
            autoComplete="username"
            placeholder={TEXT.auth.usernamePlaceholder}
            rules={{
              validate: (value) => {
                const username = value.trim();
                if (!username) return TEXT.auth.usernameRequired;
                if (username.length < AUTH_USERNAME_MIN_LENGTH) return TEXT.auth.usernameMin;
                return true;
              },
            }}
          />
        ) : null}

        <AuthField
          control={control}
          name="email"
          type="email"
          label={TEXT.auth.email}
          autoFocus={mode === 'login'}
          autoComplete="email"
          placeholder={TEXT.auth.emailPlaceholder}
          rules={{
            validate: (value) => {
              const email = value.trim();
              if (!email) return TEXT.auth.emailRequired;
              if (!EMAIL_RE.test(email)) return TEXT.auth.emailInvalid;
              return true;
            },
          }}
        />

        <AuthField
          control={control}
          name="password"
          label={TEXT.auth.password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={TEXT.auth.passwordPlaceholder}
          passwordToggle
          showPasswordLabel={TEXT.auth.showPassword}
          hidePasswordLabel={TEXT.auth.hidePassword}
          onAfterChange={() => {
            if (mode === 'register') void trigger('confirmPassword');
          }}
          rules={{
            required: TEXT.auth.passwordRequired,
            minLength: {
              value: AUTH_PASSWORD_MIN_LENGTH,
              message: TEXT.auth.passwordMin,
            },
          }}
        />

        {mode === 'register' ? (
          <AuthField
            control={control}
            name="confirmPassword"
            label={TEXT.auth.confirmPassword}
            autoComplete="new-password"
            placeholder={TEXT.auth.confirmPasswordPlaceholder}
            passwordToggle
            showPasswordLabel={TEXT.auth.showConfirmPassword}
            hidePasswordLabel={TEXT.auth.hideConfirmPassword}
            rules={{
              validate: (value, formValues) => {
                if (!value) return TEXT.auth.confirmPasswordRequired;
                if (value !== formValues.password) return TEXT.auth.passwordMismatch;
                return true;
              },
            }}
          />
        ) : null}

        {errors.root?.message ? <div className={styles.authError}>{errors.root.message}</div> : null}

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? TEXT.auth.submitting : mode === 'login' ? TEXT.auth.login : TEXT.auth.register}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onSwitchMode}>
            {mode === 'login' ? TEXT.auth.goRegister : TEXT.auth.goLogin}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
