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
    text:
      getStringValue(parsed.text) ||
      getStringValue(parsed.explanation) ||
      getStringValue(parsed.message) ||
      getStringValue(parsed.fallback_reason),
    movies: moviesFromParsed(parsed),
  };
}

export function moviesFromParsed(parsed: Record<string, unknown>): unknown[] {
  if (Array.isArray(parsed.movies)) return parsed.movies;
  if (Array.isArray(parsed.recommendations)) return parsed.recommendations;
  return [];
}
