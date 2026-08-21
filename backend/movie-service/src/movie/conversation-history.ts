import { HISTORY_PROJECTION, WORKFLOW_CONSTANTS } from "./constants";
import {
  getStringValue,
  normalizeText,
  summarizeText,
  tryParseJson,
} from "./helpers";
import { ConversationChatItem } from "./message.grpc";
import { moviesFromParsed } from "./transcript";
import { ConversationHistoryItem, MessageRole } from "./types";

export type HistoryProjectionKind =
  | "intent"
  | "planning"
  | "search"
  | "synthesis";

const MAX_TURNS: Record<HistoryProjectionKind, number> = {
  intent: HISTORY_PROJECTION.intentMaxTurns,
  planning: HISTORY_PROJECTION.planningMaxTurns,
  search: HISTORY_PROJECTION.searchMaxTurns,
  synthesis: HISTORY_PROJECTION.synthesisMaxTurns,
};

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

  return turns.slice(-WORKFLOW_CONSTANTS.MAX_SHARED_HISTORY_TURNS);
}

export function projectConversationHistory(
  turns: ConversationHistoryItem[] | undefined,
  kind: HistoryProjectionKind,
): string {
  if (!turns?.length) return "";

  return turns
    .slice(-MAX_TURNS[kind])
    .map((turn) => {
      const label = turn.role === "user" ? "用户" : "AI";
      return `${label}: ${projectTurnContent(turn)}`;
    })
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

function projectTurnContent(turn: ConversationHistoryItem): string {
  if (turn.role === "assistant") {
    return compactAssistantContent(turn.content);
  }
  return summarizeText(
    turn.content,
    WORKFLOW_CONSTANTS.HISTORY_USER_MAX_LENGTH,
  );
}

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
  const text =
    getStringValue(parsed.text) ||
    getStringValue(parsed.explanation) ||
    getStringValue(parsed.message);

  const parts: string[] = [];
  if (titles.length) parts.push(`推荐过: ${titles.join("、")}`);
  if (text) parts.push(normalizeText(text));

  return summarizeText(
    parts.join("。") || content,
    WORKFLOW_CONSTANTS.HISTORY_ASSISTANT_MAX_LENGTH,
  );
}

function formatRecommendation(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const rec = value as Record<string, unknown>;
  const name = getStringValue(rec.name) || getStringValue(rec.title);
  if (!name) return "";
  const id = rec.id ?? rec.movie_id;
  return id === undefined || id === null || id === "" ? name : `${name}(${id})`;
}

function toMessageRole(value?: string): MessageRole | undefined {
  if (value === "user" || value === "assistant") return value;
  return undefined;
}

function transcriptText(
  role: MessageRole | undefined,
  payloadJson?: string,
): string {
  if (!role) return "";
  const payload = payloadJson
    ? tryParseJson<Record<string, unknown>>(payloadJson)
    : null;
  if (!payload) return "";

  if (role === "user") {
    return getStringValue(payload.text);
  }
  if (payload.kind === "recommendation") {
    return JSON.stringify(payload);
  }
  return getStringValue(payload.message);
}
