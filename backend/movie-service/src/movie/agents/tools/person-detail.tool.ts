import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";
import { TMDB_CONSTANTS } from "../../constants";
import { commonToolSchema } from "./common";

/**
 * TMDB GET /person/{person_id} 人物详情接口完整响应类型
 */
export interface TmdbPersonDetailsResponse {
  /** 是否为成人内容相关人物 */
  adult: boolean;
  /** 也被称为 / 别名列表 */
  also_known_as: string[];
  /** 生平传记 / 简介 */
  biography: string;
  /** 出生日期（格式: "YYYY-MM-DD"） */
  birthday: string | null;
  /** 逝世日期（若尚在世则为 null，格式: "YYYY-MM-DD"） */
  deathday: string | null;
  /** 性别：0: 未知, 1: 女性, 2: 男性, 3: 非二元 */
  gender: number;
  /** 个人主页 URL */
  homepage: string | null;
  /** TMDB 人物唯一 ID */
  id: number;
  /** IMDb 人物唯一 ID（例如 "nm0000138"） */
  imdb_id: string;
  /** 知名的专业领域（如 "Acting"、"Directing"） */
  known_for_department: string;
  /** 出生地点 */
  place_of_birth: string | null;
  /** 人物姓名 */
  name: string;
  /** 热度指数 */
  popularity: number;
  /** 头像/壁照相对路径 */
  profile_path: string | null;

  // ------------------------------------------
  // append_to_response 条件注入的附加子资源
  // ------------------------------------------
  /** 参演及制作作品集（当 append_to_response 包含 'movie_credits' 或 'combined_credits' 时返回） */
  movie_credits?: {
    cast: {
      id: number;
      title: string;
      original_title: string;
      character: string;
      release_date: string;
      poster_path: string | null;
      vote_average: number;
      vote_count: number;
      adult: boolean;
      popularity: number;
      credit_id: string;
    }[];
    crew: {
      id: number;
      title: string;
      original_title: string;
      job: string;
      department: string;
      release_date: string;
      poster_path: string | null;
      vote_average: number;
      vote_count: number;
      adult: boolean;
      popularity: number;
      credit_id: string;
    }[];
  };
  /** 人物相关剧照/写真图片（当 append_to_response 包含 'images' 时返回） */
  images?: {
    profiles: {
      aspect_ratio: number;
      height: number;
      iso_639_1: string | null;
      file_path: string;
      vote_average: number;
      vote_count: number;
      width: number;
    }[];
  };
  /** 外部平台社交账号链接（当 append_to_response 包含 'external_ids' 时返回） */
  external_ids?: {
    freebase_mid?: string | null;
    freebase_id?: string | null;
    tvdb_id?: number | null;
    tvrage_id?: number | null;
    wikidata_id?: string | null;
    facebook_id?: string | null;
    instagram_id?: string | null;
    tiktok_id?: string | null;
    twitter_id?: string | null;
    youtube_id?: string | null;
  };
  /** 允许接收其他通过 append_to_response 追加的任意属性 */
  [key: string]: any;
}

/**
 * Person Detail Tool - 查询演职人员详细信息
 * 用途：通过 person_id 获取演员或导演的年龄、出生日期、出生地、生平介绍、参演作品等
 */
export interface PersonDetailInput {
  person_id: number;
  language?: string;
  append_to_response?: string;
}

@Injectable()
export class PersonDetailTool implements ITool {
  private readonly logger = new Logger(PersonDetailTool.name);

  name = "person_detail";
  description =
    "根据 TMDB 演职人员 ID 查询人物简介、出生信息、代表作品，并可追加电影作品、图片和外部账号。需要先通过其他工具获取 人物ID 后才能使用。";

  schema = {
    type: "object",
    properties: {
      person_id: {
        type: "integer",
        description: "TMDB 人物 ID，例如克里斯托弗·诺兰的 ID 为 525，莱昂纳多·迪卡普里奥的 ID 为 6193",
      },
      language: commonToolSchema.language,
      append_to_response: {
        type: "string",
        description: `
          可选。将额外资源与人物详情一起返回，多个资源使用英文逗号分隔。

          可选资源：
          - movie_credits：该人物参与的电影作品列表（含主演 cast 与幕后 crew）
          - tv_credits：该人物参与的电视剧作品列表
          - combined_credits：该人物参与的所有影视作品组合列表
          - images：该人物的照片/剧照/写真图片
          - external_ids：该人物在各外部平台（如 Twitter、Instagram、IMDb）的 ID 链接
          - tagged_images：该人物被标记的图片

          例如：
          - 查询演员参演的电影列表 → movie_credits
          - 查询演职员写真照片 → images
          - 查询社交账号链接 → external_ids
          - 同时查询作品集和照片 → movie_credits,images
          `,
      },
    },
    required: ["person_id"],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: PersonDetailInput): Promise<ToolResult> {
    try {
      const personId = input.person_id;
      if (!Number.isInteger(personId) || personId <= 0) {
        return {
          success: false,
          data: "人物 ID 无效",
          error: "person_id must be a positive integer",
        };
      }

      const language = input.language || TMDB_CONSTANTS.DEFAULT_LANGUAGE;
      const appendToResponse = input.append_to_response?.trim();

      this.logger.log(
        `[PersonDetailTool] Fetching person details: person_id=${personId}, language=${language}, append_to_response=${appendToResponse || "none"}`,
      );

      const params = new URLSearchParams({ language });
      if (appendToResponse) {
        params.set("append_to_response", appendToResponse);
      }

      const url = `${this.tmdbProvider.getApiUrl()}/3/person/${personId}?${params.toString()}`;
      const response = (await fetch(url, {
        method: "GET",
        headers: this.tmdbProvider.getRequestHeaders(),
      })) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TMDB person details request failed with status ${response.status}: ${errorText}`,
        );
      }

      const personDetails = (await response.json()) as TmdbPersonDetailsResponse;

      const simplifiedResult = {
        person_id: personDetails.id,
        name: personDetails.name,
        original_name: personDetails.also_known_as,
        gender: personDetails.gender,
        birthday: personDetails.birthday,
        deathday: personDetails.deathday,
        place_of_birth: personDetails.place_of_birth,
        biography: personDetails.biography,
        movie_credits: personDetails.movie_credits?.cast.map((work) => ({
          id: work.id,
          title: work.title,
          release_date: work.release_date,
        })),
      };

      return {
        success: true,
        data: simplifiedResult,
        raw_result: personDetails,
        structured_data: simplifiedResult,
        metadata: {
          person_id: personId,
          language,
          append_to_response: appendToResponse,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `[PersonDetailTool] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
