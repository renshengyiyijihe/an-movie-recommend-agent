import { Module } from '@nestjs/common';
import { MovieController } from './movie.controller';
import { MovieService } from './movie.service';
import { ModelProvider } from '../model/model.provider';
import { TmdbProvider } from '../model/tmdb.provider';
import { AuthGrpcClient } from './auth.grpc';
import { MessageGrpcClient } from './message.grpc';

@Module({
  controllers: [MovieController],
  providers: [MovieService, ModelProvider, TmdbProvider, AuthGrpcClient, MessageGrpcClient],
})
export class MovieModule {}
