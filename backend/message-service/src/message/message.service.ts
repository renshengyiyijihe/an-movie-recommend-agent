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
import { MilvusProvider } from "../milvus/milvus.provider";
import {
  ConversationEntity,
  FINISHED_TURN_STATUSES,
  MessageEntity,
  TurnEntity,
  TurnEventEntity,
  TurnStatus,
} from "./entities";
import {
  parseJsonObject,
  payloadText,
  toChatItem,
} from "./chat-item";
import { RelatedContextItem } from "./message.grpc";
import { TurnInProgressError } from "./turn-in-progress.error";

/** 轮次停留在 running 超过该时长视为僵死（正常请求受 nginx 300s 超时约束）。 */
const STALE_TURN_TIMEOUT_MS = 10 * 60 * 1000;
/** 清扫僵死轮次的间隔。 */
const STALE_TURN_SWEEP_INTERVAL_MS = 60 * 1000;

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
        where: { status: "running", created_at: LessThan(cutoff) },
        take: 100,
      });

      for (const turn of staleTurns) {
        try {
          await this.finishTurn(
            turn.turn_id,
            "error",
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
        where: { conversation_id: conversationId, status: "running" },
      });
      if (running) {
        throw new TurnInProgressError();
      }

      await manager.save(
        TurnEntity,
        manager.create(TurnEntity, {
          turn_id: turnId,
          conversation_id: conversationId,
          status: "running",
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
  ) {
    await this.requireTurn(turnId);
    return this.finishTurn(turnId, status, assistantPayloadJson);
  }

  private async finishTurn(
    turnId: string,
    status: string,
    assistantPayloadJson: string,
  ) {
    const turn = await this.turnRepository.findOne({
      where: { turn_id: turnId },
    });
    if (!turn) {
      throw new NotFoundException(`Turn not found: ${turnId}`);
    }

    const finishedStatus = this.parseFinishedStatus(status);
    const assistantPayload = parseJsonObject(
      assistantPayloadJson,
      "assistant_payload_json",
    );
    const existingAssistant = await this.messageRepository.findOne({
      where: { turn_id: turnId, role: "assistant" },
    });

    if (turn.status !== "running" && existingAssistant) {
      return { assistant_message_id: existingAssistant.id };
    }

    const assistantMessageId = existingAssistant?.id ?? randomUUID();

    await this.turnRepository.manager.transaction(async (manager) => {
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
    });

    this.indexAssistantIfNeeded(assistantMessageId, turn.conversation_id, assistantPayload);
    return { assistant_message_id: assistantMessageId };
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

  async searchSimilarContext(
    userInput: string,
    conversationId: string,
    limit: number = 5,
  ) {
    await this.requireConversation(conversationId);
    this.logger.log(
      `searchSimilarContext start: userInput=${this.truncateText(userInput, 100)} conversationId=${conversationId} limit=${limit}`,
    );

    try {
      const userInputEmbedding =
        await this.milvusProvider.generateEmbedding(userInput);
      const similarSummaries =
        await this.milvusProvider.searchBySummaryEmbedding(
          userInputEmbedding,
          conversationId,
          limit,
        );

      if (similarSummaries.length === 0) {
        return { context_items: [] as RelatedContextItem[] };
      }

      const contextItems: RelatedContextItem[] = [];
      for (const item of similarSummaries) {
        try {
          const assistantMessage = await this.messageRepository.findOne({
            where: { id: item.message_id },
          });
          if (!assistantMessage) continue;

          const userMessage = await this.messageRepository.findOne({
            where: {
              turn_id: assistantMessage.turn_id,
              role: "user",
            },
          });
          const userText = userMessage
            ? payloadText(userMessage.content ?? {})
            : "";
          if (!userText) continue;

          contextItems.push({ role: "user", content: userText });
          contextItems.push({
            role: "assistant",
            content: item.summary,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to fetch turn messages for message_id=${item.message_id}: ${(error as Error).message}`,
          );
        }
      }

      return { context_items: contextItems };
    } catch (error) {
      this.logger.error(
        `searchSimilarContext failed: ${(error as Error).message}`,
        error as Error,
      );
      return { context_items: [] };
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

  private parseFinishedStatus(status: string): TurnStatus {
    if (status === "success" || status === "reject" || status === "error") {
      return status;
    }
    throw new Error(
      `Invalid turn status "${status}". Expected one of: success, reject, error`,
    );
  }

  private indexAssistantIfNeeded(
    messageId: string,
    conversationId: string,
    payload: Record<string, unknown>,
  ) {
    const summary =
      typeof payload.summary === "string" ? payload.summary.trim() : "";
    if (!summary) return;

    const topics = Array.isArray(payload.topics)
      ? payload.topics.filter((item): item is string => typeof item === "string")
      : [];
    const entities = Array.isArray(payload.entities)
      ? payload.entities.filter((item): item is string => typeof item === "string")
      : [];

    void this.addMilvusRecord(messageId, conversationId, summary, topics, entities);
  }

  private async addMilvusRecord(
    messageId: string,
    conversationId: string,
    summary: string,
    topics: string[],
    entities: string[],
  ) {
    try {
      const embedding = await this.milvusProvider.generateEmbedding(summary);
      await this.milvusProvider.addMessageRecord({
        message_id: messageId,
        conversation_id: conversationId,
        summary,
        topics,
        entities,
        summary_embedding: embedding,
      });
    } catch (error) {
      this.logger.error(
        `Failed to add message record to Milvus: ${(error as Error).message}`,
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
