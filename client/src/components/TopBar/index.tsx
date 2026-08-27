import useAuth from '@/store/auth';
import AppLogo from '@/components/AppLogo';
import { TEXT } from '@/constant';
import Menu from '@mui/icons-material/Menu';
import Tooltip from '@mui/material/Tooltip';
import styles from './index.module.less';

interface Props {
  onOpenConfig: () => void;
  /** 仅窄屏渲染顶栏入口时会用到。 */
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  showSidebarToggle: boolean;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export default function TopBar({
  onOpenConfig,
  onToggleSidebar,
  sidebarOpen,
  showSidebarToggle,
  onOpenLogin,
  onOpenRegister,
}: Props) {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const sidebarToggleLabel = sidebarOpen
    ? TEXT.workspace.closeSidebar
    : TEXT.workspace.openSidebar;

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarTitle}>
        {showSidebarToggle ? (
          <Tooltip title={sidebarToggleLabel}>
            <button
              className={`${styles.sidebarToggle} ${sidebarOpen ? styles.sidebarToggleActive : ''}`}
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarToggleLabel}
              aria-pressed={sidebarOpen}
              aria-expanded={sidebarOpen}
            >
              <Menu />
            </button>
          </Tooltip>
        ) : null}
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
