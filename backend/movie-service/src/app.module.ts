import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import {
  createPinoHttpOptions,
  HttpExceptionFilter,
  HttpMetricsInterceptor,
  MetricsModule,
  UserContextInterceptor,
} from '@an-movie/auth-client';
import { MovieModule } from './movie/movie.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: createPinoHttpOptions('movie-service'),
    }),
    MetricsModule,
    MovieModule,
  ],
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
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
