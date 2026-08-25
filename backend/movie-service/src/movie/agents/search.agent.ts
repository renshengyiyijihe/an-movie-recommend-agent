import { Injectable, Logger } from "@nestjs/common";
import { ToolsRegistry } from "./tools/tools.registry";
import { PromptTemplateService } from "../services/prompt-template.service";
import { RetryableFormatError } from "../errors/retryable-format.error";
import { executeWithRetry, tryParseJson } from "../helpers";
import { AGENT_TYPE, CompatibleModel, ConversationHistoryItem, LLM_STAGE, SearchAgentResult, VIEW_ANSWER, ViewSpec } from "../types";
import { invokeLlm, SEARCH_ACTOR } from "../invoke-llm";
import { TurnEventBody } from "../turn-events";
import { buildEvidenceView, toToolEventOutput, WorkingSet } from "../working-set";
import { AgentRuntime, SearchPrivateState } from "./workflow-context";
import { z } from "zod";

interface PlannedToolCall {
  tool_name: string;
  input: Record<string, any>;
}

interface ToolPlan {
  tool_calls: PlannedToolCall[];
  reasoning?: string;
}

const toolPlanSchema = z.object({
  tool_calls: z
    .array(
      z.object({
        tool_name: z.string().min(1),
        input: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(4),
  reasoning: z.string().optional(),
});

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
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  /**
   * Orchestrator 入口：读写自己的 local，并把可共享摘要 publish 到 shared。
   */
  async execute(
    model: CompatibleModel,
    runtime: AgentRuntime<SearchPrivateState>,
  ): Promise<void> {
    const result = await this.run(
      model,
      runtime.shared.query,
      runtime.shared.turns,
      (body) => runtime.record(body),
    );
    runtime.local.toolCalls = result.tool_calls;
    runtime.local.reasoning = result.reasoning;
    runtime.local.error = result.error;

    for (const call of result.tool_calls) {
      runtime.workspace.ingestToolData(call.tool_name, call.output?.data);
    }

    const anyToolOk = result.tool_calls.some(
      (call) => call.output?.success !== false,
    );
    const hasEvidence =
      runtime.workspace.listMovieIds().length > 0 ||
      runtime.workspace.listPeople().length > 0;
    if (!anyToolOk || !hasEvidence) {
      runtime.publish({
        success: false,
        result: result.result || "搜索未得到可用结果",
      });
      return;
    }

    runtime.publish({
      success: true,
      result: JSON.stringify(
        buildEvidenceView(runtime.workspace, inferSearchViewSpec(runtime.workspace)),
      ),
    });
  }

  /**
   * 规划并执行工具。不读写 WorkflowContext；摄入工作副本由 execute 负责。
   * @param record 写入 llm_usage，以及每个 tool 返回后的 tool_call
   */
  async run(
    model: CompatibleModel,
    query: string,
    turns?: ConversationHistoryItem[],
    record?: (body: TurnEventBody) => Promise<void>,
  ): Promise<SearchAgentResult> {
    this.logger.log(`[SearchAgent] Executing search: query=${query}`);

    try {
      // 第一步：让模型根据用户问题选择工具并生成调用参数。
      // Prompt 中携带了实时工具 schema，避免 SearchAgent 和具体工具参数重复维护。
      const prompt = this.promptTemplateService.getSearchToolPlanningPrompt(
        query,
        this.toolsRegistry.getToolSchemas(),
        turns,
      );

      // 模型可能返回非 JSON、未知工具或错误参数。
      // 校验失败会进入统一重试流程，而不是把不可信参数直接交给工具。
      const plan = await executeWithRetry(async () => {
        const responseContent = await invokeLlm(
          model,
          [
            ["system", prompt.system],
            ["user", prompt.user],
          ],
          {
            stage: LLM_STAGE.SEARCH_TOOLS,
            actor: SEARCH_ACTOR,
            record,
          },
        );
        const parsed = tryParseJson<ToolPlan>(
          this.toText(responseContent),
          "search",
        );
        if (!parsed) {
          throw new RetryableFormatError("模型返回的工具计划不是有效JSON");
        }
        try {
          return this.validateToolPlan(parsed);
        } catch (error) {
          throw new RetryableFormatError(
            error instanceof Error ? error.message : String(error),
          );
        }
      });

      // 第二步：由 Registry 统一执行工具，并记录完整调用信息。
      // SearchAgent 不负责生成最终自然语言回答，结果交给 OrchestratorAgent 汇总。
      const toolCalls: SearchAgentResult["tool_calls"] = [];
      for (const plannedCall of plan.tool_calls) {
        const output = await this.toolsRegistry.execute(
          plannedCall.tool_name,
          plannedCall.input,
        );
        toolCalls.push({
          tool_name: plannedCall.tool_name,
          input: plannedCall.input,
          output,
        });
        await record?.({
          kind: "tool_call",
          actor: AGENT_TYPE.SEARCH,
          tool_name: plannedCall.tool_name,
          input: plannedCall.input,
          output: toToolEventOutput(output),
        });
      }

      return {
        success: toolCalls.some((call) => call.output?.success !== false),
        result: JSON.stringify({
          query,
          results: toolCalls.map((call) => ({
            tool_name: call.tool_name,
            output: {
              success: call.output?.success !== false,
              data: call.output?.data ?? call.output?.structured_data,
              error: call.output?.error,
            },
          })),
        }),
        tool_calls: toolCalls,
        reasoning: plan.reasoning,
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
   * 用 Zod 校验模型生成的工具计划，并按注册工具的 schema 校验参数。
   */
  private validateToolPlan(value: ToolPlan): ToolPlan {
    const parsedPlan = toolPlanSchema.safeParse(value);
    if (!parsedPlan.success) {
      throw new Error(`模型返回的工具计划无效: ${parsedPlan.error.message}`);
    }

    const availableTools = new Map<string, Record<string, any>>(
      this.toolsRegistry
        .getToolSchemas()
        .map((tool) => [tool.name, tool.schema]),
    );
    const toolCalls = parsedPlan.data.tool_calls.map((toolCall) => {
      const schema = availableTools.get(toolCall.tool_name);
      if (!schema) {
        throw new Error(`模型选择了未注册的工具: ${toolCall.tool_name}`);
      }
      const inputSchema = this.jsonSchemaToZod(schema, toolCall.tool_name);
      const parsedInput = inputSchema.safeParse(toolCall.input);
      if (!parsedInput.success) {
        throw new Error(
          `工具 ${toolCall.tool_name} 的参数无效: ${parsedInput.error.message}`,
        );
      }

      return {
        tool_name: toolCall.tool_name,
        input: parsedInput.data as Record<string, any>,
      };
    });

    return { tool_calls: toolCalls, reasoning: parsedPlan.data.reasoning };
  }

  /**
   * 将当前工具使用的 JSON Schema 转换为 Zod schema。
   * 工具 schema 来自 Registry，因此 SearchAgent 不重复声明各工具参数。
   */
  private jsonSchemaToZod(
    schema: Record<string, any>,
    toolName: string,
  ): z.ZodTypeAny {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      const enumSchemas = schema.enum.map((value: string | number | boolean) =>
        z.literal(value),
      );
      return enumSchemas.length === 1
        ? enumSchemas[0]
        : z.union(enumSchemas as [typeof enumSchemas[0], typeof enumSchemas[0], ...typeof enumSchemas]);
    }

    switch (schema.type) {
      case "string":
        return z.string();
      case "number":
        return this.applyNumericBounds(z.number().finite(), schema);
      case "integer":
        return this.applyNumericBounds(z.number().int(), schema);
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(
          schema.items
            ? this.jsonSchemaToZod(schema.items, toolName)
            : z.unknown(),
        );
      case "object": {
        const properties = (schema.properties ?? {}) as Record<
          string,
          Record<string, any>
        >;
        const required = new Set(
          Array.isArray(schema.required) ? schema.required : [],
        );
        const shape = Object.fromEntries(
          Object.entries(properties).map(([name, propertySchema]) => {
            const property = this.jsonSchemaToZod(
              propertySchema,
              `${toolName}.${name}`,
            );
            return [name, required.has(name) ? property : property.optional()];
          }),
        );
        return z.object(shape);
      }
      default:
        return z.unknown();
    }
  }

  /**
   * 把 JSON Schema 的 minimum / maximum 接到 Zod 数字上。
   */
  private applyNumericBounds(
    schema: z.ZodNumber,
    source: Record<string, unknown>,
  ): z.ZodNumber {
    let bounded = schema;
    if (typeof source.minimum === "number") {
      bounded = bounded.min(source.minimum);
    }
    if (typeof source.maximum === "number") {
      bounded = bounded.max(source.maximum);
    }
    return bounded;
  }

  /**
   * 将不同模型适配器可能返回的 content 统一转换为可解析文本。
   */
  private toText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) =>
          typeof item === "object" && item !== null && "text" in item
            ? String((item as { text?: unknown }).text ?? "")
            : String(item ?? ""),
        )
        .join("");
    }
    return JSON.stringify(content ?? "");
  }
}

/**
 * Search 没有单独的视图规划：有片单或作品表则按 movies，否则按人物事实。
 * @param workspace 本轮已摄入的工作副本
 */
function inferSearchViewSpec(workspace: WorkingSet): ViewSpec {
  const hasMovies =
    workspace.getMovieIds().length > 0 ||
    workspace.listMovieIds().length > 0 ||
    workspace.listPeople().some((person) => person.credits.length > 0);
  return { answer: hasMovies ? VIEW_ANSWER.MOVIES : VIEW_ANSWER.FACT };
}
