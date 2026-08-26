import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { SiliconFlowEmbeddingProvider } from "../embedding/siliconflow-embedding.provider";

/** 一条待写入的跨会话记忆。 */
export interface MemoryRecord {
  /** 主键，取该轮 assistant 消息 id */
  memory_id: string;
  /** 会话主人，检索时必须按它过滤 */
  user_id: string;
  /** 记忆所属会话，用于把当前会话排除在召回之外 */
  conversation_id: string;
  /** 记忆所属轮次，便于回查 turn_events */
  turn_id: string;
  /** 自包含的一句话记忆，可直接进 prompt */
  memory_text: string;
  /** memory_text 的向量 */
  memory_embedding: number[];
}

/** 检索命中的一条记忆。 */
export interface MemoryHit {
  conversation_id: string;
  memory_text: string;
  /** COSINE 相似度，越大越相关 */
  score: number;
}

/** 记忆检索条件。`userId` 是安全边界，不允许缺省。 */
export interface SearchMemoriesOptions {
  userId: string;
  /** 当前会话，其记忆由时间序历史负责，不重复召回 */
  excludeConversationId?: string;
  limit: number;
  /** 低于该相似度的命中直接丢弃，宁可少召回也不往 prompt 里塞噪声 */
  minScore: number;
}

const COLLECTION_NAME = "conversation_memories";
/** 旧集合 schema 缺 user_id 且 metric 为 L2，无有效数据，启动时直接丢弃，不做迁移。 */
const LEGACY_COLLECTION_NAME = "message_summary_embeddings";
const EMBEDDING_DIMENSION = 1024;
/** 检索位于对话主链路的关键路径上，超时即放弃，不拖慢回答。 */
const SEARCH_TIMEOUT_MS = 1500;

/**
 * 过滤表达式里的字面量只接受 uuid 这类安全字符，
 * 含引号/反斜杠的一律拒绝，避免拼出越权的 filter。
 */
