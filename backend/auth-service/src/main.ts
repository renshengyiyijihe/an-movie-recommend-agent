import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

const logger = new Logger('AuthServiceBootstrap');

async function bootstrap() {
  logger.log('Bootstrapping auth service');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const port = Number(process.env.AUTH_HTTP_PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  logger.log(`Auth service HTTP listening on http://0.0.0.0:${port}`);
}

bootstrap().catch((error) => {
  logger.error('Auth service bootstrap failed', error as Error);
  process.exit(1);
});
