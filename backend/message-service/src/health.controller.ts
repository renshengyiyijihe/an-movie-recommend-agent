import { Controller, Get } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get("health")
  async health() {
    await this.dataSource.query("SELECT 1");
    return { ok: true };
  }
}
