import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { MilvusProvider } from "./milvus/milvus.provider";

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly milvusProvider: MilvusProvider,
  ) {}

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("ready")
  async ready() {
    try {
      await this.dataSource.query("SELECT 1");
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "postgres unavailable",
      );
    }
    try {
      await this.milvusProvider.ping();
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "milvus unavailable",
      );
    }
    return { ok: true };
  }
}
