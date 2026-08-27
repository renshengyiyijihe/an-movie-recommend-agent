/**
 * 本轮被 AbortSignal 打断（停止按钮或前端超时）。
 * 不要当成 {@link RetryableFormatError} 重试。
 */
export class WorkflowCancelledError extends Error {
  readonly stage = "cancelled";

  constructor() {
    super("workflow cancelled");
    this.name = WorkflowCancelledError.name;
  }
}

/**
 * 是否为取消 / AbortSignal 中断。会顺着 `cause` 看几层，避免 SDK 包一层。
 * @param error 捕获到的值
 * @returns 取消则为 true
 * @example
 * `new DOMException("Aborted", "AbortError")` → `true`
 * `new Error("模型返回的意图分类结果无效")` → `false`
 */
export function isAbortError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof WorkflowCancelledError) return true;
    if (current instanceof Error) {
      if (
        current.name === "AbortError" ||
        current.name === "APIUserAbortError" ||
        current.name === WorkflowCancelledError.name
      ) {
        return true;
      }
      current =
        "cause" in current ? (current as Error & { cause?: unknown }).cause : undefined;
      continue;
    }
    return false;
  }
  return false;
}
