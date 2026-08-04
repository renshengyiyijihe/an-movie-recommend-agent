import create from 'zustand';
import { request } from '../api';

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
  logout: () => void;
}

export const useAuth = create<AuthState>((set, get) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    token,
    user: decodeToken(token),
    setToken: (t) => {
      if (typeof window !== 'undefined') {
        if (t) localStorage.setItem('token', t);
        else localStorage.removeItem('token');
      }
      set({ token: t, user: decodeToken(t) });
    },
    setUser: (u) => set({ user: u }),
    login: async (email, password) => {
      const res = await request<any>({ method: 'POST', url: '/api/auth/login', data: { email, password } });
      const token = res?.token;
      const user = res?.user ?? null;
      if (!token) throw new Error('没有收到 token');
      get().setToken(token);
      get().setUser(user ? { ...user, username: user.username ?? user.name ?? user.email } : decodeToken(token));
    },
    register: async (username, email, password) => {
      const res = await request<any>({ method: 'POST', url: '/api/auth/register', data: { username, email, password } });
      const token = res?.token;
      const user = res?.user ?? null;
      if (!token) throw new Error('没有收到 token');
      get().setToken(token);
      get().setUser(user ? { ...user, username: user.username ?? user.name ?? user.email } : decodeToken(token));
    },
    logout: () => {
      if (typeof window !== 'undefined') localStorage.removeItem('token');
      set({ token: null, user: null });
    },
  };
});

export default useAuth;
