/**
 * 前端常量与界面文案。组件与 store 不要再写用户可见的中文句子。
 */

/** 注册 / 登录密码最短长度，与后端 DTO 校验对齐。 */
export const AUTH_PASSWORD_MIN_LENGTH = 6;

/** 界面文案，按模块分组。 */
export const TEXT = {
  /** 登录 / 注册 / 登出 */
  auth: {
    login: '登录',
    register: '注册',
    logout: '登出',
    logoutAria: '登出',
    goRegister: '去注册',
    goLogin: '去登录',
    username: '用户名',
    email: '邮箱',
    password: '密码',
    usernamePlaceholder: '取一个好记的用户名',
    emailPlaceholder: 'name@example.com',
    passwordPlaceholder: `至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    submitting: '处理中...',
    emailRequired: '请输入邮箱',
    emailInvalid: '请输入有效的邮箱格式',
    usernameRequired: '请输入用户名',
    passwordRequired: '请输入密码',
    passwordMin: `密码至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    genericError: '发生错误',
    missingToken: '没有收到 token',
    loginSuccess: '登录成功',
    registerSuccess: '注册成功，请登录',
    logoutSuccess: '已退出登录',
    sessionExpired: '登录已过期，请重新登录',
    userFallback: '用户',
    currentUserAria: '当前登录用户',
    unauthorizedHint: '未授权',
    loginRequiredHint: '请先登录',
  },
} as const;
