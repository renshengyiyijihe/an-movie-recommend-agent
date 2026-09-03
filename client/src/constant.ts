/**
 * 前端常量与界面文案。组件与 store 不要再写用户可见的中文句子。
 */
import {
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
  CONVERSATION_PAGE,
  CONVERSATION_TITLE_MAX_LENGTH,
  ERROR_CODE,
  STREAM_STAGE,
} from "@an-movie/contracts";

export {
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
  CONVERSATION_PAGE,
  CONVERSATION_TITLE_MAX_LENGTH,
};

/**
 * 浏览器地址栏路由。当前会话写在 URL 上，刷新 / 分享 / 前进后退都靠它。
 * 新对话停在 {@link ROUTE.home}，会话建好后再换成 {@link ROUTE.chatDetail}。
 */
export const ROUTE = {
  /** 新对话，尚未创建会话 */
  home: "/",
  /** 已有会话；`:conversationId` 与后端 `conversation_id` 同一个值 */
  chatDetail: "/chat/:conversationId",
} as const;

/**
 * 某个会话的页面地址。
 *
 * @param conversationId 会话 id
 * @returns `/chat/{id}`，id 会做 URL 编码
 * @example
 * chatRoutePath("a1b2-c3") // "/chat/a1b2-c3"
 */
export function chatRoutePath(conversationId: string): string {
  return `/chat/${encodeURIComponent(conversationId)}`;
}

/** 浏览器请求路径。Vite / Docker nginx 都从站点根反代。 */
export const API_PATH = {
  chat: "/api/movie/chat",
  chatCancel: "/api/movie/chat/cancel",
  conversations: "/api/message/conversations",
  login: "/api/auth/login",
  register: "/api/auth/register",
  changePassword: "/api/auth/password",
  changeUsername: "/api/auth/username",
} as const;

/** 窄屏断点，与历史弹窗 / 主聊天 `@media` 保持同一套数字。 */
export const LAYOUT = {
  NARROW_MAX_PX: 760,
} as const;

/** 用户本地偏好 JSON 的 localStorage 键。不要和 token 混在一起。 */
export const PREFERENCES_STORAGE_KEY = {
  ALL: "an-movie-preferences",
} as const;

/**
 * 单条会话详情的 REST 路径。不传 `page` 时后端按默认页大小给最近一页。
 *
 * @param conversationId 会话 id
 * @param page 翻页参数：`limit` 一页条数，`before` 上一页回传的游标
 * @returns `/api/message/conversations/{id}` 加可选 query，id 会做 URL 编码
 * @example
 * conversationDetailPath("a1b2-c3", { limit: 20, before: "MjAyNi0w" })
 * // "/api/message/conversations/a1b2-c3?limit=20&before=MjAyNi0w"
 */
