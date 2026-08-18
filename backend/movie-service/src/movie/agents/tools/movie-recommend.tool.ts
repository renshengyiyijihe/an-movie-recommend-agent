import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { TmdbProvider } from "../../../model/tmdb.provider";

/**
 * Movie Recommend Tool - 推荐电影
 * 用途：根据类型、评分、时长等条件推荐电影
 * 示例：推荐几部科幻类型的高分电影、推荐2024年最新的喜剧电影
 */
@Injectable()
export class MovieRecommendTool implements ITool {
  private readonly logger = new Logger(MovieRecommendTool.name);
  
  name = "movie_recommend";
  description = "根据多种条件（类型、评分、年份、时长等）推荐高质量的电影。";
  
  schema = {
    type: "object",
    properties: {
      filters: {
        type: "object",
        description: "推荐条件",
        properties: {
          genres: {
            type: "array",
            items: { type: "string" },
            description: "类型列表，如 ['科幻', '动作', '喜剧'] 等",
          },
          min_rating: {
            type: "number",
            description: "最低评分（0-10）",
          },
          max_rating: {
            type: "number",
            description: "最高评分（0-10）",
          },
          year: {
            type: "number",
            description: "指定年份",
          },
          year_range: {
            type: "object",
            properties: {
              start: { type: "number" },
              end: { type: "number" },
            },
            description: "年份范围",
          },
          min_runtime: {
            type: "number",
            description: "最短时长（分钟）",
          },
          max_runtime: {
            type: "number",
            description: "最长时长（分钟）",
          },
          language: {
            type: "string",
            description: "原声语言代码，如 'en', 'zh' 等",
          },
          sort_by: {
            type: "string",
            enum: [
              "popularity.desc",
              "vote_average.desc",
              "primary_release_date.desc",
            ],
            description: "排序方式",
          },
        },
      },
      limit: {
        type: "number",
        description: "返回推荐数量（默认5）",
      },
    },
  };

  constructor(private readonly tmdbProvider: TmdbProvider) {}

  async execute(input: Record<string, any>): Promise<ToolResult> {
    try {
      const filters = input.filters || {};
      const limit = input.limit || 5;

      this.logger.log(
        `[MovieRecommendTool] Generating recommendations: filters=${JSON.stringify(filters)}, limit=${limit}`,
      );

      // 构建查询参数
      const queryParams: any = {
        sort_by: filters.sort_by || "popularity.desc",
        language: filters.language || "zh-CN",
      };

      // 处理评分条件
      if (filters.min_rating !== undefined) {
        queryParams["vote_average.gte"] = filters.min_rating;
      }
      if (filters.max_rating !== undefined) {
        queryParams["vote_average.lte"] = filters.max_rating;
      }

      // 处理年份条件
      if (filters.year !== undefined) {
        queryParams.year = filters.year;
      } else if (filters.year_range) {
        queryParams["primary_release_date.gte"] = `${filters.year_range.start}-01-01`;
        queryParams["primary_release_date.lte"] = `${filters.year_range.end}-12-31`;
      }

      // 处理时长条件
      if (filters.min_runtime !== undefined) {
        queryParams["with_runtime.gte"] = filters.min_runtime;
      }
      if (filters.max_runtime !== undefined) {
        queryParams["with_runtime.lte"] = filters.max_runtime;
      }

      // TODO: 处理类型条件（需要映射类型名称到TMDB ID）
      // if (filters.genres && filters.genres.length > 0) {
      //   queryParams.with_genres = this.mapGenresToTmdbIds(filters.genres);
      // }

      const response = await this.tmdbProvider.search(
        queryParams,
        { language: filters.language || "zh-CN", max_results: limit },
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
        overview: movie.overview?.substring(0, 300),
        original_language: movie.original_language,
        poster_path: movie.poster_path,
      }));

      const summary = movies
        .map(
          (m: any) =>
            `《${m.title}》 (${m.original_title}) - ${m.release_year}年 | 评分: ${m.vote_average}/10 | 评论数: ${m.vote_count}`,
        )
        .join("\n");

      return {
        success: true,
        data: `推荐以下电影：\n${summary}`,
        raw_result: response,
        structured_data: movies,
        metadata: {
          filters,
          limit,
          total_returned: movies.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`[MovieRecommendTool] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        data: `推荐失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
