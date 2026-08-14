import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AuthGrpcClient } from '../auth/auth.grpc';
import { MilvusProvider } from '../milvus/milvus.provider';
import { ConversationEntity, MessageEntity } from './message.entity';

interface ConversationRecord {
  conversation_id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  role: string;
  message_type: string;
  stage: string;
  content: string;
  created_at: string;
}

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
    this.logger.log('Message service ready');
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
  ) {
    const messageId = randomUUID();
    const message = this.messageRepository.create({
      id: messageId,
      conversation: { conversation_id: conversationId } as ConversationEntity,
      role,
      message_type: messageType,
      stage,
      content,
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
      order: { created_at: 'DESC' },
      take: 100,
    });
    return { conversations };
  }

  async getConversation(conversationId: string, userId?: string) {
    const qb = this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'message', "message.message_type IN ('user_query', 'final_response')")
      .where('conversation.conversation_id = :conversationId', { conversationId });

    if (userId) {
      qb.andWhere('conversation.user_id = :userId', { userId });
    }

    const conversation = await qb.orderBy('message.created_at', 'ASC').getOne();
    if (!conversation) {
      return { conversation_id: conversationId,  messages: []};
    }

    return conversation;
  }

  async validateAuthorization(authorization?: string) {
    if (!authorization) {
      return { ok: false, error: 'no_authorization_header' };
    }

    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return { ok: false, error: 'no_token' };
    }

    try {
      const response = await this.authGrpcClient.validateToken(token) ;
      return response;
    } catch (error) {
      this.logger.error('validateAuthorization error', error as Error);
      return { ok: false, error: 'invalid_token' };
    }
  }
}
