import useAuth from '../../store/auth';
import AppLogo from '../AppLogo';
import styles from './index.module.less';

interface Props {
  onOpenConfig: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export default function TopBar({ onOpenConfig, onOpenLogin, onOpenRegister }: Props) {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarTitle}>
        <AppLogo className={styles.topBarIcon} size={24} />
        <span>An-movie</span>
      </div>
      <div className={styles.topBarActions} role="toolbar">
        <button className={styles.btnSecondary} type="button" onClick={onOpenConfig} aria-label="打开配置">
          ⚙ 配置
        </button>
        {token ? (
          <>
            <div className={styles.userPill} aria-label="当前登录用户">
              <span className={styles.userPillName}>{user?.username ?? '用户'}</span>
            </div>
            <button className={styles.btnLogout} onClick={() => logout()} aria-label="登出">
              登出
            </button>
          </>
        ) : (
          <>
            <button className={styles.btnOutline} onClick={onOpenLogin}>登录</button>
            <button className={styles.btnPrimary} onClick={onOpenRegister}>注册</button>
          </>
        )}
      </div>
    </div>
  );
}
