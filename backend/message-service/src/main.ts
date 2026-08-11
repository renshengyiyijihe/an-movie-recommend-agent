import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

const logger = new Logger('MessageServiceBootstrap');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  logger.log(`[env] loaded ${envPath}`);
} else {
  logger.log(`[env] no .env file at ${envPath}, using existing process.env values`);
}

async function bootstrap() {
  logger.log('Bootstrapping message service');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const grpcPort = Number(process.env.MESSAGE_GRPC_PORT ?? 50052);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'message',
      protoPath: path.join(__dirname, '..', '..', 'proto', 'message.proto'),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port, '0.0.0.0');
  logger.log(`Message service REST running on http://0.0.0.0:${port}`);
  logger.log(`Message service gRPC running on 0.0.0.0:${grpcPort}`);
}

bootstrap().catch((error) => {
  logger.error('Message service bootstrap failed', error as Error);
  process.exit(1);
});
