import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

interface MessageEmbeddingRecord {
  message_id: string;
  conversation_id: string;
  summary: string;
  topics: string[];
  entities: string[];
  summary_embedding: number[];
}

@Injectable()
export class MilvusProvider implements OnModuleInit {
  private readonly logger = new Logger(MilvusProvider.name);
  private client: MilvusClient | null = null;
  private readonly collectionName = 'message_summary_embeddings';

  async onModuleInit() {
    try {
      await this.connect();
      await this.ensureCollectionExists();
      this.logger.log('Milvus provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Milvus provider', error as Error);
      // 不抛异常，允许服务继续启动
    }
  }

  private async connect() {
    const milvusUrl = process.env.MILVUS_URL;
    if (!milvusUrl) {
      throw new Error('MILVUS_URL environment variable is required');
    }

    this.logger.log(`Connecting to Milvus at ${milvusUrl}`);
    this.client = new MilvusClient({
      address: milvusUrl,
      timeout: 30000,
    } as any);

    // 验证连接
    const healthCheck = await this.client.checkHealth();
    if (!healthCheck.isHealthy) {
      throw new Error('Milvus health check failed');
    }
  }

  private async ensureCollectionExists() {
    if (!this.client) {
      throw new Error('Milvus client not initialized');
    }

    const collections = await this.client.listCollections();
    const exists = collections.data?.some(
      (col) => col.name === this.collectionName,
    );

    if (exists) {
      this.logger.log(
        `Collection ${this.collectionName} already exists`,
      );
      return;
    }

    this.logger.log(`Creating collection ${this.collectionName}`);

    await this.client.createCollection({
      collection_name: this.collectionName,
      dimension: 384, // 通常的 embedding 维度，可根据实际调整
      primary_field_name: 'message_id',
      fields: [
        {
          name: 'message_id',
          description: 'Primary key - message ID',
          data_type: 'VarChar',
          is_primary_key: true,
          max_length: 100,
        },
        {
          name: 'conversation_id',
          description: 'Conversation ID for grouping',
          data_type: 'VarChar',
          max_length: 100,
        },
        {
          name: 'summary',
          description: 'Message summary text',
          data_type: 'VarChar',
          max_length: 500,
        },
        {
          name: 'topics',
          description: 'Topics as JSON array',
          data_type: 'VarChar',
          max_length: 1000,
        },
        {
          name: 'entities',
          description: 'Entities as JSON array',
          data_type: 'VarChar',
          max_length: 1000,
        },
        {
          name: 'summary_embedding',
          description: 'Vector embedding of summary',
          data_type: 'FloatVector',
          dim: 384,
        },
      ],
      index_params: [
        {
          field_name: 'summary_embedding',
          index_type: 'IVF_FLAT',
          metric_type: 'L2',
          params: { nlist: 128 },
        },
      ],
    });

    this.logger.log(`Collection ${this.collectionName} created successfully`);
  }

  /**
   * 向 Milvus 添加消息记录（包括向量和元数据）
   * 失败时只记录错误日志，不影响其他操作
   */
  async addMessageRecord(record: MessageEmbeddingRecord): Promise<void> {
    if (!this.client) {
      this.logger.warn('Milvus client not initialized, skipping record insertion');
      return;
    }

    try {
      await this.client.insert({
        collection_name: this.collectionName,
        data: [
          {
            message_id: record.message_id,
            conversation_id: record.conversation_id,
            summary: record.summary,
            topics: JSON.stringify(record.topics),
            entities: JSON.stringify(record.entities),
            summary_embedding: record.summary_embedding,
          },
        ],
      });

      this.logger.log(
        `Message record inserted into Milvus: message_id=${record.message_id}, conversation_id=${record.conversation_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to insert message record into Milvus: ${(error as Error).message}`,
        error as Error,
      );
      // 不抛异常，继续执行
    }
  }

  /**
   * 按 conversation_id 查询所有消息记录
   */
  async getMessagesByConversation(conversationId: string): Promise<
    MessageEmbeddingRecord[]
  > {
    if (!this.client) {
      this.logger.warn('Milvus client not initialized');
      return [];
    }

    try {
      const results = await this.client.search({
        collection_name: this.collectionName,
        filter: `conversation_id == "${conversationId}"`,
        limit: 100,
        output_fields: [
          'message_id',
          'conversation_id',
          'summary',
          'topics',
          'entities',
        ],
      });

      if (!results.results || results.results.length === 0) {
        return [];
      }

      return results.results.map((item) => ({
        message_id: item.message_id as string,
        conversation_id: item.conversation_id as string,
        summary: item.summary as string,
        topics: JSON.parse((item.topics as string) || '[]'),
        entities: JSON.parse((item.entities as string) || '[]'),
        summary_embedding: [], // 搜索结果通常不返回向量
      }));
    } catch (error) {
      this.logger.error(
        `Failed to query messages from Milvus: ${(error as Error).message}`,
        error as Error,
      );
      return [];
    }
  }

  /**
   * 向量相似度搜索
   */
  async searchBySummaryEmbedding(
    embedding: number[],
    conversationId?: string,
    limit = 5,
  ): Promise<MessageEmbeddingRecord[]> {
    if (!this.client) {
      this.logger.warn('Milvus client not initialized');
      return [];
    }

    try {
      let filter = '';
      if (conversationId) {
        filter = `conversation_id == "${conversationId}"`;
      }

      const results = await this.client.search({
        collection_name: this.collectionName,
        data: [embedding],
        annnField: 'summary_embedding',
        filter: filter || undefined,
        limit,
        output_fields: [
          'message_id',
          'conversation_id',
          'summary',
          'topics',
          'entities',
        ],
      });

      if (!results.results || results.results.length === 0) {
        return [];
      }

      return results.results.map((item) => ({
        message_id: item.message_id as string,
        conversation_id: item.conversation_id as string,
        summary: item.summary as string,
        topics: JSON.parse((item.topics as string) || '[]'),
        entities: JSON.parse((item.entities as string) || '[]'),
        summary_embedding: [],
      }));
    } catch (error) {
      this.logger.error(
        `Failed to search Milvus: ${(error as Error).message}`,
        error as Error,
      );
      return [];
    }
  }

  /**
   * 生成简单的文本向量表示（基于字符哈希）
   * 实际项目应使用真实的 embedding 模型（如 OpenAI、本地模型等）
   */
  generateEmbedding(text: string): number[] {
    // 简单的 hash 到向量的转换，仅用于演示
    // 实际项目应该调用专门的 embedding 服务
    const embedding: number[] = new Array(384).fill(0);
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    for (let i = 0; i < 384; i++) {
      embedding[i] = ((hash * (i + 1)) % 100) / 100.0;
      hash = (hash * 33) ^ hash;
    }

    return embedding;
  }
}
