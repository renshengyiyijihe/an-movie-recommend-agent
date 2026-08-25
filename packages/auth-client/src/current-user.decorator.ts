import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { RequestUser, UserContext } from "./user-context";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    if (ctx.getType() === "http") {
      const user = ctx.switchToHttp().getRequest<{ user?: RequestUser }>().user;
      if (user?.id) return user;
    }
    try {
      return UserContext.current();
    } catch {
      throw new UnauthorizedException("未授权，请先登录");
    }
  },
);
