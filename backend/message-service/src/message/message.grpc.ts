import { Controller, Logger } from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import { MessageService } from "./message.service";

interface CreateConversationRequest {
  user_id?: string;
  title?: string;
}

interface CreateConversationResponse {
  conversation_id: string;
}

interface AppendMessageRequest {
  conversation_id: string;
  role: string;
  message_type: string;
  stage: string;
  content?: string;
  summary?: string;
  topics?: string[];
  entities?: string[];
  user_message_id?: string;
}

interface AppendMessageResponse {
  ok: boolean;
}

interface GetConversationRequest {
  conversation_id: string;
}

export interface RelatedContextItem {
  role?: 'user' | 'assistant';
  content?: string;
  message_type?: string;
  stage?: string;
}

interface SearchSimilarContextRequest {
  user_input: string;
  conversation_id: string;
  limit?: number;
}

interface SearchSimilarContextResponse {
  context_items: RelatedContextItem[];
}

@Controller()
export class MessageGrpcService {
  private readonly logger = new Logger(MessageGrpcService.name);

  constructor(private readonly messageService: MessageService) {}

  @GrpcMethod("Message", "CreateConversation")
  async createConversation(
    request: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    this.logger.log(
      `gRPC CreateConversation request ->> ${JSON.stringify(request)}`,
    );

    let conversation;

    try {
      conversation = await this.messageService.createConversation(
        request.user_id,
        request.title,
      );
    } catch (error) {
      this.logger.error(
        `gRPC CreateConversation failed: ${JSON.stringify(error)}`,
      );
      throw error;
    }

    this.logger.log(`gRPC CreateConversation response conversation ->> ${JSON.stringify(conversation)}`);

    return { conversation_id: conversation.conversation_id };
  }

  @GrpcMethod("Message", "AppendMessage")
  async appendMessage(
    request: AppendMessageRequest,
  ): Promise<AppendMessageResponse> {
    this.logger.log(
      `gRPC AppendMessage conversation_id=${request.conversation_id} role=${request.role} type=${request.message_type}`,
    );
    await this.messageService.appendMessage(
      request.conversation_id,
      request.role,
      request.message_type,
      request.stage,
      request.content,
      request.summary,
      request.topics,
      request.entities,
      request.user_message_id,
    );
    return { ok: true };
  }

  @GrpcMethod("Message", "GetConversation")
  async getConversation(request: GetConversationRequest) {
    this.logger.log(
      `gRPC GetConversation conversation_id=${request.conversation_id}`,
    );
    return this.messageService.getConversation(request.conversation_id);
  }

  @GrpcMethod("Message", "SearchSimilarContext")
  async searchSimilarContext(
    request: SearchSimilarContextRequest,
  ): Promise<SearchSimilarContextResponse> {
    this.logger.log(
      `gRPC SearchSimilarContext user_input=${request.user_input ? request.user_input.slice(0, 50) : ""}... conversation_id=${request.conversation_id} limit=${request.limit ?? 5}`,
    );
    return this.messageService.searchSimilarContext(
      request.user_input,
      request.conversation_id,
      request.limit ?? 5,
    );
  }
}
