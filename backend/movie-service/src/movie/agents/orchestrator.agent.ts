import { Injectable, Logger } from "@nestjs/common";
import { PromptTemplateService } from "../services/prompt-template.service";
import { executeWithRetry, tryParseJson, truncateText } from "../helpers";
import { WORKFLOW_CONSTANTS } from "../constants";
import { RelationAgent } from "./relation.agent";
import { SearchAgent } from "./search.agent";
import {
  AGENT_TYPES,
  AgentExecutionResult,
  AgentType,
  CompatibleModel,
  IntentClassification,
  IntentType,
  OrchestratorResult,
} from "../types";

type AgentExecutor = (
  model: CompatibleModel,
  query: string,
  conversationHistory?: string,
) => Promise<{ success: boolean; result: string }>;

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
  private readonly agentExecutors: Record<AgentType, AgentExecutor>;

  constructor(
    private readonly searchAgent: SearchAgent,
    private readonly relationAgent: RelationAgent,
    private readonly promptTemplateService: PromptTemplateService,
  ) {
    this.agentExecutors = {
      search: (model, query, conversationHistory) =>
        this.searchAgent.execute(model, query, conversationHistory),
      relation: (model, query, conversationHistory) =>
        this.relationAgent.execute(model, query, conversationHistory),
    };
  }

  async orchestrate(
    model: CompatibleModel,
    query: string,
    conversationHistory?: string,
  ): Promise<OrchestratorResult> {
    this.logger.log(`[Orchestrator] Processing query: ${query}`);

    try {
      // 步骤1: 意图识别
      const intent = await this.classifyIntent(model, query, conversationHistory);
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
      const plan = await this.planTask(
        model,
        query,
        intent.type,
        conversationHistory,
      );

      // 步骤3: 执行plan中指定的agents
      const agentResults = await this.executeAgentPlan(
        model,
        plan,
        query,
        conversationHistory,
      );

      // 步骤4: 根据检索结果生成最终推荐 JSON
      const finalResult = await this.synthesizeResults(
        model,
        query,
        agentResults,
        conversationHistory,
      );

      return {
        success: intent.type === "in_scope",
        intent_type: intent.type,
        result: finalResult,
        agents_used: plan,
        agent_results: agentResults,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Orchestrator] Error: ${message}`);
      return {
        success: false,
        intent_type: "unknown",
        result: `处理失败: ${message}`,
        agents_used: [],
        error: message,
      };
    }
  }

  /**
   * 意图识别 - 判断查询是否与电影/演员相关
   */

  private async classifyIntent(
    model: CompatibleModel,
    query: string,
    conversationHistory?: string,
  ): Promise<IntentClassification> {
    try {
      const messages = this.promptTemplateService.getIntentClassificationPrompt(
        query,
        conversationHistory,
      );
      const response = await model.invoke([
        ["system", messages.system],
        ["user", messages.user],
      ]);
      const result = tryParseJson<IntentClassification>(
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content),
      );

      if (!result || !["in_scope", "out_of_scope"].includes(result.type)) {
        return {
          type: "unknown",
          reason: "模型返回的意图分类结果无效",
          confidence: 0,
        };
      }

      return {
        type: result.type,
        confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
        reason: result.reason,
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
    conversationHistory?: string,
  ): Promise<AgentType[]> {
    try {
      const messages = this.promptTemplateService.getTaskPlanningPrompt(
        query,
        intentType,
        conversationHistory,
      );
      const parsed = await executeWithRetry(
        async () => {
          const response = await model.invoke([
            ["system", messages.system],
            ["user", messages.user],
          ]);
          const result = tryParseJson<{ agents?: unknown }>(
            typeof response.content === "string"
              ? response.content
              : JSON.stringify(response.content),
          );
          if (!result) {
            throw new Error("模型返回的任务规划不是有效JSON");
          }
          const agents = this.validateAgentPlan(result.agents);
          if (agents.length === 0) {
            throw new Error("模型返回了空的或无效的Agent计划");
          }
          return agents;
        },
      );
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Task planning failed after retries: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private validateAgentPlan(value: unknown): AgentType[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }

    if (!value.every((agent) => this.isAgentType(agent))) {
      this.logger.warn(`Invalid agent plan: ${JSON.stringify(value)}`);
      return [];
    }

    return Array.from(new Set(value));
  }

  private isAgentType(value: unknown): value is AgentType {
    return (
      typeof value === "string" &&
      (AGENT_TYPES as readonly string[]).includes(value)
    );
  }

  /**
   * 执行agent plan
   *
   * 新增agent时，只需要扩展AgentType和agentExecutors注册表，
   * 不需要修改这里的执行循环。
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
        const executor = this.agentExecutors[agentType];
        if (!executor) {
          results.push({
            agent: agentType,
            success: false,
            result: `未注册的Agent: ${agentType}`,
          });
          continue;
        }

        const result = await executor(model, query, conversationHistory);
        results.push({
          agent: agentType,
          success: result.success,
          result: result.result,
        });
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
   * 将各 Agent 的检索结果交给 LLM，整理成前端可解析的推荐 JSON。
   */
  private async synthesizeResults(
    model: CompatibleModel,
    query: string,
    agentResults: AgentExecutionResult[],
    conversationHistory?: string,
  ): Promise<string> {
    const emptyResult = (message: string, fallbackReason: string) =>
      JSON.stringify({
        recommendations: [],
        explanation: "",
        message,
        fallback_reason: fallbackReason,
      });

    const successfulResults = agentResults.filter((result) => result.success);
    if (successfulResults.length === 0) {
      return emptyResult(
        agentResults.map((result) => result.result).join("\n") ||
          "无法处理这个查询",
        "所有Agent均未成功返回可用结果",
      );
    }

    const evidence = this.compactAgentEvidence(successfulResults);
    const messages = this.promptTemplateService.getResultSynthesisPrompt(
      query,
      evidence,
      conversationHistory,
    );

    try {
      return await executeWithRetry(async () => {
        const response = await model.invoke([
          ["system", messages.system],
          ["user", messages.user],
        ]);
        const parsed = tryParseJson<Record<string, unknown>>(
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content),
        );
        if (!parsed || !Array.isArray(parsed.recommendations)) {
          throw new Error("模型返回的推荐结果不是有效JSON");
        }
        return JSON.stringify(parsed);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Orchestrator] Result synthesis failed: ${message}`);
      return emptyResult("无法根据检索结果生成推荐。", message);
    }
  }

  /**
   * 去掉 TMDB 原始大字段并截断，避免把过长证据塞进汇总 prompt。
   */
  private compactAgentEvidence(agentResults: AgentExecutionResult[]): string {
    const compacted = agentResults.map((item) => {
      const parsed = tryParseJson(item.result);
      return {
        agent: item.agent,
        success: item.success,
        result: parsed ? this.stripRawToolPayload(parsed) : item.result,
      };
    });

    return truncateText(
      JSON.stringify(compacted),
      WORKFLOW_CONSTANTS.MAX_SYNTHESIS_EVIDENCE_LENGTH,
    );
  }

  private stripRawToolPayload(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.stripRawToolPayload(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => key !== "raw_result")
          .map(([key, nested]) => [key, this.stripRawToolPayload(nested)]),
      );
    }
    return value;
  }
}
