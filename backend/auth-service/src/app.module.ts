import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from '@an-movie/auth-client';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
