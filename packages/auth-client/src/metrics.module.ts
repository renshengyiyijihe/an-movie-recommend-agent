import { Global, Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsRegistry } from "./metrics.registry";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsRegistry],
  exports: [MetricsRegistry],
})
export class MetricsModule {}
