import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const logger = new Logger('NoodleServiceBootstrap');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  logger.log(`[env] loaded ${envPath}`);
} else {
  logger.log(`[env] no .env file at ${envPath}, using existing process.env values`);
}

async function bootstrap() {
  logger.log('Bootstrapping noodle service');
  const { AppModule } = await import('./app.module');
  logger.log('process.env', JSON.stringify(process.env));
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`Noodle service running on http://0.0.0.0:${port}`);
}

bootstrap().catch((error) => {
  logger.error('Noodle service bootstrap failed', error as Error);
  process.exit(1);
});
