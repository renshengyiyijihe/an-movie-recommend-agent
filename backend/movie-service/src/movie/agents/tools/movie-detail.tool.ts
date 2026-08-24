import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";
import { TMDB_CONSTANTS } from "../../constants";
import { takeFirst } from "../../helpers";
import { commonToolSchema } from "./common";
import { TOOL_NAME } from "../../types";


/**
 * TMDB GET /movie/{movie_id} 电影详情接口完整响应类型
 */
export interface TmdbMovieDetailsResponse {
  /** 是否为成人电影 */
  adult: boolean;
  /** 背景大图相对路径 */
  backdrop_path: string | null;
  /** 所属系列/套盒信息（不属于系列则为 null） */
  belongs_to_collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  /** 制作预算（美元，未知时为 0） */
  budget: number;
  /** 类型列表 */
  genres: {
    id: number;
    name: string;
  }[];
  /** 官方网站 URL */
  homepage: string | null;
  /** TMDB 电影 ID */
  id: number;
  /** IMDb ID（例如 "tt1375666"） */
  imdb_id: string | null;
  /** 出产国家/地区代码列表 (ISO 3166-1) */
  origin_country: string[];
  /** 原始语言 (ISO 639-1) */
  original_language: string;
  /** 原版片名 */
  original_title: string;
  /** 剧情简介/梗概 */
  overview: string | null;
  /** 热度指数 */
  popularity: number;
  /** 竖版海报相对路径 */
  poster_path: string | null;
  /** 制作公司列表 */
  production_companies: {
    id: number;
    logo_path: string | null;
    name: string;
    origin_country: string;
  }[];
  /** 制作国家/地区列表 */
  production_countries: {
    /** 国家/地区二字代码 (ISO 3166-1) */
    iso_3166_1: string;
    /** 国家/地区名称 */
    name: string;
  }[];
  /** 上映日期（格式: "YYYY-MM-DD"） */
  release_date: string;
  /** 票房收入（美元，未知时为 0） */
  revenue: number;
  /** 片长（单位：分钟，未知时为 null） */
  runtime: number | null;
  /** 包含对白/语言列表 */
  spoken_languages: {
    english_name: string;
    iso_639_1: string;
    name: string;
  }[];
  /** 电影状态 */
  status: "Rumored" | "Planned" | "In Production" | "Post Production" | "Released" | "Canceled";
  /** 宣传标语/Slogan */
  tagline: string | null;
  /** 对应请求语言的显示片名 */
  title: string;
  /** 是否包含预告视频标志 */
  video: boolean;
  /** 平均评分 (0.0 ~ 10.0) */
  vote_average: number;
  /** 评价人数 */
  vote_count: number;

  // ------------------------------------------
  // append_to_response 条件注入的附加子资源
  // ------------------------------------------
  /** 演职员表（当 append_to_response 包含 'credits' 时返回） */
  credits?: {
    cast: {
      id: number;
      name: string;
      original_name: string;
      /** 饰演角色名 */
      character: string;
      /** 头像相对路径 */
      profile_path: string | null;
      /** 演员排序（0 为领衔主演） */
      order: number;
      cast_id: number;
      credit_id: string;
      adult: boolean;
      gender: number | null; // 0: 未知, 1: 女性, 2: 男性, 3: 非二元
      known_for_department: string;
      popularity: number;
    }[];
    crew: {
      id: number;
      name: string;
      original_name: string;
      /** 具体的职位（如 "Director"） */
      job: string;
      /** 部门（如 "Directing"） */
      department: string;
      profile_path: string | null;
      credit_id: string;
      adult: boolean;
      gender: number | null;
      known_for_department: string;
      popularity: number;
    }[];
  };
  /** 预告片与视频（当 append_to_response 包含 'videos' 时返回） */
  videos?: {
    results: {
      id: string;
      iso_639_1: string;
      iso_3166_1: string;
      name: string;
      /** 视频 Key（如 YouTube 视频 URL 的 key 参数） */
      key: string;
      /** 平台（如 "YouTube"） */
      site: string;
      size: number;
      /** 视频类型（如 "Trailer", "Behind the Scenes"） */
      type: string;
      official: boolean;
      published_at: string;
    }[];
  };
  /** 允许接收其他通过 append_to_response 追加的任意属性 */
  [key: string]: any;
}

