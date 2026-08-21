/**
 * 会话对外形状：一条 messages 行 → 一个 ChatItem。
 * REST 直接返回；gRPC 再把 payload 序列化成 payload_json。
 * 本文件不解析业务 kind，缺字段时只给默认值。
 */
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

/**
 * 实体 → 前端/gRPC 用的扁平气泡。
 * content 缺 kind 时：user → user_query，assistant → recommendation。
 * @param message messages 表一行
 * @returns 可直接展示的 ChatItem
 */
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

/**
 * gRPC 入参 JSON 字符串 → 对象。
 * 必须是 object；解析失败或数组都抛错，label 方便定位是哪个字段。
 * @param raw JSON 字符串
 * @param label 字段名，用于报错
 * @returns 解析后的对象
 */
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

/**
 * 从气泡 payload 取出可读正文。用户用 text，拒绝/失败用 message。
 * @param payload messages.content
 * @returns 正文；两个字段都没有则返回空串
 */
export function payloadText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.message === "string") return payload.message;
  return "";
}
