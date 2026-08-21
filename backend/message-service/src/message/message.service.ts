import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { AuthGrpcClient } from "../auth/auth.grpc";
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
  ChatItem,
  parseJsonObject,
  payloadText,
  toChatItem,
} from "./chat-item";
import { RelatedContextItem } from "./message.grpc";

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(TurnEntity)
    private readonly turnRepository: Repository<TurnEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    @InjectRepository(TurnEventEntity)
    private readonly turnEventRepository: Repository<TurnEventEntity>,
    private readonly authGrpcClient: AuthGrpcClient,
    private readonly milvusProvider: MilvusProvider,
  ) {}

  async createConversation(userId?: string, title?: string) {
    const conversation = this.conversationRepository.create({
      conversation_id: randomUUID(),
      user_id: userId ?? null,
      title: title ?? null,
    });
    return this.conversationRepository.save(conversation);
  }

  async startTurn(conversationId: string, userContentJson: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { conversation_id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }

    const userContent = parseJsonObject(userContentJson, "user_content_json");
    const turnId = randomUUID();
    const userMessageId = randomUUID();

    await this.conversationRepository.manager.transaction(async (manager) => {
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
    const turn = await this.turnRepository.findOne({
      where: { turn_id: turnId },
    });
    if (!turn) {
      throw new NotFoundException(`Turn not found: ${turnId}`);
    }

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

  async listConversations(userId: string) {
    const conversations = await this.conversationRepository.find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      take: 100,
    });
    return { conversations };
  }

  async getConversation(conversationId: string, userId?: string) {
    const qb = this.conversationRepository
      .createQueryBuilder("conversation")
      .where("conversation.conversation_id = :conversationId", {
        conversationId,
      });

    if (userId) {
      qb.andWhere("conversation.user_id = :userId", { userId });
    }

    const conversation = await qb.getOne();
    if (!conversation) {
      return { conversation_id: conversationId, messages: [] as ChatItem[] };
    }

    const messages = await this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.turn", "turn")
      .where("message.conversation_id = :conversationId", { conversationId })
      .andWhere("turn.status IN (:...statuses)", {
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
    const turn = await this.turnRepository.findOne({
      where: { turn_id: turnId },
    });
    if (!turn) {
      throw new NotFoundException(`Turn not found: ${turnId}`);
    }

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

  async validateAuthorization(authorization?: string) {
    if (!authorization) {
      return { ok: false, error: "no_authorization_header" };
    }

    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return { ok: false, error: "no_token" };
    }

    try {
      const response = await this.authGrpcClient.validateToken(token);
      return response;
    } catch (error) {
      this.logger.error("validateAuthorization error", error as Error);
      return { ok: false, error: "invalid_token" };
    }
  }

  async searchSimilarContext(
    userInput: string,
    conversationId: string,
    limit: number = 5,
  ) {
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
