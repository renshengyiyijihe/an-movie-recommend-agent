import create from 'zustand';
import { PREFERENCES_STORAGE_KEY } from '@/constant';

/** 写入 localStorage 的偏好。后续本机选择往这里加字段，不要另开键。 */
interface PersistedPreferences {
  /** 桌面会话栏是否收起到图标轨。窄屏抽屉开合不持久化。 */
  sidebarCollapsed: boolean;
}

const DEFAULTS: PersistedPreferences = {
  sidebarCollapsed: false,
};

/**
 * 从 localStorage 读用户本地偏好。
 *
 * @returns 当前偏好；没有记录或读失败时为默认值
 * @example
 * // {"sidebarCollapsed":true} → { sidebarCollapsed: true }
 */
function loadPreferences(): PersistedPreferences {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY.ALL);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULTS };
    }
    const record = parsed as Record<string, unknown>;
    return { sidebarCollapsed: record.sidebarCollapsed === true };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * 把用户本地偏好写回 localStorage。
 *
 * @param preferences 整包偏好
 * @example
 * savePreferences({ sidebarCollapsed: true })
 */
function savePreferences(preferences: PersistedPreferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY.ALL,
      JSON.stringify(preferences),
    );
  } catch {
    /* private mode / quota */
  }
}

interface PreferencesState extends PersistedPreferences {
  /**
   * 写入并持久化桌面侧栏折叠。
   *
   * @param collapsed 是否收起到图标轨
   */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 切换桌面侧栏折叠并持久化。 */
  toggleSidebarCollapsed: () => void;
}

/**
 * 用户本地偏好：存在这台浏览器里，不跟账号走。
 * 不限于界面开关；侧栏折叠只是其中一项。会话列表不要放这里。
 */
export const usePreferences = create<PreferencesState>((set, get) => ({
  ...loadPreferences(),
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed });
    savePreferences({ sidebarCollapsed });
  },
  toggleSidebarCollapsed: () => {
    const sidebarCollapsed = !get().sidebarCollapsed;
    set({ sidebarCollapsed });
    savePreferences({ sidebarCollapsed });
  },
}));

export default usePreferences;
