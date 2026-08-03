import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const port = Number(process.env.AUTH_HTTP_PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  console.log(`Auth service HTTP listening on http://0.0.0.0:${port}`);
}

bootstrap();
