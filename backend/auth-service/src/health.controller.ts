import { Controller, Get } from "@nestjs/common";
import { AuthService } from "./auth/auth.service";

@Controller()
export class HealthController {
  constructor(private readonly authService: AuthService) {}

  @Get("health")
  async health() {
    await this.authService.ping();
    return { ok: true };
  }
}
