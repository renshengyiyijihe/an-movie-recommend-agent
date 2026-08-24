/**
 * 会话历史：从 ChatItem 压成工作流共享态，再按阶段裁进 prompt。
 * 不要在 service / agent 里再拼历史字符串。
 */
import { HISTORY_PROJECTION, WORKFLOW_CONSTANTS } from "./constants";
import {
  getStringValue,
  normalizeText,
  summarizeText,
  tryParseJson,
} from "./helpers";
import { ConversationChatItem } from "./message.grpc";
import { moviesFromParsed } from "./transcript";
import {
  ConversationHistoryItem,
  HISTORY_PROJECTION_KIND,
  HistoryProjectionKind,
  MESSAGE_ROLE,
  MessageRole,
} from "./types";

const MAX_MESSAGES: Record<HistoryProjectionKind, number> = {
  [HISTORY_PROJECTION_KIND.INTENT]: HISTORY_PROJECTION.intentMaxMessages,
  [HISTORY_PROJECTION_KIND.PLANNING]: HISTORY_PROJECTION.planningMaxMessages,
  [HISTORY_PROJECTION_KIND.SEARCH]: HISTORY_PROJECTION.searchMaxMessages,
  [HISTORY_PROJECTION_KIND.SYNTHESIS]: HISTORY_PROJECTION.synthesisMaxMessages,
};

/**
 * GetConversation 的扁平气泡 → WorkflowContext.shared.turns。
 * 跳过非法 role / 空正文 / 拒绝失败气泡，只留最近 MAX_SHARED_HISTORY_MESSAGES 条。
 * @param messages GetConversation 返回的 ChatItem 列表
 * @returns 按时间序的 { role, content }，供各阶段再裁剪
 */
export function toConversationTurns(
  messages: ConversationChatItem[] | undefined,
): ConversationHistoryItem[] {
  if (!messages?.length) return [];

  const turns: ConversationHistoryItem[] = [];
  for (const message of messages) {
    const role = toMessageRole(message.role);
    const content = transcriptText(role, message.payload_json);
    if (!role || !content) continue;
    turns.push({ role, content });
  }

  return turns.slice(-WORKFLOW_CONSTANTS.MAX_SHARED_HISTORY_MESSAGES);
}

/**
 * 按阶段裁剪历史，输出 "用户: … / AI: …" 多行文本，供 prompt 插入。
 * 条数、单条长度都在这里收口，调用方不要再 slice。
 * @param turns 共享态里的完整历史
 * @param kind 当前 prompt 阶段
 * @returns 已裁剪、已截断的历史文本；无历史时为空串
 */
export function projectConversationHistory(
  turns: ConversationHistoryItem[] | undefined,
  kind: HistoryProjectionKind,
): string {
  if (!turns?.length) return "";

  return turns
    .slice(-MAX_MESSAGES[kind])
    .map((turn) => {
      const label = turn.role === MESSAGE_ROLE.USER ? "用户" : "AI";
      return `${label}: ${projectTurnContent(turn)}`;
    })
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

/**
 * 单条历史压成 prompt 片段。用户截断原文，助手先压片单再截断。
 * @param turn 一条用户或助手历史
 * @returns 截断后的正文
 */
function projectTurnContent(turn: ConversationHistoryItem): string {
  if (turn.role === MESSAGE_ROLE.ASSISTANT) {
    return compactAssistantContent(turn.content);
  }
  return summarizeText(
    turn.content,
    WORKFLOW_CONSTANTS.HISTORY_USER_MAX_LENGTH,
  );
}

/**
 * 助手历史不要整段 JSON 进 prompt。
 * 压成「推荐过: 片名 [id:数字]。说明」。
 * @param content 助手气泡正文，通常是 recommendation JSON 字符串
 * @returns 压缩并截断后的文本
 */
function compactAssistantContent(content: string): string {
  const parsed = tryParseJson<Record<string, unknown>>(content);
  if (!parsed) {
    return summarizeText(
      content,
      WORKFLOW_CONSTANTS.HISTORY_ASSISTANT_MAX_LENGTH,
    );
  }

  const titles = moviesFromParsed(parsed)
    .map((item) => formatRecommendation(item))
    .filter(Boolean);
  const text = getStringValue(parsed.text);

  const parts: string[] = [];
  if (titles.length) parts.push(`推荐过: ${titles.join("、")}`);
  if (text) parts.push(normalizeText(text));

  return summarizeText(
    parts.join("。") || content,
    WORKFLOW_CONSTANTS.HISTORY_ASSISTANT_MAX_LENGTH,
  );
}

/**
 * 把单条电影压成可读片名。优先 name/title，有 id 时写成 `片名 [id:数字]`。
 * 不用 `片名(id)`：片名常自带括号（年份、外文名），会和 TMDB 数字 id 糊在一起。
 * @param value movies 里的一项
 * @returns `片名` 或 `片名 [id:123]`；无法识别时返回空串
 */
function formatRecommendation(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const rec = value as Record<string, unknown>;
  const name = getStringValue(rec.name) || getStringValue(rec.title);
  if (!name) return "";
  const id = rec.id ?? rec.movie_id;
  if (id === undefined || id === null || id === "") return name;
  return `${name} [id:${id}]`;
}

/**
 * 只接受 user / assistant，其它 role 丢弃。
 * @param value ChatItem.role
 * @returns 合法角色，否则 undefined
 */
function toMessageRole(value?: string): MessageRole | undefined {
  if (value === MESSAGE_ROLE.USER || value === MESSAGE_ROLE.ASSISTANT) return value;
  return undefined;
}

/**
 * 从 ChatItem.payload_json 抽出工作流要用的正文。
 * 用户用 text；推荐成功保留 JSON（后面 compact 再压）；拒绝/失败不进 prompt。
 * @param role 已校验的角色
 * @param payloadJson ChatItem 的 payload_json
 * @returns 工作流正文；解析失败或空字段返回空串
 */
function transcriptText(
  role: MessageRole | undefined,
  payloadJson?: string,
): string {
  if (!role) return "";
  const payload = payloadJson
    ? tryParseJson<Record<string, unknown>>(payloadJson)
    : null;
  if (!payload) return "";

  if (role === MESSAGE_ROLE.USER) {
    return getStringValue(payload.text);
  }
  if (payload.kind === "recommendation") {
    return JSON.stringify(payload);
  }
  return "";
}
