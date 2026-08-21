import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGrpcClient } from "./auth.grpc";
import { RequestUser } from "./user-context";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authGrpcClient: AuthGrpcClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      user?: RequestUser;
    }>();
    const token = request.headers?.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("未授权，请先登录");
    }

    try {
      const response = await this.authGrpcClient.validateToken(token);
      if (!response.ok || !response.user?.id) {
        throw new UnauthorizedException("未授权，请先登录");
      }
      request.user = {
        id: response.user.id,
        email: response.user.email,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("未授权，请先登录");
    }
  }
}
