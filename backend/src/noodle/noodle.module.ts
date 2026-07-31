import { Module } from '@nestjs/common';
import { NoodleController } from './noodle.controller';
import { NoodleService } from './noodle.service';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';
import { TavilyProvider } from '../model/tavily.provider';

@Module({
  controllers: [NoodleController],
  providers: [NoodleService, ModelProvider, LangSmithProvider, TavilyProvider],
})
export class NoodleModule {}
