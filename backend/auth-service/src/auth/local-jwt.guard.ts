import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '@an-movie/contracts';
import { AppHttpException, type RequestUser } from '@an-movie/auth-client';
import { AuthService } from './auth.service';

const UNAUTHORIZED_MESSAGE = '未授权，请先登录';

/**
 * auth-service 自己的 HTTP 验票。
 * 不要用 `JwtAuthGuard`：那会 gRPC 打回本进程。
 */
@Injectable()
export class LocalJwtGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      user?: RequestUser;
    }>();
    const token = request.headers?.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new AppHttpException(ERROR_CODE.UNAUTHORIZED, UNAUTHORIZED_MESSAGE, 401);
    }

    const result = this.authService.validateToken(token);
    if (!result.ok || !result.user?.id) {
      throw new AppHttpException(ERROR_CODE.UNAUTHORIZED, UNAUTHORIZED_MESSAGE, 401);
    }

    request.user = {
      id: result.user.id,
      email: result.user.email,
    };
    return true;
  }
}
