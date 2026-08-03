import create from 'zustand';
import { request } from '../api';

type User = { id: string; email: string; name: string } | null;

interface AuthState {
  token: string | null;
  user: User;
  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
  setToken: (t) => {
    if (typeof window !== 'undefined') {
      if (t) localStorage.setItem('token', t);
      else localStorage.removeItem('token');
    }
    set({ token: t });
  },
  setUser: (u) => set({ user: u }),
  login: async (email, password) => {
    const res = await request<any>({ method: 'POST', url: '/auth/login', data: { email, password } });
    const token = res?.token;
    const user = res?.user ?? null;
    if (!token) throw new Error('没有收到 token');
    get().setToken(token);
    get().setUser(user);
  },
  register: async (name, email, password) => {
    const res = await request<any>({ method: 'POST', url: '/auth/register', data: { name, email, password } });
    const token = res?.token;
    const user = res?.user ?? null;
    if (!token) throw new Error('没有收到 token');
    get().setToken(token);
    get().setUser(user);
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    set({ token: null, user: null });
  },
}));

export default useAuth;
