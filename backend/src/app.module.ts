import { Module } from '@nestjs/common';
import { NoodleModule } from './noodle/noodle.module';

@Module({
  imports: [NoodleModule],
})
export class AppModule {}
