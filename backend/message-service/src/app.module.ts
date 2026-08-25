import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import {
  AuthGrpcClient,
  createPinoHttpOptions,
  HttpExceptionFilter,
  HttpMetricsInterceptor,
  JwtAuthGuard,
  MetricsModule,
  UserContextInterceptor,
} from "@an-movie/auth-client";
import { GrpcUserGuard } from "./auth/grpc-user.guard";
import { MessageController } from "./message/message.controller";
import { MessageService } from "./message/message.service";
import { MessageGrpcService } from "./message/message.grpc";
import { MilvusProvider } from "./milvus/milvus.provider";
import {
  ConversationEntity,
  MessageEntity,
  TurnEntity,
  TurnEventEntity,
} from "./message/entities";
import { SiliconFlowEmbeddingProvider } from "./embedding/siliconflow-embedding.provider";
import { HealthController } from "./health.controller";

const entities = [
  ConversationEntity,
  TurnEntity,
  MessageEntity,
  TurnEventEntity,
];

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: createPinoHttpOptions("message-service"),
    }),
    MetricsModule,
    TypeOrmModule.forRoot({
      type: "postgres",
      url:
        process.env.POSTGRES_URL ??
        "postgresql://postgres:password@localhost:5432/anmovie_db",
      entities,
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [HealthController, MessageController, MessageGrpcService],
  providers: [
    MessageService,
    AuthGrpcClient,
    JwtAuthGuard,
    GrpcUserGuard,
    MilvusProvider,
    SiliconFlowEmbeddingProvider,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: UserContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
