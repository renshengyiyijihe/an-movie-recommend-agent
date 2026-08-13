import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessageService } from './message.service';

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
  content: string;
}

interface AppendMessageResponse {
  ok: boolean;
}

interface GetConversationRequest {
  conversation_id: string;
}

@Controller()
export class MessageGrpcService {
  private readonly logger = new Logger(MessageGrpcService.name);

  constructor(private readonly messageService: MessageService) {}

  @GrpcMethod('Message', 'CreateConversation')
  async createConversation(request: CreateConversationRequest): Promise<CreateConversationResponse> {
    this.logger.log(`gRPC CreateConversation user_id=${request.user_id ?? 'anonymous'}`);
    const conversation = await this.messageService.createConversation(
      request.user_id,
      request.title,
    );
    return { conversation_id: conversation.conversation_id };
  }

  @GrpcMethod('Message', 'AppendMessage')
  async appendMessage(request: AppendMessageRequest): Promise<AppendMessageResponse> {
    this.logger.log(`gRPC AppendMessage conversation_id=${request.conversation_id} role=${request.role} type=${request.message_type}`);
    await this.messageService.appendMessage(
      request.conversation_id,
      request.role,
      request.message_type,
      request.stage,
      request.content,
    );
    return { ok: true };
  }

  @GrpcMethod('Message', 'GetConversation')
  async getConversation(request: GetConversationRequest) {
    this.logger.log(`gRPC GetConversation conversation_id=${request.conversation_id}`);
    return this.messageService.getConversation(request.conversation_id);
  }
}
