import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';


@Injectable()
export class ModelProvider {
  private model: ChatOpenAI | null = null;

  getModel() {
    if (this.model) {
      return this.model;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
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
