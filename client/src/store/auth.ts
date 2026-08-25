import create from 'zustand';
import { request } from '@/api';
import { AUTH_STORAGE_KEY, TEXT } from '@/constant';
import { toast } from '@/store/toast';

type User = { id: string; email: string; username: string } | null;

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

interface AuthState {
  token: string | null;
  user: User;
  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
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
      const res = await request<any>({ method: 'POST', url: '/api/auth/login', data: { email, password } });
      const token = res?.token;
      const user = res?.user ?? null;
      if (!token) throw new Error(TEXT.auth.missingToken);
      get().setToken(token);
      get().setUser(user ? { ...user, username: user.username ?? user.name ?? user.email } : decodeToken(token));
      toast.success(TEXT.auth.loginSuccess);
    },
    register: async (username, email, password) => {
      await request({ method: 'POST', url: '/api/auth/register', data: { username, email, password } });
      toast.success(TEXT.auth.registerSuccess);
    },
    logout: (options) => {
      if (typeof window !== 'undefined') localStorage.removeItem(AUTH_STORAGE_KEY.TOKEN);
      set({ token: null, user: null });
      if (!options?.silent) toast.success(TEXT.auth.logoutSuccess);
    },
  };
});

export default useAuth;
