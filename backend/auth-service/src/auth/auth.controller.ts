import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '@an-movie/auth-client';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LocalJwtGuard } from './local-jwt.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    this.logger.log('register request');
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    this.logger.log('login request');
    return this.authService.login(dto);
  }

  @Post('password')
  @UseGuards(LocalJwtGuard)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    this.logger.log(`change-password request user=${user.id}`);
    return this.authService.changePassword(user.id, dto);
  }
}
