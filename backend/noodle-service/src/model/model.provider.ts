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
      model: 'gpt-4o-mini',
      temperature: 0.2,
      apiKey,
      configuration: {
        baseURL: 'https://api.openai.com/v1',
      },
    });

    return this.model;
  }
}
