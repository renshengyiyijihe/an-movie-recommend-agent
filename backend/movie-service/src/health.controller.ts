import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("ready")
  ready() {
    if (!process.env.LLM_API_KEY) {
      throw new ServiceUnavailableException("LLM_API_KEY missing");
    }
    return { ok: true };
  }
}
