import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";

/**
 * Movie Tool - 查询电影基本信息
 * 用途：查询电影名、上映年份、评分、演员等基本信息
 * 示例：《星际穿越》是哪一年上映的、《指环王》一共有几部
 */
@Injectable()
export class MovieTool implements ITool {
  private readonly logger = new Logger(MovieTool.name);
  
  name = "movie_search";
  description = "搜索电影基本信息，包括上映年份、评分、演员、评论数等。支持按电影名称搜索。";
  
  schema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "电影名称或关键词，支持中文和英文",
      },
      filters: {
        type: "object",
        description: "可选过滤条件",
        properties: {
          year: {
            type: "number",
            description: "上映年份（可选）",
          },
          language: {
            type: "string",
            description: "原声语言代码，如 'en', 'zh' 等（可选）",
          },
          sort_by: {
            type: "string",
            enum: [
              "popularity.desc",
              "vote_average.desc",
              "primary_release_date.desc",
            ],
            description: "排序方式（可选，默认按热度降序）",
          },
        },
      },
    },
    required: ["query"],
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: Record<string, any>): Promise<ToolResult> {
    try {
      const query = input.query?.trim();
      if (!query) {
        return {
          success: false,
          data: "查询词为空",
          error: "query is required",
        };
      }

      const filters = input.filters || {};
      const year = filters.year ? { year: filters.year } : {};
      const language = filters.language || "zh-CN";
      const sort_by = filters.sort_by || "popularity.desc";

      const searchParams = {
        sort_by,
        language,
        ...year,
      };

      this.logger.log(
        `[MovieTool] Searching for movies: query=${query}, filters=${JSON.stringify(filters)}`,
      );

      const response = await this.tmdbProvider.search(
        { ...searchParams },
        { language, max_results: 5 },
      );

      const movies = response.results.map((movie: any) => ({
        id: movie.id,
        title: movie.title,
        original_title: movie.original_title,
        release_date: movie.release_date,
        release_year: movie.release_date ? new Date(movie.release_date).getFullYear() : "未知",
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        popularity: movie.popularity,
        overview: movie.overview?.substring(0, 200),
        original_language: movie.original_language,
        poster_path: movie.poster_path,
      }));

      const summary = movies
        .map(
          (m: any) =>
            `《${m.title}》(${m.original_title}) - 上映年份: ${m.release_year}, 评分: ${m.vote_average}/10, 评论数: ${m.vote_count}`,
        )
        .join("\n");

      return {
        success: true,
        data: summary,
        raw_result: response,
        structured_data: movies,
        metadata: {
          query,
          filters,
          total_results: response.total_results,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`[MovieTool] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        data: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
