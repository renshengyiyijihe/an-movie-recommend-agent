import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserContextInterceptor } from '../auth/user-context.interceptor';
import { MovieController } from './movie.controller';
import { MovieService } from './movie.service';
import { ModelProvider } from '../model/model.provider';
import { AuthGrpcClient } from './auth.grpc';
import { MessageGrpcClient } from './message.grpc';
import { AgentsModule } from './agents/agents.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [AgentsModule, ServicesModule],
  controllers: [MovieController],
  providers: [
    MovieService,
    ModelProvider,
    AuthGrpcClient,
    MessageGrpcClient,
    JwtAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: UserContextInterceptor,
    },
  ],
})
export class MovieModule {}