export function conversationDetailPath(
  conversationId: string,
  page?: { limit?: number; before?: string },
): string {
  const base = `${API_PATH.conversations}/${encodeURIComponent(conversationId)}`;
  const query = new URLSearchParams();
  if (page?.limit) query.set("limit", String(page.limit));
  if (page?.before) query.set("before", page.before);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
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
    usernameMax: `用户名最多 ${AUTH_USERNAME_MAX_LENGTH} 个字符`,
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
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmNewPassword: "确认新密码",
    currentPasswordPlaceholder: "输入当前密码",
    confirmNewPasswordPlaceholder: "再输入一次新密码",
    currentPasswordRequired: "请输入当前密码",
    newPasswordRequired: "请输入新密码",
    confirmNewPasswordRequired: "请再次输入新密码",
    currentPasswordWrong: "当前密码错误",
    passwordUnchanged: "新密码不能与当前密码相同",
    showCurrentPassword: "显示当前密码",
    hideCurrentPassword: "隐藏当前密码",
    showNewPassword: "显示新密码",
    hideNewPassword: "隐藏新密码",
    showConfirmNewPassword: "显示确认新密码",
    hideConfirmNewPassword: "隐藏确认新密码",
    changePasswordSuccess: "密码已更新",
    changeUsernameSuccess: "用户名已更新",
    closeDialog: "关闭",
  },
  /** 顶栏配置弹窗 */
  config: {
    title: "配置",
    open: "⚙ 配置",
    openAria: "打开配置",
    description: "管理账号资料。",
    closeAria: "关闭配置窗口",
    navAria: "配置目录",
    accountNav: "帐户",
    usernameLabel: "用户名",
    emailLabel: "邮箱",
    editUsernameAria: "编辑用户名",
    confirmUsername: "确定修改用户名？",
    confirmUsernameAction: "确认",
    cancelUsername: "取消",
    usernameSaveFailed: "无法保存用户名，请稍后重试。",
    changePassword: "修改密码",
    changePasswordHint: "修改成功后仍保持登录。",
    submitPassword: "保存新密码",
    closeChangePasswordAria: "关闭修改密码",
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
    assistantCancelledRole: "智能体（已停止）",
    send: "发送",
    stop: "停止",
    stopping: "正在停止...",
    cancelFailed: "无法停止生成，请稍后重试。",
    cancelled: "已停止生成",
    stagePending: "正在处理你的请求",
    stageToolFailed: "检索未成功，继续处理",
    stages: {
      [STREAM_STAGE.INTENT]: "正在判断是否与电影相关",
      [STREAM_STAGE.PLAN]: "正在规划检索任务",
      [STREAM_STAGE.TOOL_CALL]: "正在检索影片信息",
      [STREAM_STAGE.AGENT_RESULT]: "检索完成，正在继续处理",
    },
    requestFailedBubble: "请求失败，请稍后再试。",
    streamIncomplete: "连接中断，请稍后重试。",
    timeout: "请求超时，请稍后重试。",
    posterLoading: "海报加载中",
    posterUnavailable: "暂无海报",
    heroTitle: "为你挑选你喜欢的电影",
    heroSubtitle: "说出你的口味、风格和观影需求，马上帮你推荐合适影片。",
    emptyTitle: "从一句简单的话开始",
    emptyHint: "比如“想看一部剧情片，时长2小时以内，最好有温情结局”。",
    composerPlaceholder:
      "输入你的观影偏好、类型或心情，比如：想看科幻片，2小时以内，有精彩视觉效果。",
    uploadImage: "📷 上传图片（可选）",
    imagePreviewAlt: "图片预览",
    quickPrompts: [
      "想看一部科幻大片，时长2小时以内",
      "想要轻松爱情片，适合晚上放松",
      "推荐几部张力强、节奏快的动作片",
    ],
  },
  /** 历史弹窗与「新对话」相关文案 */
  workspace: {
    historyTitle: "历史记录",
    openHistory: "打开历史记录",
    closeHistory: "关闭历史记录",
    newConversation: "新对话",
    newConversationAria: "开始新对话",
    listAria: "会话列表",
    loading: "加载会话列表中...",
    empty: "暂无会话，发送消息后会自动生成。",
    untitled: "会话",
    retry: "重试",
    loadFailed: "会话列表加载失败",
    detailFailed: "无法打开该会话，请稍后重试。",
    detailLoading: "加载会话详情中...",
    conversationMissing: "会话不存在或已被删除。",
    loadingEarlier: "正在加载更早的消息...",
    historyStart: "已经是最早的消息",
    historyLoadFailed: "加载更早的消息失败，向上滚动可重试。",
    pickHint: "选择一条会话查看消息",
    emptyMessages: "该会话还没有消息。",
    backToList: "返回列表",
    currentConversation: "当前",
    waitUntilIdle: "请等待当前回复完成后再开始新对话。",
    editTitleAria: "编辑会话标题",
    editTitleHint: "点击编辑标题",
    titleEditNeedLogin: "登录后才能修改标题",
    titleEditPending: "会话尚未保存，稍后再改标题",
    titleTooLong: `标题最多 ${CONVERSATION_TITLE_MAX_LENGTH} 个字符`,
    titleSaveFailed: "无法保存标题，请稍后重试。",
    confirmRename: "确定修改会话标题？",
    confirmRenameAction: "确认",
    cancelRename: "取消",
  },
} as const;
