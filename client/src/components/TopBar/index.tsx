import useAuth from '@/store/auth';
import AppLogo from '@/components/AppLogo';
import { TEXT } from '@/constant';
import History from '@mui/icons-material/History';
import styles from './index.module.less';

interface Props {
  onOpenHistory: () => void;
  onOpenConfig: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export default function TopBar({
  onOpenHistory,
  onOpenConfig,
  onOpenLogin,
  onOpenRegister,
}: Props) {
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
        {token ? (
          <>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={onOpenHistory}
              aria-label={TEXT.workspace.openHistory}
            >
              <History className={styles.actionIcon} fontSize="small" />
              {TEXT.workspace.historyTitle}
            </button>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={onOpenConfig}
              aria-label={TEXT.config.openAria}
            >
              {TEXT.config.open}
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
