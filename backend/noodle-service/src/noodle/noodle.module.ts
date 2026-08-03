import { Module } from '@nestjs/common';
import { NoodleController } from './noodle.controller';
import { NoodleService } from './noodle.service';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';
import { TavilyProvider } from '../model/tavily.provider';
import { AuthGrpcClient } from './auth.grpc';

@Module({
  controllers: [NoodleController],
  providers: [NoodleService, ModelProvider, LangSmithProvider, TavilyProvider, AuthGrpcClient],
})
export class NoodleModule {}
