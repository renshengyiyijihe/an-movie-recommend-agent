import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'path';
import { ConversationHistoryItem } from './movie.service';

interface CreateConversationRequest {
  user_id?: string;
  title?: string;
}

interface CreateConversationResponse {
  conversation_id: string;
}

// 发送到 message-service 的消息角色，必须与 message.proto 定义保持一致。
export type MessageRole = 'user' | 'assistant';
// 事件类型：用户提交、阶段执行记录、最终回复。
export type MessageType = 'user_query' | 'agent_execution' | 'final_response';
// 事件所处阶段：任务提交、意图识别、工作流执行阶段、最终输出。
// 其中 parsePreferences / search / supervisor 是动态规划阶段，不是固定阶段。
export type MessageStage =
  | 'start'
  | 'intent_classification'
  | 'workflow_complete'
  | 'final'
  | 'parsePreferences_start'
  | 'parsePreferences_completed'
  | 'search_start'
  | 'search_completed'
  | 'supervisor_start'
  | 'supervisor_completed';

interface AppendMessageRequest {
  conversation_id: string;
  role: MessageRole;
  message_type: MessageType;
  stage: MessageStage;
  content?: string;
  summary?: string;
  topics?: string[];
  entities?: string[];
  user_message_id?: string;
}

interface AppendMessageResponse {
  ok: boolean;
}

interface SearchSimilarContextRequest {
  user_input: string;
  conversation_id: string;
  limit?: number;
}

interface SearchSimilarContextResponse {
  context_items: ConversationHistoryItem[];
}

@Injectable()
export class MessageGrpcClient implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(MessageGrpcClient.name);

  onModuleInit() {
    const protoPath = join(__dirname, '..',  '..', 'proto', 'message.proto');
    const packageDef = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDef) as any;
    const MessageService = grpcObject.message.Message;
    const target = process.env.MESSAGE_GRPC_ADDRESS ?? 'message-service:50052';
    this.client = new MessageService(target, credentials.createInsecure());
    this.logger.log(`MessageGrpcClient initialized, target=${target}`);
  }

  createConversation(request: CreateConversationRequest): Promise<CreateConversationResponse> {
    this.logger.log(`gRPC CreateConversation request ->> ${JSON.stringify(request)}`);
    return new Promise((resolve, reject) => {
      this.client.CreateConversation(request, (err: any, response: CreateConversationResponse) => {
        if (err) {
          this.logger.error('gRPC CreateConversation call failed', err as Error);
          return reject(err);
        }
        const conversationId = response?.conversation_id;
        this.logger.log(`gRPC CreateConversation response ->> ${JSON.stringify(response)}`);
        if (!conversationId) {
          return reject(new Error('Message service returned empty conversation_id'));
        }
        resolve({ conversation_id: conversationId });
      });
    });
  }

  appendMessage(request: AppendMessageRequest): Promise<AppendMessageResponse> {
    return new Promise((resolve, reject) => {
      this.client.AppendMessage(request, (err: any, response: AppendMessageResponse) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  getConversation(request: { conversation_id: string }): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetConversation(request, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  searchSimilarContext(
    request: SearchSimilarContextRequest,
  ): Promise<SearchSimilarContextResponse> {
    this.logger.log(
      `gRPC SearchSimilarContext user_input=${request.user_input ? request.user_input.slice(0, 50) : ""}... conversation_id=${request.conversation_id} limit=${request.limit ?? 5}`,
    );
    return new Promise((resolve, reject) => {
      this.client.SearchSimilarContext(request, (err: any, response: SearchSimilarContextResponse) => {
        if (err) {
          this.logger.error("gRPC SearchSimilarContext call failed", err as Error);
          return reject(err);
        }
        this.logger.log(
          `gRPC SearchSimilarContext response: found ${response.context_items?.length ?? 0} context items`,
        );
        resolve(response);
      });
    });
  }
}
