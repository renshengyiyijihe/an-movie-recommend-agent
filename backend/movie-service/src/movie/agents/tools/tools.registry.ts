import { Injectable, Logger } from "@nestjs/common";
import { ITool, ToolResult } from "./tool.interface";
import { MovieDetailTool } from "./movie-detail.tool";
import { PersonInfoTool } from "./person-detail.tool";
import { PersonWorkTool } from "./person-work.tool";
import { MovieRecommendTool } from "./movie-recommend.tool";

/**
 * ToolsRegistry - Tools管理器
 * 负责管理和调用各种Tool
 */
@Injectable()
export class ToolsRegistry {
  private readonly logger = new Logger(ToolsRegistry.name);
  private readonly tools: Map<string, ITool> = new Map();

  constructor(
    private readonly movieDetailTool: MovieDetailTool,
    private readonly personInfoTool: PersonInfoTool,
    private readonly personWorkTool: PersonWorkTool,
    private readonly movieRecommendTool: MovieRecommendTool,
  ) {
    this.registerTools();
  }

  private registerTools() {
    this.tools.set(this.movieDetailTool.name, this.movieDetailTool);
    this.tools.set(this.personInfoTool.name, this.personInfoTool);
    this.tools.set(this.personWorkTool.name, this.personWorkTool);
    this.tools.set(this.movieRecommendTool.name, this.movieRecommendTool);
    
    this.logger.log(
      `Registered ${this.tools.size} tools: ${Array.from(this.tools.keys()).join(", ")}`,
    );
  }

  /**
   * 获取所有已注册的Tools
   */
  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取指定名称的Tool
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * 执行指定Tool
   */
  async execute(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        data: `Tool不存在: ${toolName}`,
        error: `Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
      };
    }

    try {
      this.logger.log(`Executing tool: ${toolName}, input=${JSON.stringify(input)}`);
      const result = await tool.execute(input);
      this.logger.log(
        `Tool execution completed: ${toolName}, success=${result.success}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        data: `执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取所有Tools的schema（用于LLM function calling）
   */
  getToolSchemas() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
    }));
  }
}
