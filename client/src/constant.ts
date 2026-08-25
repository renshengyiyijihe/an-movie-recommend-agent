/**
 * 前端常量与界面文案。组件与 store 不要再写用户可见的中文句子。
 */
import {
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
  ERROR_CODE,
  STREAM_STAGE,
} from "@an-movie/contracts";

export { AUTH_PASSWORD_MIN_LENGTH, AUTH_USERNAME_MIN_LENGTH };

/** 浏览器请求路径。Vite / Docker nginx 都从站点根反代。 */
export const API_PATH = {
  recommend: "/api/movie/recommend",
} as const;

/** 与 axios 实例相同的等待上限，recommend 流式也用。 */
export const HTTP_CONSTANTS = {
  REQUEST_TIMEOUT_MS: 1000 * 300,
} as const;

/** localStorage 里 JWT 的键。 */
export const AUTH_STORAGE_KEY = {
  TOKEN: "token",
} as const;

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
    requestFailed: "请求失败",
  },
  /** 聊天角色标签 */
  chat: {
    userRole: "你",
    assistantRole: "智能体",
    assistantErrorRole: "智能体（异常）",
  },
  /** 推荐请求与流式阶段 */
  recommend: {
    sending: "发送中...",
    send: "发送",
    stagePending: "正在处理你的请求",
    stageToolFailed: "检索未成功，继续处理",
    stages: {
      [STREAM_STAGE.INTENT]: "正在判断是否与电影相关",
      [STREAM_STAGE.PLAN]: "正在规划检索任务",
      [STREAM_STAGE.TOOL]: "正在检索影片信息",
      [STREAM_STAGE.AGENT]: "检索完成，正在继续处理",
    },
    requestFailed: "请求后端失败，请检查服务是否启动",
    requestFailedBubble: "请求失败，请稍后再试。",
    streamIncomplete: "连接中断，请稍后重试。",
    timeout: "请求超时，请稍后重试。",
  },
} as const;
