/**
 * 会话详情翻页游标。对客户端不透明，只在本服务编解码。
 * 排序键是 `(created_at, id)`：`created_at` 可能同毫秒撞车，`id` 做 tiebreaker，
 * 保证 keyset 翻页不重不漏。
 */

/** 游标解码后的排序键。 */
export interface MessageCursor {
  /** messages.created_at */
  createdAt: Date;
  /** messages.id，同毫秒时的次级排序键 */
  id: string;
}

const CURSOR_SEPARATOR = "|";

/**
 * 一行消息 → 翻页游标。编码前的明文是 `${ISO 时间}|${消息 id}`，再取 base64url。
 *
 * @param message 这一页最早那条消息的排序键
 * @returns base64url 编码的不透明游标
 * @example
 * const cursor = encodeMessageCursor({
 *   createdAt: new Date("2026-08-26T14:00:00.000Z"),
 *   id: "msg-42",
 * });
 * // base64url("2026-08-26T14:00:00.000Z|msg-42")
 * decodeMessageCursor(cursor);
 * // { createdAt: new Date("2026-08-26T14:00:00.000Z"), id: "msg-42" }
 */
export function encodeMessageCursor(message: MessageCursor): string {
  const raw = `${message.createdAt.toISOString()}${CURSOR_SEPARATOR}${message.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * 游标 → 排序键。伪造或过期格式一律返回 null，由调用方当作没传处理。
 *
 * @param raw 客户端回传的 `before`
 * @returns 解码后的排序键；不合法则 null
 * @example
 * decodeMessageCursor(
 *   encodeMessageCursor({
 *     createdAt: new Date("2026-08-26T14:00:00.000Z"),
 *     id: "msg-42",
 *   }),
 * );
 * // { createdAt: new Date("2026-08-26T14:00:00.000Z"), id: "msg-42" }
 * decodeMessageCursor("not-a-cursor");
 * // null
 */
export function decodeMessageCursor(raw: string): MessageCursor | null {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const separatorAt = decoded.indexOf(CURSOR_SEPARATOR);
  if (separatorAt <= 0) return null;

  const createdAt = new Date(decoded.slice(0, separatorAt));
  const id = decoded.slice(separatorAt + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;

  return { createdAt, id };
}
