import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedException } from "@nestjs/common";

export interface RequestUser {
  id: string;
  email?: string;
}

const storage = new AsyncLocalStorage<RequestUser>();

export const UserContext = {
  run<T>(user: RequestUser, fn: () => T): T {
    return storage.run(user, fn);
  },
  current(): RequestUser {
    const user = storage.getStore();
    if (!user?.id) {
      throw new UnauthorizedException("未授权，请先登录");
    }
    return user;
  },
};
