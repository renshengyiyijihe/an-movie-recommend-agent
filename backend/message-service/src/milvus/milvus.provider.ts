import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { SiliconFlowEmbeddingProvider } from "../embedding/siliconflow-embedding.provider";

interface MessageEmbeddingRecord {
  message_id: string;
  conversation_id: string;
  summary: string;
  topics: string[];
  entities: string[];
  summary_embedding: number[];
}

interface MilvusSearchEmbeddingRecord {
  message_id: string;
  conversation_id: string;
  summary: string;
  topics: string[];
  entities: string[];
}

@Injectable()
export class MilvusProvider implements OnModuleInit {
  private readonly logger = new Logger(MilvusProvider.name);
  private client: MilvusClient | null = null;
  private readonly collectionName = "message_summary_embeddings";
  private readonly embeddingDimension = 1024;

  constructor(
    private readonly siliconFlowEmbeddingProvider: SiliconFlowEmbeddingProvider,
  ) {}

  async onModuleInit() {
    try {
      await this.connect();
      await this.ensureCollectionExists();
      this.logger.log("Milvus provider initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Milvus provider", error as Error);
      // 不抛异常，允许服务继续启动
    }
  }

  private async connect() {
    const milvusUrl = process.env.MILVUS_URL;
    if (!milvusUrl) {
      throw new Error("MILVUS_URL environment variable is required");
    }

    this.logger.log(`Connecting to Milvus at ${milvusUrl}`);
    this.client = new MilvusClient({
      address: milvusUrl,
      timeout: 30000,
    });

    // // 验证连接
    // const healthCheck = await this.client.checkHealth();
    // if (!healthCheck.isHealthy) {
    //   throw new Error(
    //     `Milvus health check failed ->> ${JSON.stringify(healthCheck)}`,
    //   );
    // }

    // 加上重试轮询，等 Milvus 容器完全启动初始化完成
    const maxRetries = 50;
    const stepDelay = 6000; 
    let isHealthy = false;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const healthCheck = await this.client.checkHealth();
        if (healthCheck.isHealthy) {
          isHealthy = true;
          this.logger.log("Milvus health check passed");
          break;
        }
      } catch (error) {
        // 启动初期失败是正常的，捕获后继续重试
        this.logger.warn(
          `Milvus health check attempt ${i + 1} failed: ${JSON.stringify(error)}`,
        );
      }

      this.logger.warn(
        `Milvus is not ready yet, retrying in ${stepDelay / 1000}s... (${i + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, stepDelay));
    }

    if (!isHealthy) {
      throw new Error("Milvus health check failed after retries");
    }
  }

  private async ensureCollectionExists() {
    if (!this.client) {
      throw new Error("Milvus client not initialized");
    }

    const collections = await this.client.listCollections();
    const exists = collections.data?.some(
      (col) => col.name === this.collectionName,
    );

    if (exists) {
      this.logger.log(`Collection ${this.collectionName} already exists`);
      return;
    }

    this.logger.log(`Creating collection ${this.collectionName}`);

    await this.client.createCollection({
      collection_name: this.collectionName,
      dimension: this.embeddingDimension,
      primary_field_name: "message_id",
      fields: [
        {
          name: "message_id",
          description: "Primary key - message ID",
          data_type: "VarChar",
          is_primary_key: true,
          max_length: 100,
        },
        {
          name: "conversation_id",
          description: "Conversation ID for grouping",
          data_type: "VarChar",
          max_length: 100,
        },
        {
          name: "summary",
          description: "Message summary text",
          data_type: "VarChar",
          max_length: 500,
        },
        {
          name: "topics",
          description: "Topics as JSON array",
          data_type: "VarChar",
          max_length: 1000,
        },
        {
          name: "entities",
          description: "Entities as JSON array",
          data_type: "VarChar",
          max_length: 1000,
        },
        {
          name: "summary_embedding",
          description: "Vector embedding of summary",
          data_type: "FloatVector",
          dim: this.embeddingDimension,
        },
      ],
      index_params: [
        {
          field_name: "summary_embedding",
          index_type: "IVF_FLAT",
          metric_type: "L2",
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
      this.logger.warn(
        "Milvus client not initialized, skipping record insertion",
      );
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
  async getMessagesByConversation(
    conversationId: string,
  ): Promise<MilvusSearchEmbeddingRecord[]> {
    if (!this.client) {
      this.logger.warn("Milvus client not initialized");
      return [];
    }

    try {
      const results = await this.client.search({
        collection_name: this.collectionName,
        filter: `conversation_id == "${conversationId}"`,
        limit: 100,
        output_fields: [
          "message_id",
          "conversation_id",
          "summary",
          "topics",
          "entities",
        ],
      });

      if (!results.results || results.results.length === 0) {
        return [];
      }

      return results.results.map((item) => ({
        message_id: item.message_id as string,
        conversation_id: item.conversation_id as string,
        summary: item.summary as string,
        topics: JSON.parse(item.topics as string) || [],
        entities: JSON.parse(item.entities as string) || [],
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
  ): Promise<MilvusSearchEmbeddingRecord[]> {
    if (!this.client) {
      this.logger.warn("Milvus client not initialized");
      return [];
    }

    try {
      let filter = "";
      if (conversationId) {
        filter = `conversation_id == "${conversationId}"`;
      }

      const results = await this.client.search({
        collection_name: this.collectionName,
        data: [embedding],
        annsField: "summary_embedding",
        filter: filter || undefined,
        limit,
        output_fields: [
          "message_id",
          "conversation_id",
          "summary",
          "topics",
          "entities",
        ],
      });

      if (!results.results || results.results.length === 0) {
        return [];
      }

      return results.results.map((item) => ({
        message_id: item.message_id as string,
        conversation_id: item.conversation_id as string,
        summary: item.summary as string,
        topics: JSON.parse((item.topics as string) || "[]"),
        entities: JSON.parse((item.entities as string) || "[]"),
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
   * 生成文本 embedding，优先走硅基流动 BGE-M3 API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.siliconFlowEmbeddingProvider.generateEmbedding(text);
  }
}
