import { Injectable, Logger } from "@nestjs/common";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MetricsRegistry } from "@an-movie/auth-client";
import { asRecord, readFiniteNumber } from "../movie/helpers";
import type {
  ChatMessage,
  CompatibleModel,
  LlmStage,
  LlmUsage,
} from "../movie/types";

export class ModelConfigurationError extends Error {
  readonly stage = "model";
  readonly details = "ModelProvider 未返回可用模型";

  constructor() {
    super("模型未配置，无法执行推荐");
    this.name = ModelConfigurationError.name;
  }
}

const LLM_DURATION = "llm_call_duration_seconds";
const LLM_DURATION_HELP = "LLM call duration in seconds";
const LLM_TOKENS = "llm_tokens_total";
const LLM_TOKENS_HELP = "LLM tokens consumed";

const toLangChainMessages = (messages: ChatMessage[]) =>
  messages.map(([role, content]) => {
    switch (role) {
      case "assistant":
        return new AIMessage(content);
      case "system":
        return new SystemMessage(content);
      case "user":
      default:
        return new HumanMessage(content);
    }
  });

const extractContentText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item === "object" && item !== null) {
          const text = (item as { text?: string }).text ?? JSON.stringify(item);
          return typeof text === "string" ? text : String(item);
        }
        return String(item ?? "");
      })
      .join("");
  }

  if (typeof content === "object" && content !== null) {
    return JSON.stringify(content);
  }

  return String(content ?? "");
};

/**
 * 从 LangChain 响应里抽出 token 用量。
 * @example
 * `{ usage_metadata: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } }`
 * → `{ promptTokens: 10, completionTokens: 4, totalTokens: 14 }`
 * `{ response_metadata: { tokenUsage: { promptTokens: 10 } } }`
 * → `{ promptTokens: 10 }`（其余字段缺省）
 */
function readTokenUsage(
  response: unknown,
): Pick<LlmUsage, "promptTokens" | "completionTokens" | "totalTokens"> {
  const rec = asRecord(response);
  if (!rec) return {};

  const usageMeta = asRecord(rec.usage_metadata);
  if (usageMeta) {
    return {
      promptTokens: readFiniteNumber(usageMeta.input_tokens),
      completionTokens: readFiniteNumber(usageMeta.output_tokens),
      totalTokens: readFiniteNumber(usageMeta.total_tokens),
    };
  }

  const responseMeta = asRecord(rec.response_metadata);
  const tokenUsage =
    asRecord(responseMeta?.tokenUsage) ??
    asRecord(responseMeta?.token_usage) ??
    asRecord(rec.usage);
  if (!tokenUsage) return {};

  return {
    promptTokens:
      readFiniteNumber(tokenUsage.promptTokens) ??
      readFiniteNumber(tokenUsage.prompt_tokens) ??
      readFiniteNumber(tokenUsage.input_tokens),
    completionTokens:
      readFiniteNumber(tokenUsage.completionTokens) ??
      readFiniteNumber(tokenUsage.completion_tokens) ??
      readFiniteNumber(tokenUsage.output_tokens),
    totalTokens:
      readFiniteNumber(tokenUsage.totalTokens) ??
      readFiniteNumber(tokenUsage.total_tokens),
  };
}

@Injectable()
export class ModelProvider {
  private model: CompatibleModel | null = null;
  private readonly logger = new Logger(ModelProvider.name);

  constructor(private readonly metrics: MetricsRegistry) {}

  getModel(): CompatibleModel {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      this.logger.error("LLM_API_KEY is not set. Model provider unavailable.");
      throw new ModelConfigurationError();
    }

    const baseURL =
      process.env.LLM_BASE_URL ?? "https://api.siliconflow.cn/v1";
    const modelName = process.env.MODEL_NAME ?? "deepseek-ai/DeepSeek-V4-Flash";
    const temperature = Number(process.env.MODEL_TEMPERATURE ?? "0.3");

    this.logger.log("Initializing LangChain ChatOpenAI client");
    const client = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature,
      maxTokens: 16384,
      // 单次请求超时与 SDK 层重试（覆盖网络错误 / 429 / 5xx）。
      // 业务层 executeWithRetry 只重试 RetryableFormatError。
      timeout: 60_000,
      maxRetries: 1,
      configuration: {
        baseURL,
      },
    });

    const metrics = this.metrics;
    const logger = this.logger;

    this.model = {
      async invoke(messages: ChatMessage[], options: { stage: LlmStage }) {
        const started = Date.now();
        try {
          const response = await client.invoke(toLangChainMessages(messages));
          const durationMs = Date.now() - started;
          const tokens = readTokenUsage(response);
          const usage: LlmUsage = {
            durationMs,
            ok: true,
            model: modelName,
            ...tokens,
          };
          recordLlmMetrics(metrics, logger, options.stage, usage);
          return {
            content: extractContentText(response.content),
            usage,
          };
        } catch (error) {
          const durationMs = Date.now() - started;
          recordLlmMetrics(metrics, logger, options.stage, {
            durationMs,
            ok: false,
            model: modelName,
          });
          logger.error("Error invoking LangChain model:", error as Error);
          throw error;
        }
      },
    };

    this.logger.log(
      `LangChain model provider configured: model=${modelName}, baseURL=${baseURL}`,
    );
    return this.model;
  }
}

function recordLlmMetrics(
  metrics: MetricsRegistry,
  logger: Logger,
  stage: LlmStage,
  usage: LlmUsage,
): void {
  logger.log({
    msg: "llm_call",
    stage,
    duration_ms: usage.durationMs,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    model: usage.model,
    ok: usage.ok,
  } as never);
  metrics.observe(
    LLM_DURATION,
    LLM_DURATION_HELP,
    { stage, ok: String(usage.ok) },
    usage.durationMs / 1000,
  );
  if (usage.promptTokens) {
    metrics.inc(LLM_TOKENS, LLM_TOKENS_HELP, { stage, type: "prompt" }, usage.promptTokens);
  }
  if (usage.completionTokens) {
    metrics.inc(
      LLM_TOKENS,
      LLM_TOKENS_HELP,
      { stage, type: "completion" },
      usage.completionTokens,
    );
  }
}
