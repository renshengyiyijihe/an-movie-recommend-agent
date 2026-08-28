import { TEXT } from "@/constant";
import type { ChatMessage, ConversationSummary } from "@/types";
import { chatMessageText } from "@/utils/chatUtils";

const TITLE_ID_PREFIX_LENGTH = 8;

/**
 * 历史列表 / 聊天标题用的会话名。空 title 时用 id 前缀，避免多条都叫「未命名」。
 *
 * @param conversation 列表或详情里的会话摘要
 * @returns 去掉首尾空白后的 title，或「会话」+ id 前 8 位
 * @example
 * conversationDisplayTitle({ conversation_id: "abcdef12-9999", title: " 想看科幻 " })
 * // "想看科幻"
 * conversationDisplayTitle({ conversation_id: "abcdef12-9999", title: null })
 * // "会话 abcdef12"
 */
export function conversationDisplayTitle(conversation: {
  conversation_id: string;
  title?: string | null;
}): string {
  const title = conversation.title?.trim();
  if (title) return title;
  return `${TEXT.workspace.untitled} ${conversation.conversation_id.slice(0, TITLE_ID_PREFIX_LENGTH)}`;
}

/**
 * 列表次要信息：当天只显示时刻，否则显示本地日期。非法时间戳返回空串。
 *
 * @param iso `created_at` 的 ISO 字符串
 * @example
 * formatConversationTimestamp("2026-08-26T14:00:00.000Z") // 当天 → "22:00"（随时区变化）
 */
export function formatConversationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameCalendarDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameCalendarDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString();
}

/**
 * 主聊天顶栏标题：优先当前详情 / 列表，其次本轮第一条用户问题。
 *
 * @example
 * resolveActiveConversationTitle({
 *   conversationId: undefined,
 *   conversations: [],
 *   selectedTitle: null,
 *   messages: [],
 * })
 * // "新对话"
 */
export function resolveActiveConversationTitle(input: {
  conversationId: string | undefined;
  conversations: ConversationSummary[];
  selectedTitle: string | null | undefined;
  messages: ChatMessage[];
}): string {
  const { conversationId, conversations, selectedTitle, messages } = input;
  if (!conversationId) return TEXT.workspace.newConversation;

  const trimmedSelected = selectedTitle?.trim();
  if (trimmedSelected) return trimmedSelected;

  const fromList = conversations.find(
    (item) => item.conversation_id === conversationId,
  );
  if (fromList) return conversationDisplayTitle(fromList);

  const firstUserQuery = messages.find((item) => item.kind === "user_query");
  const fromMessages = firstUserQuery
    ? chatMessageText(firstUserQuery).trim()
    : "";
  return fromMessages || TEXT.workspace.newConversation;
}
