/**
 * 工具函数库
 * 包含通用的文本处理、数据转换等辅助方法
 */
import { WORKFLOW_CONSTANTS } from "./constants";

/**
 * 截断文本到指定长度
 * @param text 要截断的文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export function truncateText(
  text: string | undefined,
  maxLength: number = WORKFLOW_CONSTANTS.MAX_PROMPT_TEXT_LENGTH,
): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}

/**
 * 规范化文本 - 移除多余空格
 * @param text 输入文本
 * @returns 规范化后的文本
 */
export function normalizeText(text?: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 总结文本 - 截断并添加省略号
 * @param text 输入文本
 * @param maxLength 最大长度
 * @returns 总结后的文本
 */
export function summarizeText(text: string, maxLength: number = 140): string {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * 尝试从JSON字符串提取有效的JSON对象
 * @param value JSON字符串
 * @param stage 阶段名称（用于日志）
 * @returns 解析的对象，或null
 */
export function tryParseJson<T = any>(value: string, stage?: string): T | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = _extractJsonCandidate(trimmed);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * 从文本中提取JSON候选
 * @param value 输入文本
 * @returns JSON字符串，或null
 */
function _extractJsonCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 尝试提取markdown代码块中的JSON
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1];

  // 尝试提取花括号内的JSON
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

/**
 * 获取字符串值
 * @param value 任意值
 * @returns 字符串表示，或空字符串
 */
export function getStringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * 带重试的异步操作执行器
 * @param operation 要执行的异步操作
 * @param maxRetries 最大重试次数
 * @param backoffMs 重试间隔（毫秒）
 * @returns 操作结果
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = WORKFLOW_CONSTANTS.MAX_RETRIES,
  backoffMs: number = WORKFLOW_CONSTANTS.RETRY_BACKOFF_MS,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error("Operation failed after retries");
}
