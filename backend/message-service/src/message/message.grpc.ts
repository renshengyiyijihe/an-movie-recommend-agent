import { Controller, Logger, UseGuards } from "@nestjs/common";
import { GrpcMethod, RpcException } from "@nestjs/microservices";
import { status } from "@grpc/grpc-js";
import { GrpcUserGuard } from "../auth/grpc-user.guard";
import { ChatItem } from "./chat-item";
import { MessageService } from "./message.service";
import { TurnInProgressError } from "./turn-in-progress.error";

interface CreateConversationRequest {
  title?: string;
}

interface StartTurnRequest {
  conversation_id: string;
  user_content_json: string;
}

interface AppendTurnEventRequest {
  turn_id: string;
  body_json: string;
}

interface CompleteTurnRequest {
  turn_id: string;
  status: string;
  assistant_payload_json: string;
}

interface GetConversationRequest {
  conversation_id: string;
}

interface GetTurnRequest {
  turn_id: string;
}

export interface RelatedContextItem {
  role?: "user" | "assistant";
  content?: string;
}

interface SearchSimilarContextRequest {
  user_input: string;
  conversation_id: string;
  limit?: number;
}

function toProtoChatItem(item: ChatItem) {
  return {
    id: item.id,
    turn_id: item.turn_id,
    role: item.role,
    kind: item.kind,
    payload_json: JSON.stringify(item.payload ?? {}),
    created_at: item.created_at,
  };
}

@UseGuards(GrpcUserGuard)
@Controller()
export class MessageGrpcService {
  private readonly logger = new Logger(MessageGrpcService.name);

  constructor(private readonly messageService: MessageService) {}

  @GrpcMethod("Message", "CreateConversation")
  async createConversation(request: CreateConversationRequest) {
    this.logger.log(
      `gRPC CreateConversation request ->> ${JSON.stringify(request)}`,
    );
    const conversation = await this.messageService.createConversation(
      request.title,
    );
    this.logger.log(
      `gRPC CreateConversation response conversation_id=${conversation.conversation_id}`,
    );
    return { conversation_id: conversation.conversation_id };
  }

  @GrpcMethod("Message", "StartTurn")
  async startTurn(request: StartTurnRequest) {
    this.logger.log(
      `gRPC StartTurn conversation_id=${request.conversation_id}`,
    );
    try {
      return await this.messageService.startTurn(
        request.conversation_id,
        request.user_content_json,
      );
    } catch (error) {
      if (error instanceof TurnInProgressError) {
        throw new RpcException({
          code: status.FAILED_PRECONDITION,
          message: error.message,
        });
      }
      throw error;
    }
  }

  @GrpcMethod("Message", "AppendTurnEvent")
  async appendTurnEvent(request: AppendTurnEventRequest) {
    return this.messageService.appendTurnEvent(
      request.turn_id,
      request.body_json,
    );
  }

  @GrpcMethod("Message", "CompleteTurn")
  async completeTurn(request: CompleteTurnRequest) {
    this.logger.log(
      `gRPC CompleteTurn turn_id=${request.turn_id} status=${request.status}`,
    );
    return this.messageService.completeTurn(
      request.turn_id,
      request.status,
      request.assistant_payload_json,
    );
  }

  @GrpcMethod("Message", "GetConversation")
  async getConversation(request: GetConversationRequest) {
    this.logger.log(
      `gRPC GetConversation conversation_id=${request.conversation_id}`,
    );
    const conversation = await this.messageService.getConversation(
      request.conversation_id,
    );
    return {
      ...conversation,
      messages: conversation.messages.map(toProtoChatItem),
    };
  }

  @GrpcMethod("Message", "GetTurn")
  async getTurn(request: GetTurnRequest) {
    this.logger.log(`gRPC GetTurn turn_id=${request.turn_id}`);
    const turn = await this.messageService.getTurn(request.turn_id);
    return {
      ...turn,
      messages: turn.messages.map(toProtoChatItem),
    };
  }

  @GrpcMethod("Message", "SearchSimilarContext")
  async searchSimilarContext(request: SearchSimilarContextRequest) {
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
