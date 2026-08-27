import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { UserContext } from "@an-movie/auth-client";
import {
  FINISHED_TURN_STATUSES,
  TURN_STATUS,
  isFinishedTurnStatus,
  type FinishedTurnStatus,
} from "@an-movie/contracts";
import { MilvusProvider } from "../milvus/milvus.provider";
import {
  ConversationEntity,
  MessageEntity,
  TurnEntity,
  TurnEventEntity,
} from "./entities";
import { parseJsonObject, toChatItem } from "./chat-item";
import { MemoryItem } from "./message.grpc";
import { TurnInProgressError } from "./turn-in-progress.error";

/** 轮次停留在 running 超过该时长视为僵死（正常请求受 nginx 300s 超时约束）。 */
const STALE_TURN_TIMEOUT_MS = 10 * 60 * 1000;
/** 清扫僵死轮次的间隔。 */
const STALE_TURN_SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * 记忆文本写库前的字符上限。Milvus 的 VarChar(1000) 按 UTF-8 字节算，
 * 中文一字三字节，留足余量避免模型偶发超长时整条插入失败。
 */
const MEMORY_TEXT_MAX_LENGTH = 300;
/**
 * 记忆召回的 COSINE 相似度下限。低于它的命中当作噪声丢弃。
 * 阈值随 collection 的 metric 与 embedding 模型走，因此由本服务持有，
 * 不放进 gRPC 契约让调用方传。
 */
const MEMORY_MIN_SCORE = 0.5;

