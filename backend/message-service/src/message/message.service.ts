import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { AuthGrpcClient } from "../auth/auth.grpc";
import { MilvusProvider } from "../milvus/milvus.provider";
import { ConversationEntity, MessageEntity } from "./message.entity";
import { RelatedContextItem } from "./message.grpc";

@Injectable()
export class MessageService implements OnModuleInit {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
    private readonly authGrpcClient: AuthGrpcClient,
    private readonly milvusProvider: MilvusProvider,
  ) {}

  async onModuleInit() {
    this.logger.log("Message service ready");
  }

  async createConversation(userId?: string, title?: string) {
    const conversation = this.conversationRepository.create({
      conversation_id: randomUUID(),
      user_id: userId ?? null,
      title: title ?? null,
    });
    return this.conversationRepository.save(conversation);
  }

  async appendMessage(
    conversationId: string,
    role: string,
    messageType: string,
    stage: string,
    content?: string,
    summary?: string,
    topics?: string[],
    entities?: string[],
    userMessageId?: string,
  ) {
    let resolvedUserMessageId = userMessageId ?? null;
    if (role === "assistant" && !resolvedUserMessageId) {
      const latestUserMessage = await this.messageRepository.findOne({
        where: {
          conversation: { conversation_id: conversationId },
          role: "user",
        },
        order: { created_at: "DESC" },
      });
      resolvedUserMessageId = latestUserMessage?.id ?? null;
    }

    const messageId = randomUUID();
    const message = this.messageRepository.create({
      id: messageId,
      conversation: { conversation_id: conversationId } as ConversationEntity,
      role,
      message_type: messageType,
      stage,
      content,
      user_message_id: resolvedUserMessageId,
    });
    await this.messageRepository.save(message);

    // 异步添加到 Milvus，失败时不影响返回结果
    if (summary) {
      try {
        const embedding = await this.milvusProvider.generateEmbedding(summary);
        await this.milvusProvider.addMessageRecord({
          message_id: messageId,
          conversation_id: conversationId,
          summary,
          topics: topics || [],
          entities: entities || [],
          summary_embedding: embedding,
        });
      } catch (error) {
        this.logger.error(
          `Failed to add message record to Milvus: ${(error as Error).message}`,
          error as Error,
        );
        // 不抛异常，已在 MilvusProvider 中记录日志
      }
    }

    return { ok: true };
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
      .leftJoinAndSelect(
        "conversation.messages",
        "message",
        "message.message_type IN ('user_query', 'final_response')",
      )
      .where("conversation.conversation_id = :conversationId", {
        conversationId,
      });

    if (userId) {
      qb.andWhere("conversation.user_id = :userId", { userId });
    }

    const conversation = await qb.orderBy("message.created_at", "ASC").getOne();
    if (!conversation) {
      return { conversation_id: conversationId, messages: [] };
    }

    return conversation;
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
      // 1. 生成用户输入的 embedding
      const userInputEmbedding =
        await this.milvusProvider.generateEmbedding(userInput);
      this.logger.log(
        `Generated embedding for user input: dimension=${userInputEmbedding.length}`,
      );

      // 2. 在 Milvus 中搜索相似的 summary
      const similarSummaries =
        await this.milvusProvider.searchBySummaryEmbedding(
          userInputEmbedding,
          conversationId,
          limit,
        );
      this.logger.log(
        `Found ${similarSummaries.length} similar summaries from Milvus`,
      );

      if (similarSummaries.length === 0) {
        return { context_items: [] };
      }

      // 3. 对于每个相似的 summary，先查对应的 AI summary 记录，再根据 user_message_id 找到原始用户提问
      const contextItems: RelatedContextItem[] = [];
      for (const item of similarSummaries) {
        try {
          const summaryMessage = await this.messageRepository.findOne({
            where: {
              id: item.message_id,
            },
          });

          const userMessageId = summaryMessage?.user_message_id ?? null;
          let userMessage = null;

          if (userMessageId) {
            userMessage = await this.messageRepository.findOne({
              where: {
                id: userMessageId,
                role: "user",
              },
            });
          }

          // 兼容历史数据：如果没有 user_message_id，且这条记录本身就是用户消息，则直接使用它
          if (!userMessage && summaryMessage?.role === "user") {
            userMessage = summaryMessage;
          }

          if (userMessage && userMessage.content) {
            contextItems.push({
              role: "user",
              content: userMessage.content,
              message_type: userMessage.message_type,
              stage: userMessage.stage,
            });
            contextItems.push({
              role: "assistant",
              content: item.summary,
              message_type: 'final_response',
              stage: 'final',
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch user message for message_id=${item.message_id}: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `searchSimilarContext completed: found ${contextItems.length} related messages`,
      );

      return { context_items: contextItems };
    } catch (error) {
      this.logger.error(
        `searchSimilarContext failed: ${(error as Error).message}`,
        error as Error,
      );
      return { context_items: [] };
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }
}
