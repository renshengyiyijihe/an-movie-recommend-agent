import create from 'zustand';

/** Toast 严重级别，对齐 MUI Alert `severity`。 */
export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
  /** 每次弹出递增，用来强制 Snackbar 重新播动画。 */
  id: number;
  show: (message: string, severity?: ToastSeverity) => void;
  close: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  open: false,
  message: '',
  severity: 'success',
  id: 0,
  show: (message, severity = 'success') =>
    set((state) => ({ open: true, message, severity, id: state.id + 1 })),
  close: () => set({ open: false }),
}));

/** 任意层都可以调用的轻量 toast，不依赖 React 组件树。 */
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
  warning: (message: string) => useToastStore.getState().show(message, 'warning'),
};
