import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";

/**
 * TMDB GET /search/movie 搜索电影接口完整响应类型
 */
export interface TmdbMovieSearchResponse {
  /** 当前页码 */
  page: number;
  /** 搜索结果总页数 */
  total_pages: number;
  /** 搜索结果总条数 */
  total_results: number;
  /** 搜索匹配的电影列表 */
  results: {
    /** 是否为成人电影 */
    adult: boolean;
    /** 背景大图相对路径 */
    backdrop_path: string | null;
    /** 类型 ID 数组 */
    genre_ids: number[];
    /** TMDB 电影 ID */
    id: number;
    /** 原始语言 (ISO 639-1) */
    original_language: string;
    /** 原版片名 */
    original_title: string;
    /** 剧情简介/梗概 */
    overview: string;
    /** 热度指数 */
    popularity: number;
    /** 竖版海报相对路径 */
    poster_path: string | null;
    /** 上映日期（格式: "YYYY-MM-DD"） */
    release_date: string;
    /** 对应请求语言的显示片名 */
    title: string;
    /** 是否包含预告视频标志 */
    video: boolean;
    /** 平均评分 (0.0 ~ 10.0) */
    vote_average: number;
    /** 评价人数 */
    vote_count: number;
  }[];
}

/**
 * Movie Search Tool - 搜索电影输入参数接口
 */
export interface MovieSearchInput {
  query: string;
  include_adult?: boolean;
  language?: string;
  primary_release_year?: string;
  page?: number;
  region?: string;
  year?: string;
}

@Injectable()
export class MovieSearchTool implements ITool {
  private readonly logger = new Logger(MovieSearchTool.name);

  name = "movie_search";
  description =
    "按电影名称或关键词搜索 TMDB 电影，返回电影 ID、片名、上映日期和简介，用于后续详情查询。";

  schema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "需要搜索的电影片名或关键字，例如 '星际穿越' 或 'Inception'",
      },
      include_adult: {
        type: "boolean",
        description: "是否包含成人内容选项，默认为 false",
      },
      language: {
        type: "string",
        description:
          "返回内容的语言。遵循 IETF language tag 格式，通常为 ISO 639-1 两位语言代码 + ISO 3166-1 alpha-2 两位地区代码，例如 'zh-CN'、'zh-TW'、'en-US'、'en-GB'、'ja-JP'、'ko-KR'。默认使用 'en-US'。",
      },
      primary_release_year: {
        type: "string",
        description: "可选。筛选主要上映年份（四位数字格式 YYYY，如 '2014'）",
      },
      page: {
        type: "integer",
        description: "指定获取的搜索结果页码，默认为 1",
      },
      region: {
        type: "string",
        description: "可选。指定电影上映地区, 指定地区代码（ISO 3166-1 alpha-2），如 'US'、'CN'",
      },
      year: {
        type: "string",
        description: "可选。筛选任意上映年份（四位数字格式 YYYY）",
      },
    },
    required: ["query"],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: MovieSearchInput): Promise<ToolResult> {
    try {
      const query = input.query?.trim();
      if (!query) {
        return {
          success: false,
          data: "搜索词为空",
          error: "query is required",
        };
      }

      const language = input.language || "en-US";
      const includeAdult = input.include_adult ?? false;
      const page = input.page && input.page > 0 ? input.page : 1;

      this.logger.log(
        `[MovieSearchTool] Searching movie: query=${query}, language=${language}, include_adult=${includeAdult}, page=${page}`,
      );

      const params = new URLSearchParams({
        query,
        language,
        include_adult: String(includeAdult),
        page: String(page),
      });

      const directMappings: Array<[keyof MovieSearchInput, string]> = [
        ["primary_release_year", "primary_release_year"],
        ["region", "region"],
        ["year", "year"],
      ];

      for (const [inputKey, apiKey] of directMappings) {
        if (input[inputKey] !== undefined && input[inputKey] !== null) {
          params.set(apiKey, String(input[inputKey]).trim());
        }
      }

      const url = `${this.tmdbProvider.getApiUrl()}/3/search/movie?${params.toString()}`;
      const response = (await fetch(url, {
        method: "GET",
        headers: this.tmdbProvider.getRequestHeaders(),
      })) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TMDB search movie request failed with status ${response.status}: ${errorText}`,
        );
      }

      const searchResult = (await response.json()) as TmdbMovieSearchResponse;

      const simplifiedResult = {
        page: searchResult.page,
        total_pages: searchResult.total_pages,
        total_results: searchResult.total_results,

        results: searchResult.results.map((movie) => ({
          movie_id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.overview,
        })),
      };

      return {
        success: true,
        data: simplifiedResult,
        raw_result: simplifiedResult,
        structured_data: simplifiedResult,
        metadata: {
          query,
          language,
          include_adult: includeAdult,
          page,
          primary_release_year: input.primary_release_year,
          region: input.region,
          year: input.year,
          total_results: simplifiedResult.total_results,
          total_pages: simplifiedResult.total_pages,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `[MovieSearchTool] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
