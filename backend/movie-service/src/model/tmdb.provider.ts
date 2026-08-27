import { Injectable, Logger } from "@nestjs/common";
import { MetricsRegistry } from "@an-movie/auth-client";
import { AbortContext } from "../movie/abort-context";

/**
 * TMDB 查询参数。undefined / null / 空串不会写进 URL。
 */
export type TmdbQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * TMDB HTTP 客户端。
 * Tool 只拼 path 和 query，鉴权、fetch、非 2xx 抛错都在这里。
 */
@Injectable()
export class TmdbProvider {
  private readonly logger = new Logger(TmdbProvider.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly apiUrl =
    process.env.TMDB_API_URL || "https://tmdb.yangjinhu.asia";

  constructor(private readonly metrics: MetricsRegistry) {}

  /**
   * GET TMDB 路径，返回 JSON。
   * @param path 以 `/` 开头的路径，如 `/3/movie/550`
   * @param query 查询参数
   * @example
   * `/3/movie/550` + `{ language: "zh-CN" }`
   * → GET `{apiUrl}/3/movie/550?language=zh-CN`
   * → `{ id: 550, title: "盗梦空间" }`
   */
  async get<T>(path: string, query?: TmdbQuery): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  /**
   * POST TMDB 路径，返回 JSON。
   * @param path 以 `/` 开头的路径
   * @param body JSON 请求体
   * @param query 查询参数
   * @example
   * `/3/movie/550/rating` + `{ value: 8.5 }`
   * → POST `{apiUrl}/3/movie/550/rating` body `{ value: 8.5 }`
   * → `{ success: true, status_code: 1 }`
   */
  async post<T>(path: string, body?: unknown, query?: TmdbQuery): Promise<T> {
    return this.request<T>("POST", path, query, body);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    query?: TmdbQuery,
    body?: unknown,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      accept: "application/json",
      Authorization: "Bearer " + this.requireApiKey(),
    };
    const init: RequestInit = { method, headers };
    const signal = AbortContext.current();
    if (signal) init.signal = signal;
    if (method === "POST" && body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const route = tmdbRoute(path);
    const started = Date.now();
    try {
      const response = await fetch(url, init);
      const durationMs = Date.now() - started;
      this.recordTmdb(method, route, response.status, durationMs, response.ok);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TMDB ${method} ${path} failed with status ${response.status}: ${errorText}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("TMDB ")) {
        throw error;
      }
      this.recordTmdb(method, route, 0, Date.now() - started, false);
      throw error;
    }
  }

  private recordTmdb(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    ok: boolean,
  ): void {
    this.logger.log({
      msg: "tmdb_request",
      method,
      path,
      status,
      duration_ms: durationMs,
      ok,
    } as never);
    this.metrics.observe(
      "tmdb_request_duration_seconds",
      "TMDB HTTP request duration in seconds",
      { method, path, status: String(status) },
      durationMs / 1000,
    );
  }

  /**
   * 拼出完整 TMDB URL，空 query 不带问号。
   * @example
   * `/3/search/movie` + `{ query: "盗梦空间", year: "" }`
   * → `{apiUrl}/3/search/movie?query=%E7%9B%97%E6%A2%A6%E7%A9%BA%E9%97%B4`
   */
  private buildUrl(path: string, query?: TmdbQuery): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiUrl.replace(/\/$/, "")}${normalizedPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (!text) continue;
        url.searchParams.set(key, text);
      }
    }
    return url.toString();
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      this.logger.error("TMDB API key is not configured.");
      throw new Error("TMDB API key is not configured.");
    }
    return this.apiKey;
  }
}

/**
 * 数字 id 收成 `:id`，避免指标基数爆炸。
 * @example
 * `/3/movie/550` → `/3/movie/:id`
 * `/3/search/movie` → `/3/search/movie`
 */
function tmdbRoute(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/\/\d+/g, "/:id");
}
