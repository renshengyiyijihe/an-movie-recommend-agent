import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGrpcClient } from './auth/auth.grpc';
import { GrpcUserGuard } from './auth/grpc-user.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UserContextInterceptor } from './auth/user-context.interceptor';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { MessageGrpcService } from './message/message.grpc';
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
      url: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@localhost:5432/anmovie_db',
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
    JwtAuthGuard,
    GrpcUserGuard,
    MilvusProvider,
    SiliconFlowEmbeddingProvider,
    {
      provide: APP_INTERCEPTOR,
      useClass: UserContextInterceptor,
    },
  ],
})
export class AppModule {}
