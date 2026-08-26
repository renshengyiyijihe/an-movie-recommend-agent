/**
 * 跨会话长期记忆：从 gRPC 响应收成共享态，再投影进 prompt。
 * 与 `conversation-history.ts` 是两类上下文：那边按时间序取当前会话，
 * 这边按相似度取该用户的其它会话。条数与截断都在本文件收口。
 */
import { MEMORY_CONSTANTS } from "./constants";
import { asRecord, getStringValue, readFiniteNumber, summarizeText } from "./helpers";
import { ConversationMemory } from "./types";

/**
 * SearchMemories 响应 → 共享态。丢掉空文本和无法识别的条目，
 * 相似度下限已在 message-service 侧过滤，这里不再判分。
 * @param memories gRPC 返回的 memories 数组
 * @returns 按相似度序的记忆，最多 MEMORY_CONSTANTS.MAX_ITEMS 条
 * @example
 * `[{ text: "用户偏好悬疑烧脑片；本轮推荐了《利刃出鞘》", conversation_id: "c1", score: 0.72 }, { text: "", conversation_id: "c2", score: 0.6 }]`
 * → `[{ text: "用户偏好悬疑烧脑片；本轮推荐了《利刃出鞘》", score: 0.72 }]`
 * （空文本被丢弃，conversation_id 只用于服务端排除当前会话，不进工作流）
 */
export function toConversationMemories(
  memories: unknown[] | undefined,
): ConversationMemory[] {
  if (!memories?.length) return [];

  const items: ConversationMemory[] = [];
  for (const raw of memories) {
    const row = asRecord(raw);
    if (!row) continue;
    const text = getStringValue(row.text);
    if (!text) continue;
    items.push({ text, score: readFiniteNumber(row.score) ?? 0 });
  }

  return items.slice(0, MEMORY_CONSTANTS.MAX_ITEMS);
}

/**
 * 记忆 → prompt 片段。逐条截断后拼成无序列表，调用方不要再 slice。
 * @param memories 共享态里的记忆
 * @returns 每行一条 `- 记忆`；无记忆时为空串
 * @example
 * `[{ text: "用户偏好悬疑烧脑片、能接受慢节奏；本轮推荐了《消失的爱人》", score: 0.72 }]`
 * → `"- 用户偏好悬疑烧脑片、能接受慢节奏；本轮推荐了《消失的爱人》"`
 * （score 只用于排序，不写进 prompt，避免模型把它当成置信度来解读）
 */
export function projectMemories(
  memories: ConversationMemory[] | undefined,
): string {
  if (!memories?.length) return "";

  return memories
    .map((memory) =>
      summarizeText(memory.text, MEMORY_CONSTANTS.TEXT_MAX_LENGTH),
    )
    .filter(Boolean)
    .map((text) => `- ${text}`)
    .join("\n");
}
