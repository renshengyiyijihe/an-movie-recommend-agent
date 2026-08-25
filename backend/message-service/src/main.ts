import "reflect-metadata";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { createHttpValidationPipe, requestIdMiddleware, resolveProtoFile } from "@an-movie/auth-client";
import { AppModule } from "./app.module";
import { dropLegacyMessageSchema } from "./message/drop-legacy-schema";

const logger = new Logger("MessageServiceBootstrap");
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  logger.log(`[env] loaded ${envPath}`);
} else {
  logger.log(
    `[env] no .env file at ${envPath}, using existing process.env values`,
  );
}

async function bootstrap() {
  logger.log("Bootstrapping message service");
  const postgresUrl =
    process.env.POSTGRES_URL ??
    "postgresql://postgres:password@localhost:5432/anmovie_db";
  await dropLegacyMessageSchema(postgresUrl);

  const app = await NestFactory.create(AppModule);
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createHttpValidationPipe());
  app.enableCors();

  const grpcPort = Number(process.env.MESSAGE_GRPC_PORT ?? 50052);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: "message",
      protoPath: resolveProtoFile("message.proto", "MESSAGE_PROTO_PATH"),
      url: `0.0.0.0:${grpcPort}`,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  await app.startAllMicroservices();

  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port, "0.0.0.0");
  logger.log(`Message service REST running on http://0.0.0.0:${port}`);
  logger.log(`Message service gRPC running on 0.0.0.0:${grpcPort}`);
}

bootstrap().catch((error) => {
  logger.error("Message service bootstrap failed", error as Error);
  process.exit(1);
});
