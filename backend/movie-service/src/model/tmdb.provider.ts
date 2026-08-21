import { Injectable, Logger } from "@nestjs/common";

/**
 * TMDB HTTP 客户端配置。
 * 各 Tool 自行拼 URL 与解析响应，这里只提供 base url 和鉴权头。
 */
@Injectable()
export class TmdbProvider {
  private readonly logger = new Logger(TmdbProvider.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly apiUrl =
    process.env.TMDB_API_URL || "https://tmdb.yangjinhu.asia";

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  getApiUrl(): string {
    if (!this.isEnabled()) {
      this.logger.error("TMDB API key is not configured.");
      throw new Error("TMDB API key is not configured.");
    }

    return this.apiUrl;
  }

  getRequestHeaders(): HeadersInit {
    return {
      accept: "application/json",
      Authorization: "Bearer " + this.apiKey,
    };
  }
}
