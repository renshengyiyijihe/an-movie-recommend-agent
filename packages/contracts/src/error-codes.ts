/**
 * HTTP 业务错误码。前端用 `code` 做控制流，`message` 只展示。
 */
export const ERROR_CODE = {
  /** 无 token 或验票失败 */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** 登录失败（用户不存在与密码错误用同一码） */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** 注册时邮箱已被占用 */
  EMAIL_EXISTS: "EMAIL_EXISTS",
  /** DTO / ValidationPipe 失败 */
  VALIDATION_FAILED: "VALIDATION_FAILED",
  /** 会话等资源不存在或无权访问 */
  NOT_FOUND: "NOT_FOUND",
  /** 未分类的服务端错误 */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** 后端异常过滤器返回给浏览器的 JSON。 */
export interface ErrorResponseBody {
  /** 稳定错误码 */
  code: ErrorCode | string;
  /** 给人看的说明 */
  message: string;
  /** 校验失败时的字段级信息 */
  details?: unknown;
  /** 与日志对应的请求 id */
  requestId?: string;
}
