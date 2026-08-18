import { Injectable, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { TmdbProvider, TmdbDiscoverMovieQueryParamsDto, TMDBDiscoverMovieQueryParams } from "../../model/tmdb.provider";
import { GENRE_TO_TMDB_ID, LANGUAGE_TO_TMDB_CODE } from "../constants";
import { extractNumber, extractRuntimeMinutes, getStringValue } from "../helpers";

/**
 * 电影搜索服务
 * 负责TMDB搜索、参数验证、查询构建等电影搜索相关的业务逻辑
 */
@Injectable()
export class MovieSearchService {
  private readonly logger = new Logger(MovieSearchService.name);

  constructor(private readonly _tmdbProvider: TmdbProvider) {}

  /**
   * 构建TMDB搜索请求
   */
  buildTmdbQuery(preferences: Record<string, any>): {
    params?: Partial<TMDBDiscoverMovieQueryParams>;
    query?: string;
  } {
    const params = this._buildTmdbQueryParams(preferences);
    const query = this._buildQueryString(preferences);

    return {
      params: Object.keys(params).length > 0 ? params : undefined,
      query: query || "电影推荐",
    };
  }

  /**
   * 验证TMDB查询参数
   */
  async validateTmdbQueryParams(
    params: Partial<TMDBDiscoverMovieQueryParams>,
  ): Promise<string | null> {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return "参数格式不正确";
    }

    const dto = plainToInstance(TmdbDiscoverMovieQueryParamsDto, params);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
    });

    if (errors.length === 0) return null;

    const firstError = errors[0];
    return firstError.constraints ? Object.values(firstError.constraints)[0] : "参数校验失败";
  }

  /**
   * 执行TMDB搜索
   */
  async performTmdbSearch(
    params: Partial<TMDBDiscoverMovieQueryParams>,
    language: string = "zh-CN",
    maxResults: number = 4,
  ): Promise<string> {
    try {
      const response = await this._tmdbProvider.search(params, {
        language,
        max_results: maxResults,
      });

      return this._buildStructuredSearchSummary(response);
    } catch (error) {
      this.logger.error(`TMDB搜索失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 从偏好中构建TMDB查询参数
   */
  private _buildTmdbQueryParams(
    preferences: Record<string, any>,
  ): Partial<TMDBDiscoverMovieQueryParams> {
    const params: Partial<TMDBDiscoverMovieQueryParams> = {};

    // 处理类型
    if (preferences.genre) {
      const genreId = this._mapGenreToTmdbGenreId(preferences.genre);
      if (genreId) params.with_genres = genreId;
    }

    // 处理评分
    if (preferences.rating) {
      const ratingNum = extractNumber(preferences.rating);
      if (ratingNum !== null) params["vote_average.gte"] = ratingNum;
    }

    // 处理时长
    if (preferences.length) {
      const runtimeMin = extractRuntimeMinutes(preferences.length);
      if (runtimeMin !== null) params["with_runtime.lte"] = runtimeMin;
    }

    // 处理语言
    if (preferences.language) {
      const langCode = this._mapLanguageToTmdb(preferences.language);
      if (langCode) params.with_original_language = langCode;
    }

    return params;
  }

  /**
   * 从偏好中构建查询字符串
   */
  private _buildQueryString(preferences: Record<string, any>): string {
    const parts = [
      preferences.genre,
      preferences.mood,
      preferences.actors,
      preferences.theme,
      preferences.scene,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return parts || "电影推荐";
  }

  /**
   * 映射类型名称到TMDB ID
   */
  private _mapGenreToTmdbGenreId(genre: string): string | undefined {
    const normalized = genre.trim().toLowerCase();
    return GENRE_TO_TMDB_ID[normalized as keyof typeof GENRE_TO_TMDB_ID];
  }

  /**
   * 映射语言名称到TMDB代码
   */
  private _mapLanguageToTmdb(language: string): string | undefined {
    const normalized = language.trim().toLowerCase();
    return LANGUAGE_TO_TMDB_CODE[normalized as keyof typeof LANGUAGE_TO_TMDB_CODE];
  }

  /**
   * 构建结构化搜索总结
   */
  private _buildStructuredSearchSummary(response: any): string {
    const results = (response.results ?? []).map((item: any) => {
      const releaseYear = item.release_date ? new Date(item.release_date).getFullYear() : "未知";
      return {
        id: item.id,
        title: item.title,
        original_title: item.original_title,
        release_date: item.release_date,
        release_year: releaseYear,
        vote_average: item.vote_average,
        vote_count: item.vote_count,
        popularity: item.popularity,
        overview: getStringValue(item.overview).substring(0, 200),
        original_language: item.original_language,
        poster_path: item.poster_path,
      };
    });

    return JSON.stringify({
      query:
        typeof response.query === "string"
          ? response.query
          : JSON.stringify(response.query ?? {}),
      results,
      request_id: response.request_id ?? "",
    });
  }

  /**
   * 从搜索结果中解析元数据
   */
  parseSearchResultMetadata(searchResult: string): Record<string, unknown>[] {
    if (!searchResult) return [];

    try {
      const parsed = JSON.parse(searchResult);
      const results = parsed.results;
      if (!Array.isArray(results)) return [];

      return results.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    } catch {
      return [];
    }
  }

  /**
   * 匹配推荐电影与TMDB电影
   */
  matchTmdbMovie(
    recommendation: Record<string, unknown>,
    movie: Record<string, unknown>,
  ): boolean {
    const targetTitles = [
      getStringValue(recommendation.name),
      getStringValue(recommendation.title),
      getStringValue(recommendation.original_title),
    ];
    const movieTitles = [
      getStringValue(movie.title),
      getStringValue(movie.original_title),
    ];

    return targetTitles.some((targetTitle) => {
      if (!targetTitle) return false;
      return movieTitles.some((movieTitle) => {
        if (!movieTitle) return false;
        const targetLower = targetTitle.toLowerCase();
        const movieLower = movieTitle.toLowerCase();
        return (
          targetLower === movieLower ||
          targetLower.includes(movieLower) ||
          movieLower.includes(targetLower)
        );
      });
    });
  }

  /**
   * 使用TMDB元数据丰富推荐
   */
  enrichWithTmdbMetadata(
    recommendation: Record<string, unknown>,
    movie: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...recommendation,
      name: getStringValue(recommendation.name) || getStringValue(movie.title),
      title: getStringValue(recommendation.title) || getStringValue(movie.title),
      reason: getStringValue(recommendation.reason) || getStringValue(movie.overview),
      summary:
        getStringValue(recommendation.summary) || getStringValue(movie.overview),
      overview: getStringValue(recommendation.overview) || getStringValue(movie.overview),
      release_date:
        getStringValue(recommendation.release_date) || getStringValue(movie.release_date),
      vote_average: recommendation.vote_average ?? movie.vote_average ?? undefined,
      vote_count: recommendation.vote_count ?? movie.vote_count ?? undefined,
      popularity: recommendation.popularity ?? movie.popularity ?? undefined,
      original_language:
        getStringValue(recommendation.original_language) ||
        getStringValue(movie.original_language),
      genre_ids: Array.isArray(recommendation.genre_ids)
        ? recommendation.genre_ids
        : Array.isArray(movie.genre_ids)
          ? movie.genre_ids
          : [],
      poster_path: recommendation.poster_path ?? movie.poster_path ?? null,
      poster_url:
        getStringValue(recommendation.poster_url) || getStringValue(movie.poster_url),
      backdrop_path: recommendation.backdrop_path ?? movie.backdrop_path ?? null,
      backdrop_url:
        getStringValue(recommendation.backdrop_url) || getStringValue(movie.backdrop_url),
      tmdb_url:
        getStringValue(recommendation.tmdb_url) || getStringValue(movie.tmdb_url),
      id: recommendation.id ?? movie.id ?? undefined,
      adult: recommendation.adult ?? movie.adult ?? false,
      video: recommendation.video ?? movie.video ?? false,
      original_title:
        getStringValue(recommendation.original_title) ||
        getStringValue(movie.original_title),
    };
  }
}
