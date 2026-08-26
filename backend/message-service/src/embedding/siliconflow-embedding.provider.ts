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

  /**
   * 文本 → 向量。任何失败都抛出，不返回占位向量：
   * 非语义向量一旦写进集合就既检索不到也识别不出，只会永久污染数据。
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const normalizedText = text?.trim();
    if (!normalizedText) {
      throw new Error('Input text for embedding is empty or whitespace');
    }

    if (!this.apiKey) {
      throw new Error('SILICONFLOW_API_KEY is not configured');
    }

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
  }
}
