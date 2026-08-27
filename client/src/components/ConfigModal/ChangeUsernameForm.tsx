import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import AuthField from '@/components/AuthField';
import { ApiError, isSessionExpiredError } from '@/api';
import { AUTH_USERNAME_MAX_LENGTH, AUTH_USERNAME_MIN_LENGTH, TEXT } from '@/constant';
import useAuth from '@/store/auth';
import styles from './index.module.less';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
}

interface ChangeUsernameValues {
  username: string;
  confirmUsername: string;
}

function formatChangeUsernameError(err: unknown): string {
  if (err instanceof ApiError && err.code && err.code in TEXT.errors) {
    return TEXT.errors[err.code as keyof typeof TEXT.errors];
  }
  if (err instanceof Error && err.message) return err.message;
  return TEXT.auth.genericError;
}

export default function ChangeUsernameForm({ visible, onClose, onSessionExpired }: Props) {
  const currentUsername = useAuth((s) => s.user?.username ?? '');
  const changeUsername = useAuth((s) => s.changeUsername);
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangeUsernameValues>({
    defaultValues: {
      username: '',
      confirmUsername: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  async function onSubmit(values: ChangeUsernameValues) {
    const username = values.username.trim();
    if (username === currentUsername) {
      setError('username', { message: TEXT.auth.usernameUnchanged });
      return;
    }

    try {
      await changeUsername(username);
      onClose();
    } catch (err) {
      if (isSessionExpiredError(err)) {
        onSessionExpired();
        return;
      }
      setError('root', { message: formatChangeUsernameError(err) });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onChange={() => clearErrors('root')}
      className={styles.passwordForm}
    >
      <AuthField
        control={control}
        name="username"
        label={TEXT.auth.newUsername}
        autoComplete="username"
        autoFocus
        placeholder={TEXT.auth.usernamePlaceholder}
        onAfterChange={() => {
          void trigger('confirmUsername');
        }}
        rules={{
          validate: (value) => {
            const username = value.trim();
            if (!username) return TEXT.auth.newUsernameRequired;
            if (username.length < AUTH_USERNAME_MIN_LENGTH) return TEXT.auth.usernameMin;
            if (username.length > AUTH_USERNAME_MAX_LENGTH) return TEXT.auth.usernameMax;
            if (username === currentUsername) return TEXT.auth.usernameUnchanged;
            return true;
          },
        }}
      />

      <AuthField
        control={control}
        name="confirmUsername"
        label={TEXT.auth.confirmNewUsername}
        autoComplete="username"
        placeholder={TEXT.auth.confirmNewUsernamePlaceholder}
        rules={{
          validate: (value, formValues) => {
            if (!value.trim()) return TEXT.auth.confirmNewUsernameRequired;
            if (value.trim() !== formValues.username.trim()) return TEXT.auth.usernameMismatch;
            return true;
          },
        }}
      />

      {errors.root?.message ? <div className={styles.formError}>{errors.root.message}</div> : null}

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
          {isSubmitting ? TEXT.auth.submitting : TEXT.config.submitUsername}
        </button>
      </div>
    </form>
  );
}