function isSafeFilterLiteral(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

@Injectable()
export class MilvusProvider implements OnModuleInit {
  private readonly logger = new Logger(MilvusProvider.name);
  private client: MilvusClient | null = null;

  constructor(
    private readonly siliconFlowEmbeddingProvider: SiliconFlowEmbeddingProvider,
  ) {}

  /**
   * Readiness：客户端已连上且 checkHealth 通过。
   */
  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error("Milvus client not initialized");
    }
    const healthCheck = await this.client.checkHealth();
    if (!healthCheck.isHealthy) {
      throw new Error("Milvus is not healthy");
    }
  }

  async onModuleInit() {
    try {
      await this.connect();
      await this.dropLegacyCollection();
      await this.ensureCollectionExists();
      await this.loadCollection();
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

  private async dropLegacyCollection() {
    if (!this.client) return;

    const exists = await this.client.hasCollection({
      collection_name: LEGACY_COLLECTION_NAME,
    });
    if (!exists.value) return;

    await this.client.dropCollection({
      collection_name: LEGACY_COLLECTION_NAME,
    });
    this.logger.log(`Dropped legacy collection ${LEGACY_COLLECTION_NAME}`);
  }

  private async ensureCollectionExists() {
    if (!this.client) {
      throw new Error("Milvus client not initialized");
    }

    const exists = await this.client.hasCollection({
      collection_name: COLLECTION_NAME,
    });
    if (exists.value) {
      this.logger.log(`Collection ${COLLECTION_NAME} already exists`);
      return;
    }

    this.logger.log(`Creating collection ${COLLECTION_NAME}`);

    await this.client.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [
        {
          name: "memory_id",
          description: "Primary key - assistant message id",
          data_type: "VarChar",
          is_primary_key: true,
          max_length: 100,
        },
        {
          name: "user_id",
          description: "Conversation owner - required search filter",
          data_type: "VarChar",
          max_length: 100,
        },
        {
          name: "conversation_id",
          description: "Source conversation",
          data_type: "VarChar",
          max_length: 100,
        },
        {
          name: "turn_id",
          description: "Source turn, for tracing back to turn_events",
          data_type: "VarChar",
          max_length: 100,
        },
        {
          name: "created_at",
          description: "Write time in epoch milliseconds",
          data_type: "Int64",
        },
        {
          name: "memory_text",
          description: "Self-contained one-line memory",
          data_type: "VarChar",
          max_length: 1000,
        },
        {
          name: "memory_embedding",
          description: "Vector embedding of memory_text",
          data_type: "FloatVector",
          dim: EMBEDDING_DIMENSION,
        },
      ],
      index_params: [
        {
          field_name: "memory_embedding",
          index_type: "IVF_FLAT",
          // bge-m3 输出归一化向量，COSINE 的分数区间稳定，阈值才好定
          metric_type: "COSINE",
          params: { nlist: 128 },
        },
      ],
    });

    this.logger.log(`Collection ${COLLECTION_NAME} created successfully`);
  }

  /** 集合必须先加载进查询节点才能检索，已存在的集合每次启动也要重新加载。 */
  private async loadCollection() {
    if (!this.client) return;
    await this.client.loadCollection({ collection_name: COLLECTION_NAME });
    this.logger.log(`Collection ${COLLECTION_NAME} loaded`);
  }

  /**
   * 写入一条记忆。失败只记日志，不影响调用方的主流程。
   */
  async addMemory(record: MemoryRecord): Promise<void> {
    if (!this.client) {
      this.logger.warn("Milvus client not initialized, skipping memory insert");
      return;
    }

    try {
      await this.client.insert({
        collection_name: COLLECTION_NAME,
        data: [
          {
            memory_id: record.memory_id,
            user_id: record.user_id,
            conversation_id: record.conversation_id,
            turn_id: record.turn_id,
            created_at: Date.now(),
            memory_text: record.memory_text,
            memory_embedding: record.memory_embedding,
          },
        ],
      });

      this.logger.log(
        `Memory inserted: memory_id=${record.memory_id} conversation_id=${record.conversation_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to insert memory: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 按向量检索该用户的记忆。任何异常、超时或不安全的过滤条件都返回空数组，
   * 调用方永远拿到可用结果，不需要自己兜底。
   */
  async searchMemories(
    embedding: number[],
    options: SearchMemoriesOptions,
  ): Promise<MemoryHit[]> {
    if (!this.client) {
      this.logger.warn("Milvus client not initialized");
      return [];
    }

    const filter = this.buildMemoryFilter(options);
    if (!filter) return [];

    try {
      const results = await this.withTimeout(
        this.client.search({
          collection_name: COLLECTION_NAME,
          data: [embedding],
          anns_field: "memory_embedding",
          filter,
          limit: options.limit,
          output_fields: ["conversation_id", "memory_text"],
        }),
        SEARCH_TIMEOUT_MS,
      );

      return (results.results ?? [])
        .filter((item) => item.score >= options.minScore)
        .map((item) => ({
          conversation_id: String(item.conversation_id ?? ""),
          memory_text: String(item.memory_text ?? ""),
          score: item.score,
        }))
        .filter((item) => Boolean(item.memory_text));
    } catch (error) {
      this.logger.error(
        `Failed to search memories: ${(error as Error).message}`,
        error as Error,
      );
      return [];
    }
  }

  /**
   * 拼 Milvus 过滤表达式。`user_id` 是越权边界，取值不安全时返回空串让调用方放弃检索，
   * 绝不降级成"不带 user_id 的全量检索"。
   */
  private buildMemoryFilter(options: SearchMemoriesOptions): string {
    if (!isSafeFilterLiteral(options.userId)) {
      this.logger.warn("Refusing to search memories with an unsafe user id");
      return "";
    }

    const clauses = [`user_id == "${options.userId}"`];
    const excluded = options.excludeConversationId;
    if (excluded && isSafeFilterLiteral(excluded)) {
      clauses.push(`conversation_id != "${excluded}"`);
    }
    return clauses.join(" and ");
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Milvus search timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * 生成文本 embedding，走硅基流动 BGE-M3 API。失败会抛出。
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.siliconFlowEmbeddingProvider.generateEmbedding(text);
  }
}
