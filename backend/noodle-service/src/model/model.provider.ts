import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

type ChatMessage = [string, string];

class OpenAIModelWrapper {
  constructor(
    private client: OpenAI,
    private modelName: string,
    private temperature = 0.3,
  ) {}

  async invoke(messages: ChatMessage[]) {
    const completion = await this.client.chat.completions.create({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "你好" }],
    });
    Logger.log("completion", completion, JSON.stringify(completion));

    const formatted = messages.map(([role, content]) => ({ role, content }));

    // Use chat completions; adapt to OpenAI SDK response shape
    const resp = await this.client.chat.completions.create({
      model: this.modelName,
      messages: formatted as any,
      temperature: this.temperature,
    });

    const anyResp: any = resp;
    const text =
      anyResp?.choices?.[0]?.message?.content ??
      anyResp?.choices?.[0]?.text ??
      "";

    return { content: String(text) };
  }
}

@Injectable()
export class ModelProvider {
  private model: OpenAIModelWrapper | null = null;
  private readonly logger = new Logger(ModelProvider.name);

  getModel() {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      this.logger.error(
        "NVIDIA_API_KEY is not set. Model provider unavailable.",
      );
      return null;
    }

    const baseURL = "https://integrate.api.nvidia.com/v1";
    const modelName = "deepseek-ai/deepseek-v4-flash";
    const temperature = process.env.NVIDIA_TEMPERATURE
      ? Number(process.env.NVIDIA_TEMPERATURE)
      : 0.3;

    this.logger.log("Initializing OpenAI client");
    const client = new OpenAI({ apiKey, baseURL });

    this.model = new OpenAIModelWrapper(client, modelName, temperature);

    this.logger.log(`OpenAI model provider configured: model=${modelName}`);
    return this.model;
  }
}
