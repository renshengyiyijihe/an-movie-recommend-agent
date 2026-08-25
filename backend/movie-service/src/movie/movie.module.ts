import { Module } from '@nestjs/common';
import { AuthGrpcClient, JwtAuthGuard } from '@an-movie/auth-client';
import { MovieController } from './movie.controller';
import { MovieService } from './movie.service';
import { ModelProvider } from '../model/model.provider';
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
  ],
})
export class MovieModule {}
