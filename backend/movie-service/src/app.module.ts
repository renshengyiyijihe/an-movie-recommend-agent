import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter, UserContextInterceptor } from '@an-movie/auth-client';
import { MovieModule } from './movie/movie.module';
import { HealthController } from './health.controller';

@Module({
  imports: [MovieModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: UserContextInterceptor,
    },
  ],
})
export class AppModule {}
