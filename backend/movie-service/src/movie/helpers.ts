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
 * 清理图片数据
 * @param imageData Base64编码的图片数据
 * @returns 清理后的数据，或undefined
 */
export function sanitizeImageData(imageData?: string): string | undefined {
  if (!imageData) return undefined;
  if (imageData.length > WORKFLOW_CONSTANTS.MAX_IMAGE_DATA_LENGTH) {
    return imageData.slice(0, WORKFLOW_CONSTANTS.MAX_IMAGE_DATA_LENGTH);
  }
  return imageData;
}

/**
 * 从文本中提取数字
 * @param value 输入值
 * @returns 提取的数字，或null
 */
export function extractNumber(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * 从时长描述中提取分钟数
 * 支持格式：2小时、120分钟、2h、120min 等
 * @param value 时长描述
 * @returns 分钟数，或null
 */
export function extractRuntimeMinutes(value: string): number | null {
  const normalized = value.toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const number = Number(match[1]);

  // 处理小时转分钟
  if (
    normalized.includes("小时") ||
    normalized.includes("hr") ||
    normalized.includes("h")
  ) {
    return number * 60;
  }

  // 处理分钟
  if (
    normalized.includes("分钟") ||
    normalized.includes("min") ||
    normalized.includes("m")
  ) {
    return number;
  }

  return null;
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
 * 清理JSON类似的文本
 * 移除控制字符、修复不完整的JSON等
 * @param value 输入文本
 * @returns 清理后的文本
 */
export function sanitizeJsonLikeText(value: string): string {
  let text = value.trim();

  // 移除markdown代码块标记
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "");

  // 移除控制字符
  text = text.replace(/[\u0000-\u001f]/g, (char) => {
    if (char === "\n" || char === "\r" || char === "\t") return char;
    return "";
  });

  // 提取花括号范围
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);

  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (!inString && char === "'") {
      result += '"';
      continue;
    }

    result += char;
  }

  return result;
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

/**
 * 睡眠函数
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
