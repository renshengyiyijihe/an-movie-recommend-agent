import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";

/**
 * TMDB GET /search/person 搜索演职人员接口完整响应类型
 */
export interface TmdbPersonSearchResponse {
  /** 当前页码 */
  page: number;
  /** 搜索结果总页数 */
  total_pages: number;
  /** 搜索结果总条数 */
  total_results: number;
  /** 搜索匹配的演职人员列表 */
  results: {
    /** 是否为成人内容相关人物 */
    adult: boolean;
    /** 性别：0: 未知, 1: 女性, 2: 男性, 3: 非二元 */
    gender: number;
    /** TMDB 人物唯一 ID */
    id: number;
    /** 知名的专业领域（如 "Acting"、"Directing"） */
    known_for_department: string;
    /** 人物姓名 */
    name: string;
    /** 原始姓名 */
    original_name: string;
    /** 热度指数 */
    popularity: number;
    /** 头像/写真图相对路径 */
    profile_path: string | null;
    /** 知名代表作品列表摘要（可能包含电影或电视剧） */
    known_for: {
      /** 是否为成人内容 */
      adult?: boolean;
      /** 背景大图相对路径 */
      backdrop_path: string | null;
      /** 影视作品 ID */
      id: number;
      /** 媒体类型，如 "movie" 或 "tv" */
      media_type: "movie" | "tv";
      /** 电影名称（media_type 为 "movie" 时） */
      title?: string;
      /** 电视剧名称（media_type 为 "tv" 时） */
      name?: string;
      /** 原始电影片名 */
      original_title?: string;
      /** 原始电视剧名 */
      original_name?: string;
      /** 原始语言 (ISO 639-1) */
      original_language: string;
      /** 剧情梗概 */
      overview: string;
      /** 海报相对路径 */
      poster_path: string | null;
      /** 上映日期（电影） */
      release_date?: string;
      /** 首播日期（电视剧） */
      first_air_date?: string;
      /** 是否包含视频 */
      video?: boolean;
      /** 平均评分 */
      vote_average: number;
      /** 评价人数 */
      vote_count: number;
      /** 包含的类型 ID 列表 */
      genre_ids: number[];
      /** 热度指数 */
      popularity: number;
    }[];
  }[];
}

/**
 * Person Search Tool - 搜索演职人员输入参数接口
 */
export interface PersonSearchInput {
  query: string;
  include_adult?: boolean;
  language?: string;
  page?: number;
}

@Injectable()
export class PersonSearchTool implements ITool {
  private readonly logger = new Logger(PersonSearchTool.name);

  name = "person_search";
  description =
    "按演员、导演等演职人员姓名搜索 TMDB，返回人物 ID、姓名及代表作品，用于后续人物详情查询。";

  schema = {  
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "演职人员（演员/导演等）的姓名，支持中文和英文，例如 '克里斯托弗·诺兰' 或 'Leonardo DiCaprio'",
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
      page: {
        type: "integer",
        description: "指定获取的搜索结果页码，默认为 1",
      },
    },
    required: ["query"],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: PersonSearchInput): Promise<ToolResult> {
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
        `[PersonSearchTool] Searching person: query=${query}, language=${language}, include_adult=${includeAdult}, page=${page}`,
      );

      const params = new URLSearchParams({
        query,
        language,
        include_adult: String(includeAdult),
        page: String(page),
      });

      const url = `${this.tmdbProvider.getApiUrl()}/3/search/person?${params.toString()}`;
      const response = (await fetch(url, {
        method: "GET",
        headers: this.tmdbProvider.getRequestHeaders(),
      })) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TMDB search person request failed with status ${response.status}: ${errorText}`,
        );
      }

      const searchResult = (await response.json()) as TmdbPersonSearchResponse;

      const simplifiedResult = {
        page: searchResult.page,
        total_pages: searchResult.total_pages,
        total_results: searchResult.total_results,

        results: searchResult.results.map((person) => ({
          person_id: person.id,
          name: person.name,
          original_name: person.original_name,
          gender: person.gender,
          known_for: person.known_for.map((work) => ({
            id: work.id,
            title: work.title || work.name || "",
            release_date: work.release_date || work.first_air_date || "",
          })),
        })),
      };

      return {
        success: true,
        data: simplifiedResult,
        raw_result: searchResult,
        structured_data: simplifiedResult,
        metadata: {
          query,
          language,
          include_adult: includeAdult,
          page,
          total_results: simplifiedResult.total_results,
          total_pages: simplifiedResult.total_pages,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `[PersonSearchTool] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
