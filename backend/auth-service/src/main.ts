import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createHttpValidationPipe, requestIdMiddleware } from '@an-movie/auth-client';
import { Logger as PinoLogger } from 'nestjs-pino';

const logger = new Logger('AuthServiceBootstrap');

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is required');
    process.exit(1);
  }

  logger.log('Bootstrapping auth service');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createHttpValidationPipe());
  const port = Number(process.env.AUTH_HTTP_PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  logger.log(`Auth service HTTP listening on http://0.0.0.0:${port}`);
}

bootstrap().catch((error) => {
  logger.error('Auth service bootstrap failed', error as Error);
  process.exit(1);
});
