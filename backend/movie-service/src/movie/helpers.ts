/**
 * 工具函数库
 * 集合/对象操作用 lodash-es；本文件只保留业务语义封装和领域函数。
 */
import { clamp, isArray, isPlainObject, keyBy, take, uniq, values } from "lodash-es";
import { WORKFLOW_CONSTANTS } from "./constants";

/**
 * 截断文本到指定长度，超长时追加截断标记。
 * @param text 要截断的文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 * @example
 * `"abcdef"` + 3 → `"abc\n...[truncated]"`
 * `"ab"` + 3 → `"ab"`
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
 * 去掉首尾空白，并把中间连续空白收成单个空格。
 * @param text 输入文本
 * @returns 规范化后的文本
 * @example
 * `"  盗梦  空间  "` → `"盗梦 空间"`
 */
export function normalizeText(text?: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 规范化后再截断，超长追加 `...`。
 * @param text 输入文本
 * @param maxLength 最大长度
 * @returns 总结后的文本
 * @example
 * `"  很长的简介  "` + 2 → `"很长..."`
 */
export function summarizeText(text: string, maxLength: number = 140): string {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * 从模型输出里抽出 JSON 对象。支持裸 JSON 和 markdown 代码块。
 * @param value JSON字符串
 * @param stage 阶段名称（用于日志）
 * @returns 解析的对象，或null
 * @example
 * `'```json\n{"text":"好"}\n```'` → `{ text: "好" }`
 * `"不是 json"` → `null`
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
 * 从文本中抽出可交给 `JSON.parse` 的字符串。
 * @param value 输入文本
 * @returns JSON字符串，或null
 * @example
 * `'前言 {"a":1} 后记'` → `'{"a":1}'`
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
 * 将未知值收成普通对象。数组和 null 视为无效。
 * @param value 任意值
 * @example
 * `{ id: 1 }` → `{ id: 1 }`
 * `null` → `undefined`
 * `[1, 2]` → `undefined`
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * 将未知值收成数组。非数组返回空数组（不会把标量包成单元素数组）。
 * @param value 任意值
 * @example
 * `[{ id: 1 }]` → `[{ id: 1 }]`
 * `{ id: 1 }` → `[]`
 * `undefined` → `[]`
 */
export function asArray(value: unknown): unknown[] {
  return isArray(value) ? value : [];
}

/**
 * 收成去首尾空白的字符串。null / undefined 为空串。
 * @param value 任意值
 * @returns 字符串表示，或空字符串
 * @example
 * `"  盗梦空间  "` → `"盗梦空间"`
 * `12` → `"12"`
 * `null` → `""`
 */
export function getStringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * 将未知值收成有限数字。
 * @param value 任意值
 * @returns 有限数字；无法转换时为 undefined
 * @example
 * `8.4` → `8.4`
 * `"8.4"` → `8.4`
 * `""` → `undefined`
 * `NaN` → `undefined`
 */
export function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * 截取数组前 n 项。
 * @param value 源数组
 * @param n 最多保留的条数
 * @example
 * `[1, 2, 3]` + 2 → `[1, 2]`
 * `undefined` + 2 → `[]`
 */
export function takeFirst<T>(value: T[] | undefined, n: number): T[] {
  return take(value ?? [], n);
}

/**
 * 将工具的 max_results 限制在闭区间 [1, hardMax]。
 * @param value 调用方传入的上限
 * @param defaultValue 未传时的默认值
 * @param hardMax 硬上限
 * @example
 * `20` + 默认 3 + 上限 10 → `10`
 * `undefined` + 默认 3 + 上限 10 → `3`
 * `0` + 默认 3 + 上限 10 → `1`
 */
export function clampMaxResults(
  value: unknown,
  defaultValue: number,
  hardMax: number,
): number {
  const parsed = readFiniteNumber(value);
  if (parsed === undefined) return defaultValue;
  return clamp(Math.trunc(parsed), 1, hardMax);
}

/**
 * 去掉重复且非正的 id。
 * @param ids TMDB 或其它数字 id
 * @example
 * `[550, 550, 0, -1, 13]` → `[550, 13]`
 */
export function uniqueIds(ids: number[]): number[] {
  return uniq(ids.filter((id) => Number.isFinite(id) && id > 0));
}

/**
 * 按 iteratee 去重，**后出现的覆盖先出现的**。
 * 内部是 lodash `values(keyBy(...))`。不要用 `unionBy` / `uniqBy`：那些是先出现的保留。
 * @param items 源数组，后者同 key 会覆盖前者
 * @param iteratee 生成去重键
 * @example
 * `[{ id: 1, n: "旧" }, { id: 1, n: "新" }]` 按 `id`
 * → `[{ id: 1, n: "新" }]`
 */
export function uniqueByLast<T>(
  items: T[],
  iteratee: (item: T) => string,
): T[] {
  return values(keyBy(items, iteratee));
}

/**
 * 由 TMDB 生日（YYYY-MM-DD）计算周岁。
 * @param birthday 生日字符串
 * @param now 计算基准，默认当前时间
 * @returns 周岁；日期无效时返回 undefined
 * @example
 * `"1974-11-11"` + `2026-08-23` → `51`
 * `"不是日期"` → `undefined`
 */
export function ageFromBirthday(
  birthday: string | null | undefined,
  now: Date = new Date(),
): number | undefined {
  if (!birthday) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday.trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  let age = now.getFullYear() - year;
  const currentMonth = now.getMonth() + 1;
  const hadBirthday =
    currentMonth > month || (currentMonth === month && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

/**
 * 从上映日期取出四位年份。
 * @param releaseDate YYYY-MM-DD 或 YYYY
 * @example
 * `"2010-07-16"` → `"2010"`
 * `"2010"` → `"2010"`
 * `""` → `undefined`
 */
export function yearFromReleaseDate(
  releaseDate?: string | null,
): string | undefined {
  if (!releaseDate) return undefined;
  const year = releaseDate.trim().slice(0, 4);
  return /^\d{4}$/.test(year) ? year : undefined;
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
