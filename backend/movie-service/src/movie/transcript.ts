/**
 * 写入 messages.content 的判别联合。
 * message-service 原样存 JSONB，不解析 kind。
 */
import type { RecommendationItem, RecommendationPayload } from "@an-movie/contracts";
import { TMDB_CONSTANTS } from "./constants";
import { getStringValue, readFiniteNumber } from "./helpers";

export type {
  AssistantPayload,
  CancelledPayload,
  ErrorPayload,
  RecommendationPayload,
  RejectPayload,
  UserMessagePayload,
} from "@an-movie/contracts";

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
 * 从解析后的对象取出片单数组。有 id 时由代码拼 tmdb_url，丢掉模型填的外链。
 * @param parsed 推荐 JSON 对象
 * @returns movies；没有或不是数组则返回空数组
 * @example
 * `{ movies: [{ id: 27205, name: "盗梦空间" }] }`
 * → `[{ id: 27205, name: "盗梦空间", tmdb_url: "https://www.themoviedb.org/movie/27205" }]`
 */
export function moviesFromParsed(parsed: Record<string, unknown>): RecommendationItem[] {
  if (!Array.isArray(parsed.movies)) return [];
  return parsed.movies.map((item) => {
    const movie = item as RecommendationItem & { movie_id?: unknown };
    const id = readFiniteNumber(movie.id ?? movie.movie_id);
    return {
      ...movie,
      ...(id !== undefined
        ? { id, tmdb_url: `${TMDB_CONSTANTS.MOVIE_PAGE_PREFIX}/${id}` }
        : { tmdb_url: undefined }),
    };
  });
}
