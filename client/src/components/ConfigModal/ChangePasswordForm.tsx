import { useForm } from 'react-hook-form';
import AuthField from '@/components/AuthField';
import { ERROR_CODE } from '@an-movie/contracts';
import { ApiError, isSessionExpiredError } from '@/api';
import { AUTH_PASSWORD_MIN_LENGTH, TEXT } from '@/constant';
import useAuth from '@/store/auth';
import styles from './index.module.less';

interface Props {
  onClose: () => void;
}

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function formatChangePasswordError(err: unknown): string {
  if (err instanceof ApiError && err.code === ERROR_CODE.INVALID_CREDENTIALS) {
    return TEXT.auth.currentPasswordWrong;
  }
  if (err instanceof ApiError && err.code && err.code in TEXT.errors) {
    return TEXT.errors[err.code as keyof typeof TEXT.errors];
  }
  if (err instanceof Error && err.message) return err.message;
  return TEXT.auth.genericError;
}

export default function ChangePasswordForm({ onClose }: Props) {
  const user = useAuth((s) => s.user);
  const changePassword = useAuth((s) => s.changePassword);
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  async function onSubmit(values: ChangePasswordValues) {
    const currentPassword = values.currentPassword.trim();
    const newPassword = values.newPassword.trim();
    if (newPassword === currentPassword) {
      setError('newPassword', { message: TEXT.auth.passwordUnchanged });
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      reset();
    } catch (err) {
      if (isSessionExpiredError(err)) {
        onClose();
        return;
      }
      if (err instanceof ApiError && err.code === ERROR_CODE.INVALID_CREDENTIALS) {
        setError('currentPassword', { message: TEXT.auth.currentPasswordWrong });
        return;
      }
      setError('root', { message: formatChangePasswordError(err) });
    }
  }

  return (
    <div className={styles.accountPane}>
      {user ? (
        <dl className={styles.accountIdentity}>
          <div>
            <dt>{TEXT.config.usernameLabel}</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>{TEXT.config.emailLabel}</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      ) : null}

      <h4 className={styles.accountSectionTitle}>{TEXT.config.changePassword}</h4>
      <p className={styles.accountHint}>{TEXT.config.changePasswordHint}</p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        onChange={() => clearErrors('root')}
        className={styles.passwordForm}
      >
        <AuthField
          control={control}
          name="currentPassword"
          label={TEXT.auth.currentPassword}
          autoComplete="current-password"
          autoFocus
          placeholder={TEXT.auth.currentPasswordPlaceholder}
          passwordToggle
          showPasswordLabel={TEXT.auth.showCurrentPassword}
          hidePasswordLabel={TEXT.auth.hideCurrentPassword}
          rules={{
            required: TEXT.auth.currentPasswordRequired,
            minLength: {
              value: AUTH_PASSWORD_MIN_LENGTH,
              message: TEXT.auth.passwordMin,
            },
          }}
        />

        <AuthField
          control={control}
          name="newPassword"
          label={TEXT.auth.newPassword}
          autoComplete="new-password"
          placeholder={TEXT.auth.passwordPlaceholder}
          passwordToggle
          showPasswordLabel={TEXT.auth.showNewPassword}
          hidePasswordLabel={TEXT.auth.hideNewPassword}
          onAfterChange={() => {
            void trigger('confirmPassword');
          }}
          rules={{
            required: TEXT.auth.newPasswordRequired,
            minLength: {
              value: AUTH_PASSWORD_MIN_LENGTH,
              message: TEXT.auth.passwordMin,
            },
            validate: (value, formValues) => {
              if (value && value === formValues.currentPassword) {
                return TEXT.auth.passwordUnchanged;
              }
              return true;
            },
          }}
        />

        <AuthField
          control={control}
          name="confirmPassword"
          label={TEXT.auth.confirmNewPassword}
          autoComplete="new-password"
          placeholder={TEXT.auth.confirmNewPasswordPlaceholder}
          passwordToggle
          showPasswordLabel={TEXT.auth.showConfirmNewPassword}
          hidePasswordLabel={TEXT.auth.hideConfirmNewPassword}
          rules={{
            validate: (value, formValues) => {
              if (!value) return TEXT.auth.confirmNewPasswordRequired;
              if (value !== formValues.newPassword) return TEXT.auth.passwordMismatch;
              return true;
            },
          }}
        />

        {errors.root?.message ? <div className={styles.formError}>{errors.root.message}</div> : null}

        <div className={styles.formActions}>
          <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? TEXT.auth.submitting : TEXT.config.submitPassword}
          </button>
        </div>
      </form>
    </div>
  );
}
