import { MessageEntity } from "./entities";

export interface ChatItem {
  id: string;
  turn_id: string;
  role: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function toChatItem(message: MessageEntity): ChatItem {
  const payload = asObject(message.content);
  const kind =
    typeof payload.kind === "string"
      ? payload.kind
      : message.role === "user"
        ? "user_query"
        : "recommendation";

  return {
    id: message.id,
    turn_id: message.turn_id,
    role: message.role,
    kind,
    payload: { ...payload, kind },
    created_at: message.created_at.toISOString(),
  };
}

export function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be a JSON object")) {
      throw error;
    }
    throw new Error(`${label} is not valid JSON`);
  }
}

export function payloadText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.message === "string") return payload.message;
  return "";
}
