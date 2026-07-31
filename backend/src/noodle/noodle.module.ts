import { Module } from '@nestjs/common';
import { NoodleController } from './noodle.controller';
import { NoodleService } from './noodle.service';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';

@Module({
  controllers: [NoodleController],
  providers: [NoodleService, ModelProvider, LangSmithProvider],
})
export class NoodleModule {}
