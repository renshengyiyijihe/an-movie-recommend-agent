import { Module } from '@nestjs/common';
import { MovieController } from './movie.controller';
import { MovieService } from './movie.service';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';
import { TmdbProvider } from '../model/tmdb.provider';
import { AuthGrpcClient } from './auth.grpc';

@Module({
  controllers: [MovieController],
  providers: [MovieService, ModelProvider, LangSmithProvider, TmdbProvider, AuthGrpcClient],
})
export class MovieModule {}
