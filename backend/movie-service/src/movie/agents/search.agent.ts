import { Injectable, Logger } from "@nestjs/common";
import { ToolsRegistry } from "./tools/tools.registry";
import { PromptTemplateService } from "../services/prompt-template.service";
import { executeWithRetry, tryParseJson } from "../helpers";
import { CompatibleModel, SearchAgentResult } from "../types";
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
      // 第一步：让模型根据用户问题选择工具并生成调用参数。
      // Prompt 中携带了实时工具 schema，避免 SearchAgent 和具体工具参数重复维护。
      const prompt = this.promptTemplateService.getSearchToolPlanningPrompt(
        query,
        this.toolsRegistry.getToolSchemas(),
        conversationHistory,
      );

      // 模型可能返回非 JSON、未知工具或错误参数。
      // 校验失败会进入统一重试流程，而不是把不可信参数直接交给工具。
      const plan = await executeWithRetry(async () => {
        const response = await model.invoke([
          ["system", prompt.system],
          ["user", prompt.user],
        ]);
        const parsed = tryParseJson<ToolPlan>(this.toText(response.content));
        if (!parsed) {
          throw new Error("模型返回的工具计划不是有效JSON");
        }
        return this.validateToolPlan(parsed);
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
      }

      return {
        success: toolCalls.every((call) => call.output?.success !== false),
        result: JSON.stringify({
          query,
          results: toolCalls.map((call) => ({
            tool_name: call.tool_name,
            output: call.output,
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
   * 获取可用的Tools
   */
  getTools(): any[] {
    return this.toolsRegistry.getToolSchemas();
  }

  /**
   * 用 Zod 校验模型生成的工具计划，并按注册工具的 schema 校验参数。
   */
  private validateToolPlan(value: ToolPlan): ToolPlan {
    const parsedPlan = toolPlanSchema.safeParse(value);
    if (!parsedPlan.success) {
      throw new Error(`模型返回的工具计划无效: ${parsedPlan.error.message}`);
    }

    const availableTools = new Map(
      this.toolsRegistry
        .getToolSchemas()
        .map((tool) => [tool.name, tool.schema] as const),
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
        return z.number().finite();
      case "integer":
        return z.number().int();
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
        return z.object(shape).passthrough();
      }
      default:
        return z.unknown();
    }
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
