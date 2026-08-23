import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";
import { GENRE_TO_TMDB_ID, TMDB_CONSTANTS } from "../../constants";
import { clampMaxResults } from "../../helpers";
import { commonToolSchema } from "./common";
import { TOOL_NAME } from "../../types";

/**
 * TMDB GET /discover/movie 按条件筛选电影接口完整响应类型
 */
export interface TmdbDiscoverMovieResponse {
  /** 当前页码 */
  page: number;
  /** 筛选结果总页数 */
  total_pages: number;
  /** 筛选结果总条数 */
  total_results: number;
  /** 匹配筛选条件的电影列表 */
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

export interface CustomDiscoverMovieInput {
  sort_order?: string;
}

/**
 * Discover Movie Tool - 筛选/推荐电影输入参数接口
 */
export interface DiscoverMovieInput extends CustomDiscoverMovieInput {
  language?: string;
  page?: number;
  sort_by?: string;
  include_adult?: boolean;
  include_video?: boolean;
  primary_release_year?: number;
  primary_release_date_gte?: string;
  primary_release_date_lte?: string;
  release_date_gte?: string;
  release_date_lte?: string;
  year?: number;
  vote_average_gte?: number;
  vote_average_lte?: number;
  vote_count_gte?: number;
  vote_count_lte?: number;
  with_runtime_gte?: number;
  with_runtime_lte?: number;
  with_genres?: string[];
  without_genres?: string[];
  with_keywords?: string;
  without_keywords?: string;
  with_companies?: string;
  without_companies?: string;
  with_cast?: string;
  with_crew?: string;
  with_people?: string;
  with_origin_country?: string;
  with_original_language?: string;
  certification?: string;
  certification_country?: string;
  region?: string;
}

export type CurrentDiscoverMovieInput = Pick<
  DiscoverMovieInput,
  | "language"
  | "page"
  | "sort_by"
  | "sort_order"
  | "include_adult"
  | "with_genres"
  | "without_genres"
  | "primary_release_year"
  | "vote_average_gte"
  | "with_cast"
  | "with_crew"
  | "with_people"
  | "with_original_language"
  | "with_runtime_gte"
  | "with_runtime_lte"
> & {
  /** 返回条数上限，默认 3，硬上限见 TMDB_CONSTANTS.MAX_RESULTS_LIMIT */
  max_results?: number;
};

@Injectable()
export class MovieDiscoverTool implements ITool {
  private readonly logger = new Logger(MovieDiscoverTool.name);

  name = TOOL_NAME.MOVIE_DISCOVER;
  description =
    "按类型、上映时间、评分、片长、原生语言、演职人员等条件筛选电影，并支持按热度、评分、票房、上映日期等方式排序。适用于电影推荐和条件筛选，例如“推荐高分科幻电影”“推荐诺兰参与且片长超过2小时的电影”。不适用于根据具体电影名称查询电影信息；已知或明确指定电影名称时，应使用 movie_search 工具。";

