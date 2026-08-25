/**
 * 前端常量与界面文案。组件与 store 不要再写用户可见的中文句子。
 */
import {
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
  ERROR_CODE,
} from "@an-movie/contracts";

export { AUTH_PASSWORD_MIN_LENGTH, AUTH_USERNAME_MIN_LENGTH };

/** 界面文案，按模块分组。 */
export const TEXT = {
  /** 登录 / 注册 / 登出 */
  auth: {
    login: "登录",
    register: "注册",
    logout: "登出",
    logoutAria: "登出",
    goRegister: "去注册",
    goLogin: "去登录",
    username: "用户名",
    email: "邮箱",
    password: "密码",
    usernamePlaceholder: "取一个好记的用户名",
    emailPlaceholder: "name@example.com",
    passwordPlaceholder: `至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    submitting: "处理中...",
    emailRequired: "请输入邮箱",
    emailInvalid: "请输入有效的邮箱格式",
    usernameRequired: "请输入用户名",
    usernameMin: `用户名至少 ${AUTH_USERNAME_MIN_LENGTH} 个字符`,
    passwordRequired: "请输入密码",
    passwordMin: `密码至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    genericError: "发生错误",
    missingToken: "没有收到 token",
    loginSuccess: "登录成功",
    registerSuccess: "注册成功，请登录",
    logoutSuccess: "已退出登录",
    sessionExpired: "登录已过期，请重新登录",
    userFallback: "用户",
    currentUserAria: "当前登录用户",
    closeDialog: "关闭",
  },
  errors: {
    [ERROR_CODE.UNAUTHORIZED]: "未授权，请先登录",
    [ERROR_CODE.INVALID_CREDENTIALS]: "邮箱或密码错误",
    [ERROR_CODE.EMAIL_EXISTS]: "该邮箱已注册",
    [ERROR_CODE.VALIDATION_FAILED]: "提交内容不合法",
    [ERROR_CODE.NOT_FOUND]: "资源不存在",
    [ERROR_CODE.INTERNAL_ERROR]: "服务暂时不可用",
  },
  /** 全局兜底 UI */
  app: {
    crashTitle: "页面出错了",
    crashHint: "请刷新页面重试。",
    reload: "刷新页面",
  },
} as const;
