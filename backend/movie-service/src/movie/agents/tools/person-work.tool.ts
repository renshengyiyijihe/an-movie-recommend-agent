import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";

/**
 * Person Work Tool - 查询演员或导演的作品
 * 用途：查询演员演过哪些电影、导演执导过哪些电影等
 * 示例：小李子演过哪些比较经典的电影、李安执导过哪些电影
 */
@Injectable()
export class PersonWorkTool implements ITool {
  private readonly logger = new Logger(PersonWorkTool.name);
  
  name = "person_work";
  description = "查询演员或导演的作品列表，包括电影名称、角色、上映年份、评分等。";
  
  schema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "演员或导演名称",
      },
      filters: {
        type: "object",
        description: "可选过滤条件",
        properties: {
          work_type: {
            type: "string",
            enum: ["acting", "directing", "all"],
            description: "工作类型：表演、执导或全部（可选，默认为全部）",
          },
          sort_by: {
            type: "string",
            enum: ["popularity", "vote_average", "release_date"],
            description: "排序方式（可选，默认按热度）",
          },
          limit: {
            type: "number",
            description: "返回作品数量限制（可选，默认为10）",
          },
        },
      },
    },
    required: ["query"],
  };

  constructor() {}

  async execute(input: Record<string, any>): Promise<ToolResult> {
    try {
      const query = input.query?.trim();
      if (!query) {
        return {
          success: false,
          data: "搜索词为空",
          error: "query is required",
        };
      }

      const filters = input.filters || {};
      const workType = filters.work_type || "all";
      const sortBy = filters.sort_by || "popularity";
      const limit = filters.limit || 10;

      this.logger.log(
        `[PersonWorkTool] Searching for works: query=${query}, workType=${workType}, sortBy=${sortBy}`,
      );

      // TODO: 集成TMDB Credits API
      // 当前返回占位符响应
      return {
        success: true,
        data: `正在查询 "${query}" 的作品列表...`,
        structured_data: {
          person_name: query,
          work_type: workType,
          works: [],
          total_works: 0,
        },
        metadata: {
          query,
          work_type: workType,
          sort_by: sortBy,
          limit,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`[PersonWorkTool] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        data: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
