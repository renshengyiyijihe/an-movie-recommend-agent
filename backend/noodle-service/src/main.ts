import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Noodle service running on http://0.0.0.0:${port}`);
}

bootstrap();
