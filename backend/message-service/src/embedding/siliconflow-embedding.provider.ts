import { Injectable, Logger } from '@nestjs/common';

interface SiliconFlowEmbeddingResponse {
  data?: Array<{
    embedding?: number[];
    index?: number;
    object?: string;
  }>;
  model?: string;
  object?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

@Injectable()
export class SiliconFlowEmbeddingProvider {
  private readonly logger = new Logger(SiliconFlowEmbeddingProvider.name);

  private readonly apiKey = process.env.SILICONFLOW_API_KEY;
  private readonly baseUrl =
    process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1';
  private readonly modelName =
    process.env.SILICONFLOW_EMBEDDING_MODEL ?? 'BAAI/bge-m3';

  async generateEmbedding(text: string): Promise<number[]> {
    const normalizedText = text?.trim();
    if (!normalizedText) {
        this.logger.error('Input text for embedding is empty or whitespace');
    }

    if (!this.apiKey) {
      this.logger.error(
        'SILICONFLOW_API_KEY is not configured. Falling back to local hash embedding.',
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          input: normalizedText,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `SiliconFlow embedding request failed (${response.status}): ${errorBody}`,
        );
      }

      const payload = (await response.json()) as SiliconFlowEmbeddingResponse;
      const embedding = payload.data?.[0]?.embedding;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('SiliconFlow embedding response did not include a vector');
      }

      this.logger.log(
        `SiliconFlow embedding generated for model=${this.modelName}, length=${embedding.length}`,
      );

      return embedding.map((value) => Number(value));
    } catch (error) {
      this.logger.error(
        `Failed to call SiliconFlow embedding API: ${(error as Error).message}`,
        error as Error,
      );
      return this.generateFallbackEmbedding(normalizedText);
    }
  }

  private generateFallbackEmbedding(text: string): number[] {
    const embedding = new Array(1024).fill(0);
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    for (let i = 0; i < 1024; i++) {
      embedding[i] = ((hash * (i + 1)) % 100) / 100.0;
      hash = (hash * 33) ^ hash;
    }

    return embedding;
  }
}
