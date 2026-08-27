import useAuth from '@/store/auth';
import { TEXT } from '@/constant';
import styles from './index.module.less';

interface Props {
  onChangeUsername: () => void;
  onChangePassword: () => void;
}

export default function AccountPane({ onChangeUsername, onChangePassword }: Props) {
  const user = useAuth((s) => s.user);

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

      <div className={styles.accountActions}>
        <button type="button" className={styles.accountAction} onClick={onChangeUsername}>
          {TEXT.config.changeUsername}
        </button>
        <button type="button" className={styles.accountAction} onClick={onChangePassword}>
          {TEXT.config.changePassword}
        </button>
      </div>
    </div>
  );
}
