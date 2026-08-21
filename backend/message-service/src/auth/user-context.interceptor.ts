import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Metadata } from "@grpc/grpc-js";
import { Observable } from "rxjs";
import { RequestUser, UserContext } from "./user-context";

type RpcContext = { metadata?: Metadata; user?: RequestUser };

@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = this.resolveUser(context);
    if (!user) return next.handle();

    return new Observable((subscriber) => {
      const subscription = UserContext.run(user, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      );
      return () => subscription.unsubscribe();
    });
  }

  private resolveUser(context: ExecutionContext): RequestUser | undefined {
    const type = context.getType();
    if (type === "http") {
      return context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    }
    if (type === "rpc") {
      const rpcContext = context.switchToRpc().getContext<RpcContext>();
      return rpcContext.user;
    }
    return undefined;
  }
}
