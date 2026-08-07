import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { LangSmithProvider } from "./langsmith.provider";

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = [ChatRole, string];

type OpenAIChatMessage = {
  role: ChatRole;
  content: string;
};

class OpenAIModelWrapper {
  constructor(
    private client: OpenAI,
    private modelName: string,
    private temperature = 0.3,
    private langsmithProvider?: LangSmithProvider,
  ) {}

  async invoke(messages: ChatMessage[]) {
    const formatted: OpenAIChatMessage[] = messages.map(([role, content]) => ({
      role,
      content,
    }));

    let resp;

    Logger.log("formatted messages:", formatted);
    // Use chat completions; OpenAI SDK expects messages as objects with role/content
    try {
      Logger.log(`Model invocation start`);
      resp = await this.client.chat.completions.create({
        model: this.modelName,
        messages: formatted,
        temperature: this.temperature,
        max_tokens: 16384,
      });
    } catch (error) {
      Logger.error("Error invoking model:", error);
      throw error;
    }
    Logger.log(`Model invocation completed`);

    const anyResp: any = resp;
    const text =
      anyResp?.choices?.[0]?.message?.content ??
      anyResp?.choices?.[0]?.text ??
      "";

    if (this.langsmithProvider?.isEnabled()) {
      await this.langsmithProvider.createRun(
        'LLM Chat Completion',
        {
          model: this.modelName,
          messages: formatted,
        },
        {
          response: String(text),
          raw_response: JSON.stringify(anyResp),
        },
        {
          llm: true,
          model: this.modelName,
          run_stage: 'chat_completion',
        },
        'llm',
      );
    }

    return { content: String(text) };
  }
}

@Injectable()
export class ModelProvider {
  private model: OpenAIModelWrapper | null = null;
  private readonly logger = new Logger(ModelProvider.name);

  constructor(private readonly langsmithProvider: LangSmithProvider) {}

  getModel() {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    Logger.log( `apiKey: ${apiKey}; process.env: ${JSON.stringify(process.env)}`);
    if (!apiKey) {
      this.logger.error(
        "NVIDIA_API_KEY is not set. Model provider unavailable.",
      );
      return null;
    }

    const baseURL = "https://integrate.api.nvidia.com/v1";
    // const modelName = "z-ai/glm-5.2";
    const modelName = "minimaxai/minimax-m3";
    const temperature = process.env.NVIDIA_TEMPERATURE
      ? Number(process.env.NVIDIA_TEMPERATURE)
      : 0.3;

    this.logger.log("Initializing OpenAI client");
    const client = new OpenAI({
      apiKey,
      baseURL,
      logLevel: "debug"
    });

    this.model = new OpenAIModelWrapper(client, modelName, temperature, this.langsmithProvider);

    this.logger.log(`OpenAI model provider configured: model=${modelName}`);
    return this.model;
  }
}
