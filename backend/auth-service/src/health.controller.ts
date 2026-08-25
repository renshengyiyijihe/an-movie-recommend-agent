import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { AuthService } from "./auth/auth.service";

@Controller()
export class HealthController {
  constructor(private readonly authService: AuthService) {}

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("ready")
  async ready() {
    if (!process.env.JWT_SECRET) {
      throw new ServiceUnavailableException("JWT_SECRET missing");
    }
    try {
      await this.authService.ping();
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "postgres unavailable",
      );
    }
    return { ok: true };
  }
}