  schema = {
    type: "object",
    properties: {
      language: commonToolSchema.language,
      page: commonToolSchema.page,
      include_adult: commonToolSchema.include_adult,
      sort_by: {
        type: "string",
        enum: [
          "popularity",
          "rating",
          "revenue",
          "release_date",
          "title",
          "vote_count",
        ],
        description: `
    电影排序依据。
    - popularity：按 TMDB 热度排序,适用于“热门”、“最火”、“受欢迎”等需求。
    - rating：按平均评分排序,适用于“高分”、“评分最高”、“口碑好”等需求。
    - revenue：按票房收入排序,适用于“票房最高”、“最卖座”等需求。
    - release_date：按上映日期排序,适用于“最新”、“最近上映”、“最早上映”等需求。
    - title：按电影标题排序。
    - vote_count：按评分人数排序,适用于“评价人数最多”、“关注度高”等需求。
  `,
      },
      sort_order: {
        type: "string",
        enum: ["asc", "desc"],
        description: `
    排序方向，和sort_by搭配使用。
    - asc：升序，从小到大、从早到晚或从低到高。
    - desc：降序，从大到小、从晚到早或从高到低。

    常见默认选择：
    - 热门电影 → popularity + desc
    - 高分电影 → rating + desc
    - 最早电影 → release_date + asc
    `,
      },
      with_genres: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "动作",
            "冒险",
            "动画",
            "喜剧",
            "犯罪",
            "纪录",
            "剧情",
            "家庭",
            "奇幻",
            "历史",
            "恐怖",
            "音乐",
            "悬疑",
            "爱情",
            "科幻",
            "电视电影",
            "惊悚",
            "战争",
            "西部",
          ],
        },
        description: `
          直接传入中文类型名称，Tool 内部会自动转换为 TMDB Genre ID 
          多个类型默认使用 OR 逻辑，即满足其中任意一个类型即可。
          例如：["动作", "科幻"]表示：动作 或 科幻电影
          `,
      },
      without_genres: {
        type: "array",
        description: `排除的类型列表（不希望出现的类型），传值规范和 with_genres 相同`,
      },
      primary_release_year: {
        type: "integer",
        description: "筛选主要上映年份，例如 2023",
      },
      with_cast: {
        type: "string",
        description:
          "必须出现在主演中的 person_id。多个 ID 用英文逗号分隔，表示同时满足（AND）。",
      },
      with_crew: {
        type: "string",
        description:
          "必须出现在职员中的 person_id（含导演）。多个 ID 用英文逗号分隔，表示同时满足（AND）。",
      },
      with_people: {
        type: "string",
        description:
          "必须出现在演职员中的 person_id（不限职务）。多个 ID 用英文逗号分隔，表示同时满足（AND）。",
      },
      vote_average_gte: {
        type: "number",
        description: "最低平均评分，范围 0–10，例如 7.5",
      },
      max_results: commonToolSchema.max_results,
      with_original_language: {
        type: "string",
        description: "电影原声语言代码 (ISO 639-1)，如 'en'、'zh'、'ja'、'ko'",
      },
      with_runtime_gte: { type: "integer", description: "最低片长（分钟）" },
      with_runtime_lte: { type: "integer", description: "最高片长（分钟）" },
    },
    required: [],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: CurrentDiscoverMovieInput): Promise<ToolResult> {
    try {
      const language = input.language || TMDB_CONSTANTS.DEFAULT_LANGUAGE;
      const page = input.page && input.page > 0 ? input.page : 1;
      const includeAdult = input.include_adult ?? false;
      const sortBy = `${input.sort_by || "popularity"}.${input.sort_order || "desc"}`;
      const maxResults = clampMaxResults(
        input.max_results,
        TMDB_CONSTANTS.DEFAULT_MAX_RESULTS,
        TMDB_CONSTANTS.MAX_RESULTS_LIMIT,
      );

      this.logger.log(
        `[MovieDiscoverTool] Discovering movies: language=${language}, page=${page}, sort_by=${sortBy}, genres=${input.with_genres || "none"}`,
      );

      const params = new URLSearchParams({
        language,
        page: String(page),
        sort_by: sortBy,
        include_adult: String(includeAdult),
      });

      const directMappings: Array<[keyof CurrentDiscoverMovieInput, string]> = [
        ["primary_release_year", "primary_release_year"],
        ["with_cast", "with_cast"],
        ["with_crew", "with_crew"],
        ["with_people", "with_people"],
        ["with_original_language", "with_original_language"],
        ["with_runtime_gte", "with_runtime.gte"],
        ["with_runtime_lte", "with_runtime.lte"],
      ];

      for (const [inputKey, apiKey] of directMappings) {
        if (input[inputKey] !== undefined && input[inputKey] !== null) {
          params.set(apiKey, String(input[inputKey]).trim());
        }
      }

      if (input.vote_average_gte !== undefined && input.vote_average_gte !== null) {
        params.set("vote_average.gte", String(input.vote_average_gte));
      }

      if (Array.isArray(input.with_genres) && input.with_genres.length > 0) {
        const genreIds = input.with_genres
          .map((name) => GENRE_TO_TMDB_ID[name])
          .filter((id): id is number => Boolean(id));

        if (genreIds.length > 0) {
          // 多个 ID 用英文逗号分隔，代表 AND 逻辑（同时满足）
          params.set("with_genres", genreIds.join(","));
        }
      }

      if (
        Array.isArray(input.without_genres) &&
        input.without_genres.length > 0
      ) {
        const genreIds = input.without_genres
          .map((name) => GENRE_TO_TMDB_ID[name])
          .filter((id): id is number => Boolean(id));

        if (genreIds.length > 0) {
          params.set("without_genres", genreIds.join(","));
        }
      }

      const url = `${this.tmdbProvider.getApiUrl()}/3/discover/movie?${params.toString()}`;
      const response = (await fetch(url, {
        method: "GET",
        headers: this.tmdbProvider.getRequestHeaders(),
      })) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TMDB discover movie request failed with status ${response.status}: ${errorText}`,
        );
      }

      const searchResult = (await response.json()) as TmdbDiscoverMovieResponse;

      const simplifiedResult = {
        page: searchResult.page,
        total_pages: searchResult.total_pages,
        total_results: searchResult.total_results,
        results: searchResult.results.slice(0, maxResults).map((movie) => ({
          movie_id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          overview: movie.overview,
          poster_path: movie.poster_path,
          vote_average: movie.vote_average,
        })),
      };

      return {
        success: true,
        data: simplifiedResult,
        raw_result: searchResult,
        structured_data: simplifiedResult,
        metadata: {
          language,
          page,
          sort_by: sortBy,
          with_genres: input.with_genres,
          primary_release_year: input.primary_release_year,
          total_results: searchResult.total_results,
          total_pages: searchResult.total_pages,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `[MovieDiscoverTool] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `筛选失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
