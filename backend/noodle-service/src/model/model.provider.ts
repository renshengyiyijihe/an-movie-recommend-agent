import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class ModelProvider {
  private model: ChatOpenAI | null = null;
  private readonly logger = new Logger(ModelProvider.name);

  getModel() {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      this.logger.log('process.env', process.env);
      this.logger.error('NVIDIA_API_KEY is not set in environment variables.');
      return null;
    }

    this.model = new ChatOpenAI({
      model: "z-ai/glm-5.2",
      temperature: 0.3,
      apiKey,
      configuration: {
        baseURL: 'https://integrate.api.nvidia.com/v1',
      },
    });

    return this.model;
  }
}
