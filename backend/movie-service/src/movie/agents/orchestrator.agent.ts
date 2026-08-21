import { Injectable, Logger } from "@nestjs/common";
import { PromptTemplateService } from "../services/prompt-template.service";
import { executeWithRetry, tryParseJson, truncateText } from "../helpers";
import { WORKFLOW_CONSTANTS } from "../constants";
import { RelationAgent } from "./relation.agent";
import { SearchAgent } from "./search.agent";
import { WorkflowContext } from "./workflow-context";
import {
  AGENT_TYPES,
  AgentExecutionResult,
  AgentType,
  CompatibleModel,
  IntentClassification,
  OrchestratorResult,
} from "../types";

type AgentExecutor = (
  model: CompatibleModel,
  ctx: WorkflowContext,
) => Promise<void>;

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
      search: (model, ctx) =>
        this.searchAgent.execute(model, ctx.forAgent("search")),
      relation: (model, ctx) =>
        this.relationAgent.execute(model, ctx.forAgent("relation")),
    };
  }

  async orchestrate(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<OrchestratorResult> {
    this.logger.log(`[Orchestrator] Processing query: ${ctx.shared.query}`);

    try {
      ctx.shared.intent = await this.classifyIntent(model, ctx);
      await ctx.record({
        kind: "intent",
        actor: "orchestrator",
        intent: ctx.shared.intent,
      });
      this.logger.log(
        `[Orchestrator] Intent classification: ${ctx.shared.intent.type}`,
      );

      if (ctx.shared.intent.type === "out_of_scope") {
        ctx.shared.finalResult =
          ctx.shared.intent.reason || "这个查询与电影或演员无关";
        return {
          success: false,
          intent_type: "out_of_scope",
          result: ctx.shared.finalResult,
          agents_used: [],
        };
      }

      ctx.shared.plan = await this.planTask(model, ctx);
      await ctx.record({
        kind: "plan",
        actor: "orchestrator",
        agents: ctx.shared.plan,
      });
      await this.executeAgentPlan(model, ctx);
      ctx.shared.finalResult = await this.synthesizeResults(model, ctx);

      return {
        success: ctx.shared.intent.type === "in_scope",
        intent_type: ctx.shared.intent.type,
        result: ctx.shared.finalResult,
        agents_used: ctx.shared.plan,
        agent_results: ctx.getPublicResults(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Orchestrator] Error: ${message}`);
      ctx.shared.finalResult = `处理失败: ${message}`;
      await ctx.record({
        kind: "error",
        actor: "orchestrator",
        message,
      });
      return {
        success: false,
        intent_type: "unknown",
        result: ctx.shared.finalResult,
        agents_used: ctx.shared.plan,
        error: message,
      };
    }
  }

  /**
   * 意图识别 - 判断查询是否与电影/演员相关
   */
  private async classifyIntent(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<IntentClassification> {
    try {
      const messages = this.promptTemplateService.getIntentClassificationPrompt(
        ctx.shared.query,
        ctx.shared.turns,
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
    ctx: WorkflowContext,
  ): Promise<AgentType[]> {
    try {
      const messages = this.promptTemplateService.getTaskPlanningPrompt(
        ctx.shared.query,
        ctx.shared.intent?.type ?? "unknown",
        ctx.shared.turns,
      );
      const parsed = await executeWithRetry(async () => {
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
      });
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
   * 新增agent时，只需要扩展AgentType、AgentLocalMap和agentExecutors注册表，
   * 不需要修改这里的执行循环。
   */
  private async executeAgentPlan(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<void> {
    for (const agentType of ctx.shared.plan) {
      try {
        const executor = this.agentExecutors[agentType];
        if (!executor) {
          ctx.publish(agentType, {
            success: false,
            result: `未注册的Agent: ${agentType}`,
          });
        } else {
          await executor(model, ctx);
          if (!ctx.shared.agentOutputs[agentType]) {
            ctx.publish(agentType, {
              success: false,
              result: `Agent ${agentType} 未发布公开结果`,
            });
          }
        }
      } catch (error) {
        ctx.publish(agentType, {
          success: false,
          result: error instanceof Error ? error.message : String(error),
        });
      }

      const output = ctx.shared.agentOutputs[agentType];
      await ctx.record({
        kind: "agent_result",
        actor: agentType,
        success: output?.success ?? false,
        result: this.parseAgentResult(output?.result),
      });
    }
  }

  /**
   * 将各 Agent 的检索结果交给 LLM，整理成 text + movies JSON。
   */
  private async synthesizeResults(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<string> {
    const emptyResult = (text: string) =>
      JSON.stringify({
        text,
        movies: [],
      });

    const agentResults = ctx.getPublicResults();
    const successfulResults = agentResults.filter((result) => result.success);
    if (successfulResults.length === 0) {
      return emptyResult(
        agentResults.map((result) => result.result).join("\n") ||
          "无法处理这个查询",
      );
    }

    const evidence = this.compactAgentEvidence(successfulResults);
    const messages = this.promptTemplateService.getResultSynthesisPrompt(
      ctx.shared.query,
      evidence,
      ctx.shared.turns,
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
        if (!parsed) {
          throw new Error("模型返回的推荐结果不是有效JSON");
        }
        const movies = parsed.movies;
        if (!Array.isArray(movies)) {
          throw new Error("模型返回的推荐结果不是有效JSON");
        }
        return JSON.stringify(parsed);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Orchestrator] Result synthesis failed: ${message}`);
      return emptyResult("无法根据检索结果生成推荐。");
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

  private parseAgentResult(result: string | undefined): unknown {
    if (!result) return "";
    return tryParseJson(result) ?? result;
  }
}
