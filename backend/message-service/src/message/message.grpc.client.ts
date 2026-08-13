import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'path';

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

@Injectable()
export class MessageGrpcClient implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(MessageGrpcClient.name);

  onModuleInit() {
    const protoPath = join(__dirname, '..', '..', 'proto', 'message.proto');
    const packageDef = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDef) as any;
    this.logger.log(`client gRPC Object: ${JSON.stringify(grpcObject)}`);
    const MessageService = grpcObject.message.Message;
    const target = process.env.MESSAGE_GRPC_ADDRESS ?? 'message-service:50052';
    this.client = new MessageService(target, credentials.createInsecure());
    this.logger.log(`MessageGrpcClient initialized, target=${target}`);
  }

  createConversation(request: CreateConversationRequest): Promise<CreateConversationResponse> {
    return new Promise((resolve, reject) => {
      this.client.CreateConversation(request, (err: any, response: CreateConversationResponse) => {
        if (err) return reject(err);
        resolve(response);
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
}
