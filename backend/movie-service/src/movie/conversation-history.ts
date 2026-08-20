import { HISTORY_PROJECTION, WORKFLOW_CONSTANTS } from "./constants";
import {
  getStringValue,
  normalizeText,
  summarizeText,
  tryParseJson,
} from "./helpers";
import {
  ConversationHistoryItem,
  MessageRole,
  MessageStage,
  MessageType,
} from "./types";

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

interface RawHistoryMessage {
  role?: string;
  content?: string | null;
  message_type?: string;
  stage?: string;
}

export function toConversationTurns(
  messages: RawHistoryMessage[] | undefined,
): ConversationHistoryItem[] {
  if (!messages?.length) return [];

  const turns: ConversationHistoryItem[] = [];
  for (const message of messages) {
    const role = toMessageRole(message.role);
    const content = message.content?.trim();
    if (!role || !content) continue;
    turns.push({
      role,
      content,
      message_type: toMessageType(message.message_type, role),
      stage: toMessageStage(message.stage, role),
    });
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

  const titles = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .map((item) => formatRecommendation(item))
        .filter(Boolean)
    : [];
  const explanation =
    getStringValue(parsed.explanation) ||
    getStringValue(parsed.message) ||
    getStringValue(parsed.summary);

  const parts: string[] = [];
  if (titles.length) parts.push(`推荐过: ${titles.join("、")}`);
  if (explanation) parts.push(normalizeText(explanation));

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

function toMessageType(value: string | undefined, role: MessageRole): MessageType {
  if (
    value === "user_query" ||
    value === "agent_execution" ||
    value === "final_response"
  ) {
    return value;
  }
  return role === "user" ? "user_query" : "final_response";
}

function toMessageStage(value: string | undefined, role: MessageRole): MessageStage {
  if (
    value === "start" ||
    value === "intent_classification" ||
    value === "workflow_complete" ||
    value === "final" ||
    value === "search_start" ||
    value === "search_completed" ||
    value === "supervisor_start" ||
    value === "supervisor_completed"
  ) {
    return value;
  }
  return role === "user" ? "start" : "final";
}
