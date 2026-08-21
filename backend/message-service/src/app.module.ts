import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { MessageGrpcService } from './message/message.grpc';
import { AuthGrpcClient } from './auth/auth.grpc';
import { MilvusProvider } from './milvus/milvus.provider';
import {
  ConversationEntity,
  MessageEntity,
  TurnEntity,
  TurnEventEntity,
} from './message/entities';
import { SiliconFlowEmbeddingProvider } from './embedding/siliconflow-embedding.provider';

const entities = [
  ConversationEntity,
  TurnEntity,
  MessageEntity,
  TurnEventEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@postgres:5432/anmovie_db',
      entities,
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [MessageController, MessageGrpcService],
  providers: [
    MessageService,
    AuthGrpcClient,
    MilvusProvider,
    SiliconFlowEmbeddingProvider,
  ],
})
export class AppModule {}
