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
  chat: "/api/movie/chat",
  conversations: "/api/message/conversations",
} as const;

/** 工作台布局，与 HomePage / TopBar 的 `@media` 保持同一套数字。 */
export const LAYOUT = {
  SIDEBAR_WIDTH_PX: 280,
  NARROW_MAX_PX: 760,
} as const;

/**
 * 单条会话详情的 REST 路径。
 *
 * @param conversationId 会话 id
 * @returns `/api/message/conversations/{id}`，id 会做 URL 编码
 * @example
 * conversationDetailPath("a1b2-c3") // "/api/message/conversations/a1b2-c3"
 */
export function conversationDetailPath(conversationId: string): string {
  return `${API_PATH.conversations}/${encodeURIComponent(conversationId)}`;
}

/** 与 axios 实例相同的等待上限，chat 流式也用。 */
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
    confirmPassword: "确认密码",
    usernamePlaceholder: "取一个好记的用户名",
    emailPlaceholder: "name@example.com",
    passwordPlaceholder: `至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    confirmPasswordPlaceholder: "再输入一次密码",
    submitting: "处理中...",
    emailRequired: "请输入邮箱",
    emailInvalid: "请输入有效的邮箱格式",
    usernameRequired: "请输入用户名",
    usernameMin: `用户名至少 ${AUTH_USERNAME_MIN_LENGTH} 个字符`,
    passwordRequired: "请输入密码",
    passwordMin: `密码至少 ${AUTH_PASSWORD_MIN_LENGTH} 位`,
    confirmPasswordRequired: "请再次输入密码",
    passwordMismatch: "两次输入的密码不一致",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    showConfirmPassword: "显示确认密码",
    hideConfirmPassword: "隐藏确认密码",
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
  /** 聊天角色、发送与流式阶段 */
  chat: {
    userRole: "你",
    assistantRole: "智能体",
    assistantErrorRole: "智能体（异常）",
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
  /** 左侧会话工作台 */
  workspace: {
    title: "会话",
    newConversation: "新对话",
    newConversationAria: "开始新对话",
    openSidebarAria: "打开会话列表",
    listAria: "会话列表",
    loading: "加载会话列表中...",
    empty: "暂无会话，发送消息后会自动生成。",
    untitled: "会话",
    guestHint: "登录后可查看和切换历史会话。",
    loginToView: "登录后查看会话",
    retry: "重试",
    loadFailed: "会话列表加载失败",
    detailFailed: "无法打开该会话，请稍后重试。",
    waitUntilIdle: "请等待当前回复完成后再切换会话。",
    switching: "正在加载会话...",
  },
} as const;
