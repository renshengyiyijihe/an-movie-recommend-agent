/**
 * 写入 messages.content 的判别联合。
 * message-service 原样存 JSONB，不解析 kind。
 */
import { getStringValue } from "./helpers";

export type UserMessagePayload = {
  kind: "user_query";
  text: string;
};

export type RecommendationPayload = {
  kind: "recommendation";
  text: string;
  movies: unknown[];
};

export type RejectPayload = {
  kind: "reject";
  message: string;
};

export type ErrorPayload = {
  kind: "error";
  message: string;
};

export type AssistantPayload =
  | RecommendationPayload
  | RejectPayload
  | ErrorPayload;

export type TurnStatus = "success" | "reject" | "error";

/**
 * LLM 汇总 JSON → 写入 CompleteTurn / 返回 HTTP 的推荐 payload。
 * 解析失败仍返回 kind=recommendation，避免前端少一种分支。
 * @param parsed tryParseJson 的结果，解析失败为 null
 * @returns 可直接写入 messages.content 的推荐 payload
 */
export function recommendationFromParsed(
  parsed: Record<string, unknown> | null,
): RecommendationPayload {
  if (!parsed) {
    return {
      kind: "recommendation",
      text: "解析失败，无法生成推荐。",
      movies: [],
    };
  }

  return {
    kind: "recommendation",
    text: getStringValue(parsed.text),
    movies: moviesFromParsed(parsed),
  };
}

/**
 * 从解析后的对象取出片单数组。
 * @param parsed 推荐 JSON 对象
 * @returns movies；没有或不是数组则返回空数组
 */
export function moviesFromParsed(parsed: Record<string, unknown>): unknown[] {
  return Array.isArray(parsed.movies) ? parsed.movies : [];
}
