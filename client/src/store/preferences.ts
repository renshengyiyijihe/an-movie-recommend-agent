import create from "zustand";

/**
 * 用户本地偏好：存在这台浏览器里，不跟账号走。
 * 当前没有界面字段；加开关时在这里读写 `PREFERENCES_STORAGE_KEY.ALL`。
 * 会话列表不要放这里。
 */
export const usePreferences = create<object>(() => ({}));

export default usePreferences;
