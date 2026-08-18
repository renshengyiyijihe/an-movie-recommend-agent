import { Injectable, Logger } from "@nestjs/common";
import { ToolsRegistry } from "./tools/tools.registry";

export type CompatibleModel = {
  invoke(messages: Array<[string, string]>): Promise<{ content: unknown }>;
};

/**
 * Search Agent - 搜索代理
 * 负责使用Tools进行搜索操作
 * 可以执行Movie tool、PersonInfo tool、PersonWork tool、MovieRecommend tool
 */
@Injectable()
export class SearchAgent {
  private readonly logger = new Logger(SearchAgent.name);

  constructor(
    private readonly toolsRegistry: ToolsRegistry,
  ) {}

  /**
   * 执行搜索任务
   * @param model LLM模型
   * @param query 用户查询
   * @param conversationHistory 对话历史
   */
  async execute(
    model: CompatibleModel,
    query: string,
    conversationHistory?: string,
  ): Promise<SearchAgentResult> {
    this.logger.log(`[SearchAgent] Executing search: query=${query}`);

    try {
      // TODO: 使用AgentExecutor或ReAct pattern来让LLM调用Tools
      // 当前的langgraph实现需要更多上下文，这里留作后续补充
      
      return {
        success: true,
        result: "搜索完成",
        tool_calls: [],
        reasoning: "使用SearchAgent执行查询",
      };
    } catch (error) {
      this.logger.error(`[SearchAgent] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        result: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
        tool_calls: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取可用的Tools
   */
  getTools(): any[] {
    return this.toolsRegistry.getToolSchemas();
  }
}

export interface SearchAgentResult {
  success: boolean;
  result: string;
  tool_calls: Array<{
    tool_name: string;
    input: Record<string, any>;
    output: any;
  }>;
  reasoning?: string;
  error?: string;
}
