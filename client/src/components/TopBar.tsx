import useAuth from '../store/auth';
import AppLogo from './AppLogo';

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
    <div className="top-bar">
      <div className="top-bar__title">
        <AppLogo className="top-bar__icon" size={24} />
        <span>An-movie</span>
      </div>
      <div className="top-bar__actions" role="toolbar">
        <button className="btn-secondary" type="button" onClick={onOpenConfig} aria-label="打开配置">⚙ 配置</button>
        {token ? (
          <>
            <div className="user-pill" aria-label="当前登录用户">
              <span className="user-pill__name">{user?.username ?? '用户'}</span>
            </div>
            <button className="btn-logout" onClick={() => logout()} aria-label="登出">登出</button>
          </>
        ) : (
          <>
            <button className="btn-outline" onClick={onOpenLogin}>登录</button>
            <button className="btn-primary" onClick={onOpenRegister}>注册</button>
          </>
        )}
      </div>
    </div>
  );
}
