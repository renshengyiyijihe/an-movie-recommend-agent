import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { MessageGrpcService } from './message/message.grpc';
import { AuthGrpcClient } from './auth/auth.grpc';
import { MessageGrpcClient } from './message/message.grpc.client';
import { MilvusProvider } from './milvus/milvus.provider';
import { ConversationEntity, MessageEntity } from './message/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@postgres:5432/anmovie_db',
      entities: [ConversationEntity, MessageEntity],
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
  ],
  controllers: [MessageController, MessageGrpcService],
  providers: [MessageService, AuthGrpcClient, MessageGrpcClient, MilvusProvider],
})
export class AppModule {}
