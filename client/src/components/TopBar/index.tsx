import useAuth from '@/store/auth';
import AppLogo from '@/components/AppLogo';
import { TEXT } from '@/constant';
import styles from './index.module.less';

interface Props {
  onOpenConfig: () => void;
  onOpenSidebar: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export default function TopBar({
  onOpenConfig,
  onOpenSidebar,
  onOpenLogin,
  onOpenRegister,
}: Props) {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarTitle}>
        <button
          className={styles.sidebarToggle}
          type="button"
          onClick={onOpenSidebar}
          aria-label={TEXT.workspace.openSidebarAria}
        >
          {TEXT.workspace.title}
        </button>
        <AppLogo className={styles.topBarIcon} size={24} />
        <span>An-movie</span>
      </div>
      <div className={styles.topBarActions} role="toolbar">
        {token ? (
          <>
            <button className={styles.btnSecondary} type="button" onClick={onOpenConfig} aria-label="打开配置">
              ⚙ 配置
            </button>
            <div className={styles.userPill} aria-label={TEXT.auth.currentUserAria}>
              <span className={styles.userPillName}>{user?.username ?? TEXT.auth.userFallback}</span>
            </div>
            <button className={styles.btnLogout} onClick={() => logout()} aria-label={TEXT.auth.logoutAria}>
              {TEXT.auth.logout}
            </button>
          </>
        ) : (
          <>
            <button className={styles.btnOutline} onClick={onOpenLogin}>{TEXT.auth.login}</button>
            <button className={styles.btnPrimary} onClick={onOpenRegister}>{TEXT.auth.register}</button>
          </>
        )}
      </div>
    </div>
  );
}
