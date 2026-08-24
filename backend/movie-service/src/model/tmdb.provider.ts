import { Injectable, Logger } from "@nestjs/common";

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
    if (method === "POST" && body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TMDB ${method} ${path} failed with status ${response.status}: ${errorText}`,
      );
    }

    return (await response.json()) as T;
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