@Injectable()
export class MessageService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MessageService.name);
  private staleTurnSweepTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(TurnEntity)
    private readonly turnRepository: Repository<TurnEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    @InjectRepository(TurnEventEntity)
    private readonly turnEventRepository: Repository<TurnEventEntity>,
    private readonly milvusProvider: MilvusProvider,
  ) {}

  onApplicationBootstrap() {
    // 启动时先清一次（回收进程崩溃前遗留的 running 轮次），之后周期执行。
    void this.sweepStaleTurns();
    this.staleTurnSweepTimer = setInterval(
      () => void this.sweepStaleTurns(),
      STALE_TURN_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.staleTurnSweepTimer) {
      clearInterval(this.staleTurnSweepTimer);
    }
  }

  /**
   * 把停留在 running 超时的轮次按正常完成路径收尾成 error：
   * 复用 completeTurn，写入一条 assistant error 消息并更新轮次状态，
   * 使该轮的用户提问和失败原因在会话里正常可见。
   */
  private async sweepStaleTurns(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALE_TURN_TIMEOUT_MS);
      const staleTurns = await this.turnRepository.find({
        where: { status: TURN_STATUS.RUNNING, created_at: LessThan(cutoff) },
        take: 100,
      });

      for (const turn of staleTurns) {
        try {
          await this.finishTurn(
            turn.turn_id,
            TURN_STATUS.ERROR,
            JSON.stringify({
              kind: "error",
              message: "处理超时中断，请重新发送这条消息。",
            }),
          );
          this.logger.warn(
            `Stale running turn marked as error: turn_id=${turn.turn_id}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to sweep stale turn ${turn.turn_id}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `sweepStaleTurns failed: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  async createConversation(title?: string) {
    const conversation = this.conversationRepository.create({
      conversation_id: randomUUID(),
      user_id: UserContext.current().id,
      title: title ?? null,
    });
    return this.conversationRepository.save(conversation);
  }

  /**
   * 同一会话同时只允许一个 running 轮次。
   * 事务里锁会话行，避免两个 StartTurn 同时插入。
   */
  async startTurn(conversationId: string, userContentJson: string) {
    const userContent = parseJsonObject(userContentJson, "user_content_json");
    const turnId = randomUUID();
    const userMessageId = randomUUID();

    await this.conversationRepository.manager.transaction(async (manager) => {
      const conversation = await manager.findOne(ConversationEntity, {
        where: { conversation_id: conversationId },
        lock: { mode: "pessimistic_write" },
      });
      if (!conversation || !this.canAccessConversation(conversation)) {
        throw new NotFoundException(`Conversation not found: ${conversationId}`);
      }

      const running = await manager.findOne(TurnEntity, {
        where: { conversation_id: conversationId, status: TURN_STATUS.RUNNING },
      });
      if (running) {
        throw new TurnInProgressError();
      }

      await manager.save(
        TurnEntity,
        manager.create(TurnEntity, {
          turn_id: turnId,
          conversation_id: conversationId,
          status: TURN_STATUS.RUNNING,
        }),
      );
      await manager.save(
        MessageEntity,
        manager.create(MessageEntity, {
          id: userMessageId,
          conversation_id: conversationId,
          turn_id: turnId,
          role: "user",
          content: { ...userContent, kind: "user_query" },
        }),
      );
      conversation.updated_at = new Date();
      await manager.save(conversation);
    });

    return { turn_id: turnId, user_message_id: userMessageId };
  }

  async appendTurnEvent(turnId: string, bodyJson: string) {
    await this.requireTurn(turnId);

    const body = parseJsonObject(bodyJson, "body_json");
    const seq = await this.nextEventSeq(turnId);
    const eventId = randomUUID();
    await this.turnEventRepository.save(
      this.turnEventRepository.create({
        id: eventId,
        turn_id: turnId,
        seq,
        body,
      }),
    );

    return { event_id: eventId, seq };
  }

  async completeTurn(
    turnId: string,
    status: string,
    assistantPayloadJson: string,
    memoryText?: string,
  ) {
    await this.requireTurn(turnId);
    return this.finishTurn(turnId, status, assistantPayloadJson, memoryText);
  }

  /**
   * `memoryText` 只有正常完成的轮次才会带；僵死轮次清扫不传，不写向量库。
   * 用行锁保证 success 与 cancelled 并发时只有一方写入气泡。
   */
  private async finishTurn(
    turnId: string,
    status: string,
    assistantPayloadJson: string,
    memoryText?: string,
  ) {
    const finishedStatus = this.parseFinishedStatus(status);
    const assistantPayload = parseJsonObject(
      assistantPayloadJson,
      "assistant_payload_json",
    );

    const result = await this.turnRepository.manager.transaction(
      async (manager) => {
        const turn = await manager.findOne(TurnEntity, {
          where: { turn_id: turnId },
          lock: { mode: "pessimistic_write" },
        });
        if (!turn) {
          throw new NotFoundException(`Turn not found: ${turnId}`);
        }

        const existingAssistant = await manager.findOne(MessageEntity, {
          where: { turn_id: turnId, role: "assistant" },
        });

        if (turn.status !== TURN_STATUS.RUNNING) {
          return {
            applied: false,
            assistant_message_id: existingAssistant?.id ?? "",
            status: turn.status,
            payload: existingAssistant?.content ?? {},
            turn,
          };
        }

        const assistantMessageId = existingAssistant?.id ?? randomUUID();
        if (!existingAssistant) {
          await manager.save(
            MessageEntity,
            manager.create(MessageEntity, {
              id: assistantMessageId,
              conversation_id: turn.conversation_id,
              turn_id: turnId,
              role: "assistant",
              content: assistantPayload,
            }),
          );
        }

        turn.status = finishedStatus;
        turn.finished_at = new Date();
        await manager.save(turn);

        await manager.update(
          ConversationEntity,
          { conversation_id: turn.conversation_id },
          { updated_at: new Date() },
        );

        return {
          applied: !existingAssistant,
          assistant_message_id: assistantMessageId,
          status: finishedStatus,
          payload: existingAssistant?.content ?? assistantPayload,
          turn,
        };
      },
    );

    if (result.applied) {
      this.indexMemoryIfNeeded(
        result.assistant_message_id,
        result.turn,
        memoryText,
      );
    }

    return {
      assistant_message_id: result.assistant_message_id,
      status: result.status,
      payload: result.payload,
    };
  }

  async listConversations() {
    const conversations = await this.conversationRepository.find({
      where: { user_id: UserContext.current().id },
      order: { created_at: "DESC" },
      take: 100,
    });
    return { conversations };
  }

  async getConversation(conversationId: string) {
    const conversation = await this.requireConversation(conversationId);

    // 已完成轮次返回全部气泡；running 轮次只返回用户消息，
    // 让用户刷新后仍能看到自己刚发的问题（assistant 消息本来只在轮次完成时写入）。
    const messages = await this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.turn", "turn")
      .where("message.conversation_id = :conversationId", { conversationId })
      .andWhere("(turn.status IN (:...statuses) OR message.role = 'user')", {
        statuses: FINISHED_TURN_STATUSES,
      })
      .orderBy("message.created_at", "ASC")
      .getMany();

    return {
      conversation_id: conversation.conversation_id,
      user_id: conversation.user_id,
      title: conversation.title,
      messages: messages.map(toChatItem),
    };
  }

  async getTurn(turnId: string) {
    const turn = await this.requireTurn(turnId);

    const [messages, events] = await Promise.all([
      this.messageRepository.find({
        where: { turn_id: turnId },
        order: { created_at: "ASC" },
      }),
      this.turnEventRepository.find({
        where: { turn_id: turnId },
        order: { seq: "ASC" },
      }),
    ]);

    return {
      turn_id: turn.turn_id,
      conversation_id: turn.conversation_id,
      status: turn.status,
      messages: messages.map(toChatItem),
      events: events.map((event) => ({
        id: event.id,
        seq: event.seq,
        body_json: JSON.stringify(event.body ?? {}),
        created_at: event.created_at.toISOString(),
      })),
    };
  }

  /**
   * 按语义召回当前用户在**其它会话**里的记忆。
   * 记忆文本自包含，不回查 Postgres；按 user_id 过滤，天然只能搜到自己的。
   */
  async searchMemories(
    query: string,
    excludeConversationId: string,
    limit: number,
  ): Promise<{ memories: MemoryItem[] }> {
    const userId = this.currentUserId();
    this.logger.log(
      `searchMemories start: query=${this.truncateText(query, 100)} excludeConversationId=${excludeConversationId} limit=${limit}`,
    );

    try {
      const embedding = await this.milvusProvider.generateEmbedding(query);
      const hits = await this.milvusProvider.searchMemories(embedding, {
        userId,
        excludeConversationId,
        limit,
        minScore: MEMORY_MIN_SCORE,
      });

      this.logger.log(
        `searchMemories done: hits=${hits.length} topScore=${hits[0]?.score ?? 0}`,
      );
      return {
        memories: hits.map((hit) => ({
          text: hit.memory_text,
          conversation_id: hit.conversation_id,
          score: hit.score,
        })),
      };
    } catch (error) {
      this.logger.error(
        `searchMemories failed: ${(error as Error).message}`,
        error as Error,
      );
      return { memories: [] };
    }
  }

  private currentUserId(): string {
    return UserContext.current().id;
  }

  /**
   * 会话访问规则：当前请求用户必须与会话主人一致。
   * 无主会话、非本人一律拒绝。
   */
  private canAccessConversation(conversation: ConversationEntity): boolean {
    const userId = this.currentUserId();
    return Boolean(conversation.user_id && conversation.user_id === userId);
  }

  private async requireConversation(
    conversationId: string,
  ): Promise<ConversationEntity> {
    const conversation = await this.conversationRepository.findOne({
      where: { conversation_id: conversationId },
    });
    if (!conversation || !this.canAccessConversation(conversation)) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
    return conversation;
  }

  private async requireTurn(turnId: string): Promise<TurnEntity> {
    const turn = await this.turnRepository.findOne({
      where: { turn_id: turnId },
    });
    if (!turn) {
      throw new NotFoundException(`Turn not found: ${turnId}`);
    }
    await this.requireConversation(turn.conversation_id);
    return turn;
  }

  private async nextEventSeq(turnId: string): Promise<number> {
    const raw = await this.turnEventRepository
      .createQueryBuilder("event")
      .select("COALESCE(MAX(event.seq), 0)", "max")
      .where("event.turn_id = :turnId", { turnId })
      .getRawOne<{ max: string | number }>();
    return Number(raw?.max ?? 0) + 1;
  }

  private parseFinishedStatus(status: string): FinishedTurnStatus {
    if (isFinishedTurnStatus(status)) {
      return status;
    }
    throw new Error(
      `Invalid turn status "${status}". Expected one of: ${FINISHED_TURN_STATUSES.join(", ")}`,
    );
  }

  /**
   * 本轮记忆入向量库。异步执行，失败只记日志，绝不回滚已落库的会话消息。
   */
  private indexMemoryIfNeeded(
    messageId: string,
    turn: TurnEntity,
    memoryText?: string,
  ) {
    const text = memoryText?.trim();
    if (!text) return;

    void this.addMemoryRecord(
      messageId,
      turn,
      this.truncateText(text, MEMORY_TEXT_MAX_LENGTH),
    );
  }

  private async addMemoryRecord(
    messageId: string,
    turn: TurnEntity,
    memoryText: string,
  ) {
    try {
      const conversation = await this.conversationRepository.findOne({
        where: { conversation_id: turn.conversation_id },
      });
      // 无主会话没有可用于检索隔离的 user_id，写进去也召不回来。
      if (!conversation?.user_id) return;

      const embedding = await this.milvusProvider.generateEmbedding(memoryText);
      await this.milvusProvider.addMemory({
        memory_id: messageId,
        user_id: conversation.user_id,
        conversation_id: turn.conversation_id,
        turn_id: turn.turn_id,
        memory_text: memoryText,
        memory_embedding: embedding,
      });
    } catch (error) {
      this.logger.error(
        `Failed to index memory: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }
}
