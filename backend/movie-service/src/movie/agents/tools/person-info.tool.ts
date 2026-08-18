import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";

/**
 * Person Info Tool - 查询演员基本信息
 * 用途：查询演员的年龄、性别、出生地、生平介绍等基本信息
 * 示例：成龙多大了、小李子是哪年出生的
 */
@Injectable()
export class PersonInfoTool implements ITool {
  private readonly logger = new Logger(PersonInfoTool.name);
  
  name = "person_info";
  description = "查询演员或导演的基本信息，包括年龄、出生日期、出生地、性别、生平介绍等。";
  
  schema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "演员或导演名称，支持中文和英文",
      },
      filters: {
        type: "object",
        description: "可选过滤条件",
        properties: {
          type: {
            type: "string",
            enum: ["actor", "director", "all"],
            description: "搜索类型：演员、导演或全部（可选，默认为全部）",
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

      this.logger.log(`[PersonInfoTool] Searching for person: query=${query}`);

      // TODO: 集成TMDB Person API
      // 当前返回占位符响应
      return {
        success: true,
        data: `演员或导演信息：正在查询 "${query}" 的基本信息...`,
        structured_data: {
          name: query,
          birthday: "待查询",
          age: "待查询",
          place_of_birth: "待查询",
          biography: "待查询",
        },
        metadata: {
          query,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`[PersonInfoTool] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        data: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
