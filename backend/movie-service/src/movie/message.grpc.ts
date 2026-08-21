import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";
import { AssistantPayload, UserMessagePayload } from "./transcript";

interface CreateConversationRequest {
  user_id?: string;
  title?: string;
}

interface CreateConversationResponse {
  conversation_id: string;
}

interface StartTurnResponse {
  turn_id: string;
  user_message_id: string;
}

interface AppendTurnEventResponse {
  event_id: string;
  seq: number;
}

interface CompleteTurnResponse {
  assistant_message_id: string;
}

export interface ConversationChatItem {
  id?: string;
  turn_id?: string;
  role?: string;
  kind?: string;
  payload_json?: string;
  created_at?: string;
}

interface GetConversationResponse {
  conversation_id?: string;
  user_id?: string;
  title?: string;
  messages?: ConversationChatItem[];
}

@Injectable()
export class MessageGrpcClient implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(MessageGrpcClient.name);

  onModuleInit() {
    const protoPath = join(__dirname, "..", "..", "proto", "message.proto");
    const packageDef = loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcObject = loadPackageDefinition(packageDef) as any;
    const MessageService = grpcObject.message.Message;
    const target = process.env.MESSAGE_GRPC_ADDRESS ?? "message-service:50052";
    this.client = new MessageService(target, credentials.createInsecure());
    this.logger.log(`MessageGrpcClient initialized, target=${target}`);
  }

  createConversation(
    request: CreateConversationRequest,
  ): Promise<CreateConversationResponse> {
    this.logger.log(`gRPC CreateConversation request ->> ${JSON.stringify(request)}`);
    return this.rpc<CreateConversationResponse>("CreateConversation", request).then(
      (response) => {
        const conversationId = response?.conversation_id;
        this.logger.log(
          `gRPC CreateConversation response ->> ${JSON.stringify(response)}`,
        );
        if (!conversationId) {
          throw new Error("Message service returned empty conversation_id");
        }
        return { conversation_id: conversationId };
      },
    );
  }

  startTurn(
    conversationId: string,
    userContent: UserMessagePayload,
  ): Promise<StartTurnResponse> {
    return this.rpc<StartTurnResponse>("StartTurn", {
      conversation_id: conversationId,
      user_content_json: JSON.stringify(userContent),
    });
  }

  appendTurnEvent(turnId: string, body: unknown): Promise<AppendTurnEventResponse> {
    return this.rpc<AppendTurnEventResponse>("AppendTurnEvent", {
      turn_id: turnId,
      body_json: JSON.stringify(body),
    });
  }

  completeTurn(
    turnId: string,
    status: "success" | "reject" | "error",
    assistantPayload: AssistantPayload,
  ): Promise<CompleteTurnResponse> {
    return this.rpc<CompleteTurnResponse>("CompleteTurn", {
      turn_id: turnId,
      status,
      assistant_payload_json: JSON.stringify(assistantPayload),
    });
  }

  getConversation(conversationId: string): Promise<GetConversationResponse> {
    return this.rpc<GetConversationResponse>("GetConversation", {
      conversation_id: conversationId,
    });
  }

  getTurn(turnId: string) {
    return this.rpc("GetTurn", { turn_id: turnId });
  }

  private rpc<TRes>(method: string, request: object): Promise<TRes> {
    return new Promise((resolve, reject) => {
      this.client[method](request, (err: unknown, response: TRes) => {
        if (err) {
          this.logger.error(`gRPC ${method} call failed`, err as Error);
          return reject(err);
        }
        resolve(response);
      });
    });
  }
}
