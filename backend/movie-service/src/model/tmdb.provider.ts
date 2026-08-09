import "reflect-metadata";
import { Injectable, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, validate } from "class-validator";

/**
 * TMDB Discover Movie 查询参数
 */
export interface TMDBDiscoverMovieQueryParams {
  /**
   * 额外的搜索关键词，用于组合筛选条件
   */
  max_results?: number;

  /**
   * 是否包含成人内容
   */
  include_adult?: boolean;

  /**
   * 是否包含视频
   */
  include_video?: boolean;

  /**
   * 返回语言
   */
  language?: string;

  /**
   * 页码，默认1
   */
  page?: number;

  /**
   * 地区代码
   */
  region?: string;

  /**
   * 排序方式
   */
  sort_by?: TMDBMovieSortBy;

  /**
   * 最早上映日期
   */
  "primary_release_date.gte"?: string;

  /**
   * 最晚上映日期
   */
  "primary_release_date.lte"?: string;

  /**
   * 最早发布日期
   */
  "release_date.gte"?: string;

  /**
   * 最晚发布日期
   */
  "release_date.lte"?: string;

  /**
   * 指定上映年份
   */
  year?: number;

  /**
   * 最低评分
   */
  "vote_average.gte"?: number;

  /**
   * 最高评分
   */
  "vote_average.lte"?: number;

  /**
   * 最低评分人数
   */
  "vote_count.gte"?: number;

  /**
   * 最高评分人数
   */
  "vote_count.lte"?: number;

  /**
   * 类型ID
   */
  with_genres?: string;

  /**
   * 关键词ID
   */
  with_keywords?: string;

  /**
   * 演员ID
   */
  with_cast?: string;

  /**
   * 工作人员ID
   */
  with_crew?: string;

  /**
   * 人物ID
   */
  with_people?: string;

  /**
   * 制作公司ID
   */
  with_companies?: string;

  /**
   * 原始语言
   */
  with_original_language?: string;

  /**
   * 最短片长，分钟
   */
  "with_runtime.gte"?: number;

  /**
   * 最长片长，分钟
   */
  "with_runtime.lte"?: number;

  /**
   * 流媒体平台ID
   */
  with_watch_providers?: string;

  /**
   * 流媒体地区
   */
  watch_region?: string;

  /**
   * 分级国家
   */
  certification_country?: string;

  /**
   * 电影分级
   */
  certification?: string;

  /**
   * 最大分级
   */
  certification_lte?: string;
}

/**
 * TMDB电影排序方式
 */
export type TMDBMovieSortBy =
  /**
   * 热度升序
   */
  | "popularity.asc"
  /**
   * 热度降序
   */
  | "popularity.desc"

  /**
   * 上映日期升序
   */
  | "release_date.asc"

  /**
   * 上映日期降序
   */
  | "release_date.desc"

  /**
   * 票房收入升序
   */
  | "revenue.asc"

  /**
   * 票房收入降序
   */
  | "revenue.desc"

  /**
   * 首次上映日期升序
   */
  | "primary_release_date.asc"

  /**
   * 首次上映日期降序
   */
  | "primary_release_date.desc"

  /**
   * 原始标题升序
   */
  | "original_title.asc"

  /**
   * 原始标题降序
   */
  | "original_title.desc"

  /**
   * 评分升序
   */
  | "vote_average.asc"

  /**
   * 评分降序
   */
  | "vote_average.desc"

  /**
   * 评分人数升序
   */
  | "vote_count.asc"

  /**
   * 评分人数降序
   */
  | "vote_count.desc";

/**
 * Discover Movie 返回结果
 */
export interface TMDBDiscoverMovieResponse {
  /**
   * 当前页码
   */
  page: number;

  /**
   * 原始查询条件
   */
  query?: Partial<TMDBDiscoverMovieQueryParams>;

  /**
   * 请求 ID
   */
  request_id?: string;

  /**
   * 电影列表
   */
  results: TMDBMovieResult[];

  /**
   * 总页数
   */
  total_pages: number;

  /**
   * 总数量
   */
  total_results: number;
}

/**
 * 电影基础信息
 */
export interface TMDBMovieResult {
  /**
   * 是否成人电影
   */
  adult: boolean;

  /**
   * 海报路径
   */
  poster_path: string | null;

  /**
   * 电影ID
   */
  id: number;

  /**
   * 背景图路径
   */
  backdrop_path: string | null;

  /**
   * 类型ID列表
   */
  genre_ids: number[];

  /**
   * 原始语言
   */
  original_language: string;

  /**
   * 原始标题
   */
  original_title: string;

  /**
   * 电影简介
   */
  overview: string;

  /**
   * 受欢迎程度
   */
  popularity: number;

  /**
   * 海外上映日期
   */
  release_date: string;

