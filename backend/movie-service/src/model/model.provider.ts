import { Injectable, Logger } from "@nestjs/common";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { sleep } from "../movie/helpers";
import type { ChatMessage, CompatibleModel } from "../movie/types";

export class ModelConfigurationError extends Error {
  readonly stage = "model";
  readonly details = "ModelProvider 未返回可用模型";

  constructor() {
    super("模型未配置，无法执行推荐");
    this.name = ModelConfigurationError.name;
  }
}

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
          return typeof text === "string" ? text : String(text);
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

@Injectable()
export class ModelProvider {
  private model: CompatibleModel | null = null;
  private readonly logger = new Logger(ModelProvider.name);

  getModel(): CompatibleModel {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.SILICONFLOW_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error(
        "SILICONFLOW_API_KEY or OPENAI_API_KEY is not set. Model provider unavailable.",
      );
      throw new ModelConfigurationError();
    }

    const baseURL =
      process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
    const modelName = process.env.MODEL_NAME ?? "deepseek-ai/DeepSeek-V4-Flash";
    const temperature = Number(process.env.MODEL_TEMPERATURE ?? "0.3");

    this.logger.log("Initializing LangChain ChatOpenAI client");
    const client = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature,
      maxTokens: 16384,
      configuration: {
        baseURL,
      },
    });

    this.model = {
      async invoke(messages: ChatMessage[]) {
        await sleep(1000);

        try {
          Logger.log(`Model invocation start: model=${modelName}`);
          const response = await client.invoke(toLangChainMessages(messages));
          const text = extractContentText(response.content);
          Logger.log(`Model invocation completed: ${JSON.stringify(text)}`);
          return { content: text };
        } catch (error) {
          Logger.error("Error invoking LangChain model:", error);
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
