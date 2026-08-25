import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Metadata } from "@grpc/grpc-js";
import { Observable } from "rxjs";
import { REQUEST_ID_METADATA_KEY } from "./grpc-metadata";
import { RequestId } from "./request-id";
import { RequestUser, UserContext } from "./user-context";

type RpcContext = { metadata?: Metadata; user?: RequestUser; get?: (key: string) => unknown };

function rpcMetadata(rpcContext: RpcContext): Metadata | undefined {
  if (rpcContext instanceof Metadata) return rpcContext;
  if (rpcContext.metadata instanceof Metadata) return rpcContext.metadata;
  if (typeof rpcContext.get === "function") return rpcContext as Metadata;
  return undefined;
}

@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = this.resolveUser(context);
    const rpcRequestId = this.resolveRpcRequestId(context);

    return new Observable((subscriber) => {
      const subscribe = () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });

      const withUser = () => (user ? UserContext.run(user, subscribe) : subscribe());
      const subscription =
        rpcRequestId !== undefined
          ? RequestId.run(rpcRequestId, withUser)
          : withUser();

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

  private resolveRpcRequestId(context: ExecutionContext): string | undefined {
    if (context.getType() !== "rpc") {
      return undefined;
    }
    const rpcContext = context.switchToRpc().getContext<RpcContext>();
    const raw = rpcMetadata(rpcContext)?.get(REQUEST_ID_METADATA_KEY)?.[0];
    if (!raw) return undefined;
    return Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  }
}