  /**
   * 电影标题
   */
  title: string;

  /**
   * 是否有视频
   */
  video: boolean;

  /**
   * 平均评分
   */
  vote_average: number;

  /**
   * 评分人数
   */
  vote_count: number;
}

const tmdbSortByValues = [
  "popularity.asc",
  "popularity.desc",
  "release_date.asc",
  "release_date.desc",
  "revenue.asc",
  "revenue.desc",
  "primary_release_date.asc",
  "primary_release_date.desc",
  "original_title.asc",
  "original_title.desc",
  "vote_average.asc",
  "vote_average.desc",
  "vote_count.asc",
  "vote_count.desc",
] as const;

export class TmdbDiscoverMovieQueryParamsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  max_results?: number;

  @IsOptional()
  @IsBoolean()
  include_adult?: boolean;

  @IsOptional()
  @IsBoolean()
  include_video?: boolean;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  @IsIn(tmdbSortByValues as unknown as string[])
  sort_by?: TMDBMovieSortBy;

  @IsOptional()
  @IsString()
  ['primary_release_date.gte']?: string;

  @IsOptional()
  @IsString()
  ['primary_release_date.lte']?: string;

  @IsOptional()
  @IsString()
  ['release_date.gte']?: string;

  @IsOptional()
  @IsString()
  ['release_date.lte']?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  year?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  ['vote_average.gte']?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  ['vote_average.lte']?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ['vote_count.gte']?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ['vote_count.lte']?: number;

  @IsOptional()
  @IsString()
  with_genres?: string;

  @IsOptional()
  @IsString()
  with_keywords?: string;

  @IsOptional()
  @IsString()
  with_cast?: string;

  @IsOptional()
  @IsString()
  with_crew?: string;

  @IsOptional()
  @IsString()
  with_people?: string;

  @IsOptional()
  @IsString()
  with_companies?: string;

  @IsOptional()
  @IsString()
  with_original_language?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ['with_runtime.gte']?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ['with_runtime.lte']?: number;

  @IsOptional()
  @IsString()
  with_watch_providers?: string;

  @IsOptional()
  @IsString()
  watch_region?: string;

  @IsOptional()
  @IsString()
  certification_country?: string;

  @IsOptional()
  @IsString()
  certification?: string;

  @IsOptional()
  @IsString()
  certification_lte?: string;
}

export async function validateTmdbQueryParams(params: Partial<TMDBDiscoverMovieQueryParams>): Promise<string | null> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "TMDB 查询参数必须是一个对象。";
  }

  const dto = plainToInstance(TmdbDiscoverMovieQueryParamsDto, params);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
  });

  if (errors.length > 0) {
    const firstError = errors[0];
    const message = firstError.constraints ? Object.values(firstError.constraints)[0] : "参数校验失败";
    return message;
  }

  return null;
}

@Injectable()
export class TmdbProvider {
  private readonly logger = new Logger(TmdbProvider.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly apiUrl =
    process.env.TMDB_API_URL || "https://api.themoviedb.org/3";

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async search(
    query: Partial<TMDBDiscoverMovieQueryParams>,
    options: Partial<TMDBDiscoverMovieQueryParams> = {},
  ): Promise<TMDBDiscoverMovieResponse> {
    if (!this.apiKey) {
      this.logger.error("TMDB API key is not configured.");
      throw new Error("TMDB API key is not configured.");
    }

    const language = options.language ?? "zh-CN";
    const page = String(options.page ?? "1");
    const include_adult = String(options.include_adult ?? false);
    const params = new URLSearchParams({
      language,
      page,
      include_adult,
    });

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });

    const url = `${this.apiUrl}/discover/movie?${params.toString()}`;

    this.logger.log(
      `TMDB search request: ${url}`,
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        accept: 'application/json',
        Authorization: 'Bearer ' + this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(
        `TMDB search request failed with status ${response.status}: ${errorText}`,
      );
      throw new Error(
        `TMDB search request failed with status ${response.status}`,
      );
    }

    const json = await response.json();
    const results = (Array.isArray(json.results) ? json.results : [])
      .slice(0, options.max_results ?? 4)
      .map((item: any) => ({
        title: item.title || item.original_title || "未知电影",
        url: item.id ? `https://www.themoviedb.org/movie/${item.id}` : "",
        overview: item.overview ?? "",
        score: item.vote_average ?? 0,
        release_date: item.release_date ?? "",
        poster_url: item.poster_path
          ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
          : "",
        id: item.id ?? 0,
        original_title: item.original_title,
      }));

    this.logger.log(`TMDB search response success: results=${results.length}`);
    return {
      page,
      total_pages: json.total_pages ?? 1,
      total_results: json.total_results ?? results.length,
      query,
      results,
      request_id: `${Date.now()}`,
    };
  }
}