export interface MovieDetailInput {
  movie_id: number;
  language?: string;
  append_to_response?: string;
}

/**
 * Movie Detail Tool - 查询电影基本信息
 * 用途：查询电影名、上映年份、评分、演员等基本信息
 * 示例：《星际穿越》是哪一年上映的
 */
@Injectable()
export class MovieDetailTool implements ITool {
  private readonly logger = new Logger(MovieDetailTool.name);

  name = TOOL_NAME.MOVIE_DETAIL;
  description =
    "根据 TMDB 电影 ID 查询电影详情，包括片名、上映日期、简介、海报，并可追加演职员、视频等资源；需要先通过其他工具获取 电影ID 后才能使用。";

  schema = {
    type: "object",
    properties: {
      movie_id: {
        type: "integer",
        description: "TMDB 电影 ID，例如《星际穿越》的 ID 为 157336",
      },
      language: commonToolSchema.language,
      append_to_response: {
        type: "string",
        description: `
          可选。将额外资源与电影详情一起返回，多个资源使用英文逗号分隔。

          可选资源：
          - credits：电影演职员信息，包括演员 cast 和工作人员 crew
          - videos：电影相关视频，例如预告片
          - images：电影相关图片，包括海报、背景图等
          - reviews：电影评论
          - similar：与当前电影相似的电影
          - keywords：电影相关关键词
          - release_dates：不同国家/地区的上映日期和发行认证信息

          例如：
          - 查询电影演员 → credits
          - 查询电影预告片 → videos
          - 查询电影图片 → images
          - 查询类似电影 → similar
          - 同时查询演员和视频 → credits,videos
          `,
      },
    },
    required: ["movie_id"],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: MovieDetailInput): Promise<ToolResult> {
    try {
      const movieId = input.movie_id;
      if (!Number.isInteger(movieId) || movieId <= 0) {
        return {
          success: false,
          data: "电影 ID 无效",
          error: "movie_id must be a positive integer",
        };
      }

      const language = input.language || TMDB_CONSTANTS.DEFAULT_LANGUAGE;
      const appendToResponse = input.append_to_response?.trim();

      this.logger.log(
        `[MovieDetailTool] Fetching movie details: movie_id=${movieId}, language=${language}, append_to_response=${appendToResponse || "none"}`,
      );

      const movieDetails = await this.tmdbProvider.get<TmdbMovieDetailsResponse>(
        `/3/movie/${movieId}`,
        { language, append_to_response: appendToResponse },
      );

      const credits = movieDetails.credits;
      const simplifiedResult = {
        movie_id: movieDetails.id,
        title: movieDetails.title,
        original_title: movieDetails.original_title,
        release_date: movieDetails.release_date,
        overview: movieDetails.overview,
        poster_path: movieDetails.poster_path,
        vote_average: movieDetails.vote_average,
        credits: credits
          ? {
              cast: takeFirst(credits.cast, TMDB_CONSTANTS.MAX_MOVIE_CAST).map(
                (person) => ({
                  id: person.id,
                  name: person.name,
                  character: person.character,
                }),
              ),
              crew: takeFirst(credits.crew, TMDB_CONSTANTS.MAX_MOVIE_CREW).map(
                (person) => ({
                  id: person.id,
                  name: person.name,
                  job: person.job,
                  department: person.department,
                }),
              ),
            }
          : undefined,
      };

      return {
        success: true,
        data: simplifiedResult,
        raw_result: movieDetails,
        structured_data: simplifiedResult,
        metadata: {
          movie_id: movieId,
          language,
          append_to_response: appendToResponse,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `[MovieDetailTool] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
