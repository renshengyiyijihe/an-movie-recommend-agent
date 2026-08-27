import create from 'zustand';
import { isSessionExpiredError, request } from '@/api';
import { API_PATH, AUTH_STORAGE_KEY, TEXT } from '@/constant';
import { toast } from '@/store/toast';

type User = { id: string; email: string; username: string } | null;

type AuthSessionResponse = {
  token?: string;
  user?: { id: string; email: string; username?: string; name?: string };
};

function decodeToken(token: string | null): User {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.username ?? decoded.name ?? decoded.email,
    };
  } catch {
    return null;
  }
}

function applyAuthSession(
  api: { setToken: (t: string | null) => void; setUser: (u: User) => void },
  res: AuthSessionResponse,
) {
  const token = res?.token;
  if (!token) throw new Error(TEXT.auth.missingToken);
  const user = res.user;
  api.setToken(token);
  api.setUser(
    user
      ? { id: user.id, email: user.email, username: user.username ?? user.name ?? user.email }
      : decodeToken(token),
  );
}

interface AuthState {
  token: string | null;
  user: User;
  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /**
   * @param options.silent 为 true 时不弹出登出成功提示（例如 token 失效被强制清登录态）。
   */
  logout: (options?: { silent?: boolean }) => void;
}

export const useAuth = create<AuthState>((set, get) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_STORAGE_KEY.TOKEN) : null;
  return {
    token,
    user: decodeToken(token),
    setToken: (t) => {
      if (typeof window !== 'undefined') {
        if (t) localStorage.setItem(AUTH_STORAGE_KEY.TOKEN, t);
        else localStorage.removeItem(AUTH_STORAGE_KEY.TOKEN);
      }
      set({ token: t, user: decodeToken(t) });
    },
    setUser: (u) => set({ user: u }),
    login: async (email, password) => {
      const res = await request<AuthSessionResponse>({
        method: 'POST',
        url: API_PATH.login,
        data: { email, password },
      });
      applyAuthSession(get(), res);
      toast.success(TEXT.auth.loginSuccess);
    },
    register: async (username, email, password) => {
      await request({ method: 'POST', url: API_PATH.register, data: { username, email, password } });
      toast.success(TEXT.auth.registerSuccess);
    },
    changePassword: async (currentPassword, newPassword) => {
      try {
        const res = await request<AuthSessionResponse>({
          method: 'POST',
          url: API_PATH.changePassword,
          data: { currentPassword, newPassword },
        });
        applyAuthSession(get(), res);
        toast.success(TEXT.auth.changePasswordSuccess);
      } catch (error) {
        if (isSessionExpiredError(error)) {
          get().logout({ silent: true });
          toast.info(TEXT.auth.sessionExpired);
        }
        throw error;
      }
    },
    logout: (options) => {
      if (typeof window !== 'undefined') localStorage.removeItem(AUTH_STORAGE_KEY.TOKEN);
      set({ token: null, user: null });
      if (!options?.silent) toast.success(TEXT.auth.logoutSuccess);
    },
  };
});

export default useAuth;
