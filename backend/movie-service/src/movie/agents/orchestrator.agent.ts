import { Injectable, Logger } from "@nestjs/common";
import { PromptTemplateService } from "../services/prompt-template.service";
import { executeWithRetry, tryParseJson, truncateText } from "../helpers";
import { WORKFLOW_CONSTANTS } from "../constants";
import { RelationAgent } from "./relation.agent";
import { SearchAgent } from "./search.agent";
import { WorkflowContext } from "./workflow-context";
import { parseTaskPlan } from "../task-plan";
import {
  AGENT_TYPE,
  AgentExecutionResult,
  AgentType,
  CompatibleModel,
  INTENT_TYPE,
  IntentClassification,
  OrchestratorResult,
  TaskPlan,
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
      [AGENT_TYPE.SEARCH]: (model, ctx) =>
        this.searchAgent.execute(model, ctx.forAgent(AGENT_TYPE.SEARCH)),
      [AGENT_TYPE.RELATION]: (model, ctx) =>
        this.relationAgent.execute(model, ctx.forAgent(AGENT_TYPE.RELATION)),
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

      if (ctx.shared.intent.type === INTENT_TYPE.OUT_OF_SCOPE) {
        ctx.shared.finalResult =
          ctx.shared.intent.reason || "这个查询与电影或演员无关";
        return {
          success: false,
          intent_type: INTENT_TYPE.OUT_OF_SCOPE,
          result: ctx.shared.finalResult,
          agents_used: [],
        };
      }

      // 意图无法识别时立即短路，不再浪费后续规划/检索/汇总的调用。
      if (ctx.shared.intent.type === INTENT_TYPE.UNKNOWN) {
        ctx.shared.finalResult =
          ctx.shared.intent.reason || "无法识别本次查询的意图，请换个说法再试";
        return {
          success: false,
          intent_type: INTENT_TYPE.UNKNOWN,
          result: ctx.shared.finalResult,
          agents_used: [],
        };
      }

      const taskPlan = await this.planTask(model, ctx);
      ctx.shared.plan = taskPlan.agents;
      ctx.shared.relationPlan = taskPlan.relation;
      await ctx.record({
        kind: "plan",
        actor: "orchestrator",
        agents: ctx.shared.plan,
        relation: ctx.shared.relationPlan,
      });
      await this.executeAgentPlan(model, ctx);
      await this.fallbackSearchIfRelationFailed(model, ctx);
      ctx.shared.finalResult = await this.synthesizeResults(model, ctx);

      return {
        success: true,
        intent_type: INTENT_TYPE.IN_SCOPE,
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
        intent_type: INTENT_TYPE.UNKNOWN,
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

      if (
        !result ||
        (result.type !== INTENT_TYPE.IN_SCOPE &&
          result.type !== INTENT_TYPE.OUT_OF_SCOPE)
      ) {
        return {
          type: INTENT_TYPE.UNKNOWN,
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
        type: INTENT_TYPE.UNKNOWN,
        reason: error instanceof Error ? error.message : String(error),
        confidence: 0,
      };
    }
  }

  /**
   * 任务规划。relation 不可用时 parseTaskPlan 会收成 search。
   */
  private async planTask(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<TaskPlan> {
    try {
      const messages = this.promptTemplateService.getTaskPlanningPrompt(
        ctx.shared.query,
        ctx.shared.intent?.type ?? INTENT_TYPE.UNKNOWN,
        ctx.shared.turns,
      );
      return await executeWithRetry(async () => {
        const response = await model.invoke([
          ["system", messages.system],
          ["user", messages.user],
        ]);
        const result = tryParseJson(
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content),
        );
        if (!result) {
          throw new Error("模型返回的任务规划不是有效JSON");
        }
        return parseTaskPlan(result);
      });
    } catch (error) {
      this.logger.warn(
        `Task planning failed after retries: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Relation 失败且本轮还没跑过 Search 时，补一次 Search，不新开规划。
   */
  private async fallbackSearchIfRelationFailed(
    model: CompatibleModel,
    ctx: WorkflowContext,
  ): Promise<void> {
    if (!ctx.shared.plan.includes(AGENT_TYPE.RELATION)) return;
    if (ctx.shared.agentOutputs[AGENT_TYPE.RELATION]?.success) return;
    if (ctx.shared.agentOutputs[AGENT_TYPE.SEARCH]) return;

    this.logger.warn("[Orchestrator] Relation failed, falling back to search");
    ctx.shared.plan = [...ctx.shared.plan, AGENT_TYPE.SEARCH];
    await this.agentExecutors[AGENT_TYPE.SEARCH](model, ctx);

    const searchOutput = ctx
      .getPublicResults()
      .find((item) => item.agent === AGENT_TYPE.SEARCH);
    if (!searchOutput) {
      ctx.publish(AGENT_TYPE.SEARCH, {
        success: false,
        result: "Agent search 未发布公开结果",
      });
    }
    const recorded =
      ctx.getPublicResults().find((item) => item.agent === AGENT_TYPE.SEARCH) ?? {
        agent: AGENT_TYPE.SEARCH,
        success: false,
        result: "",
      };
    await ctx.record({
      kind: "agent_result",
      actor: AGENT_TYPE.SEARCH,
      success: recorded.success,
      result: this.parseAgentResult(recorded.result),
    });
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
