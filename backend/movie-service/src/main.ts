import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createHttpValidationPipe, requestIdMiddleware } from '@an-movie/auth-client';

const logger = new Logger('MovieServiceBootstrap');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  logger.log(`[env] loaded ${envPath}`);
} else {
  logger.log(`[env] no .env file at ${envPath}, using existing process.env values`);
}

async function bootstrap() {
  logger.log('Bootstrapping movie service');
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createHttpValidationPipe());
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`Movie service running on http://0.0.0.0:${port}`);
}

bootstrap().catch((error) => {
  logger.error('Movie service bootstrap failed', error as Error);
  process.exit(1);
});
