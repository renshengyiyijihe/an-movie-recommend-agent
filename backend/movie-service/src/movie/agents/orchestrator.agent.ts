import { Injectable, Logger } from "@nestjs/common";
import { SearchAgent, SearchAgentResult } from "./search.agent";
import { RelationAgent, RelationAgentResult } from "./relation.agent";

export type CompatibleModel = {
  invoke(messages: Array<[string, string]>): Promise<{ content: unknown }>;
};

/**
 * Orchestrator Agent - 主控代理
 * 负责：
 *   1. 意图识别 - 判断查询是否与电影、演员相关
 *   2. 任务规划 - 根据意图决定调用哪些agent
 *   3. 结果汇总 - 整合来自不同agent的结果并生成最终答案
 */
@Injectable()
export class OrchestratorAgent {
  private readonly logger = new Logger(OrchestratorAgent.name);

  constructor(
    private readonly searchAgent: SearchAgent,
    private readonly relationAgent: RelationAgent,
  ) {}

  /**
   * 执行主控流程
   */
  async orchestrate(
    model: CompatibleModel,
    query: string,
    conversationHistory?: string,
  ): Promise<OrchestratorResult> {
    this.logger.log(`[Orchestrator] Processing query: ${query}`);

    try {
      // 步骤1: 意图识别
      const intent = await this.classifyIntent(model, query);
      this.logger.log(`[Orchestrator] Intent classification: ${intent.type}`);

      if (intent.type === "out_of_scope") {
        return {
          success: false,
          intent_type: "out_of_scope",
          result: intent.reason || "这个查询与电影或演员无关",
          agents_used: [],
        };
      }

      // 步骤2: 任务规划
      const plan = await this.planTask(model, query, intent.type);
      this.logger.log(`[Orchestrator] Task plan: ${JSON.stringify(plan)}`);

      // 步骤3: 执行plan中指定的agents
      const agentResults = await this.executeAgentPlan(
        model,
        plan,
        query,
        conversationHistory,
      );

      // 步骤4: 整合结果
      const finalResult = await this.synthesizeResults(
        model,
        query,
        agentResults,
        conversationHistory,
      );

      return {
        success: true,
        intent_type: intent.type,
        result: finalResult,
        agents_used: plan,
        agent_results: agentResults,
      };
    } catch (error) {
      this.logger.error(`[Orchestrator] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        intent_type: "unknown",
        result: `处理失败: ${error instanceof Error ? error.message : "未知错误"}`,
        agents_used: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 意图识别 - 判断查询是否与电影/演员相关
   */
  private async classifyIntent(
    model: CompatibleModel,
    query: string,
  ): Promise<IntentClassification> {
    try {
      // TODO: 使用LLM进行意图分类
      // 当前使用简单的关键字匹配
      
      const movieKeywords = [
        "电影", "movie", "film", "电影",
        "推荐", "recommend", "suggest",
        "演员", "actor", "actress", "导演", "director",
        "上映", "release", "评分", "rating", "票房",
        "观看", "watch", "看过", "追剧",
      ];

      const isMovieRelated = movieKeywords.some((keyword) =>
        query.toLowerCase().includes(keyword),
      );

      if (!isMovieRelated) {
        return {
          type: "out_of_scope",
          reason: "这个查询与电影或演员无关",
          confidence: 0.8,
        };
      }

      return {
        type: "in_scope",
        confidence: 0.9,
      };
    } catch (error) {
      return {
        type: "unknown",
        reason: error instanceof Error ? error.message : String(error),
        confidence: 0,
      };
    }
  }

  /**
   * 任务规划 - 根据意图决定调用哪些agent
   */
  private async planTask(
    model: CompatibleModel,
    query: string,
    intentType: IntentType,
  ): Promise<AgentType[]> {
    try {
      // TODO: 使用LLM进行任务规划
      // 当前使用简单的启发式规则
      
      const lowerQuery = query.toLowerCase();
      const plan: AgentType[] = [];

      // 检测是否是复杂的关系问题
      const relationshipKeywords = ["合作", "collaboration", "和...合作", "导演...电影"];
      const isRelationshipQuery = relationshipKeywords.some((kw) =>
        lowerQuery.includes(kw),
      );

      if (isRelationshipQuery) {
        plan.push("relation");
      } else {
        plan.push("search");
      }

      return plan;
    } catch (error) {
      // 默认使用search agent
      return ["search"];
    }
  }

  /**
   * 执行agent plan
   */
  private async executeAgentPlan(
    model: CompatibleModel,
    plan: AgentType[],
    query: string,
    conversationHistory?: string,
  ): Promise<AgentExecutionResult[]> {
    const results: AgentExecutionResult[] = [];

    for (const agentType of plan) {
      try {
        if (agentType === "search") {
          const result = await this.searchAgent.execute(
            model,
            query,
            conversationHistory,
          );
          results.push({
            agent: "search",
            success: result.success,
            result: result.result,
          });
        } else if (agentType === "relation") {
          const result = await this.relationAgent.execute(
            model,
            query,
            conversationHistory,
          );
          results.push({
            agent: "relation",
            success: result.success,
            result: result.result,
          });
        }
      } catch (error) {
        results.push({
          agent: agentType,
          success: false,
          result: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * 整合来自不同agent的结果
   */
  private async synthesizeResults(
    model: CompatibleModel,
    query: string,
    agentResults: AgentExecutionResult[],
    conversationHistory?: string,
  ): Promise<string> {
    try {
      // TODO: 使用LLM整合结果
      // 当前简单地合并所有结果
      
      const successResults = agentResults
        .filter((r) => r.success)
        .map((r) => r.result)
        .join("\n");

      if (successResults) {
        return successResults;
      }

      const errorResults = agentResults
        .filter((r) => !r.success)
        .map((r) => r.result)
        .join("\n");

      return errorResults || "无法处理这个查询";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}

export type IntentType = "in_scope" | "out_of_scope" | "unknown";
export type AgentType = "search" | "relation";

export interface IntentClassification {
  type: IntentType;
  confidence: number;
  reason?: string;
}

export interface AgentExecutionResult {
  agent: AgentType;
  success: boolean;
  result: string;
}

export interface OrchestratorResult {
  success: boolean;
  intent_type: IntentType;
  result: string;
  agents_used: AgentType[];
  agent_results?: AgentExecutionResult[];
  error?: string;
}
