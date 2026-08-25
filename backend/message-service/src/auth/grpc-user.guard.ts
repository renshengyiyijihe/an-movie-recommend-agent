import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import { Metadata, status } from "@grpc/grpc-js";
import { USER_ID_METADATA_KEY, type RequestUser } from "@an-movie/auth-client";

type RpcContext = { metadata?: Metadata; user?: RequestUser } & Partial<Metadata>;

@Injectable()
export class GrpcUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "rpc") return true;

    const rpcContext = context.switchToRpc().getContext<RpcContext>();
    const metadata = this.resolveMetadata(rpcContext);
    const userId = this.readUserId(metadata);
    if (!userId) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: "未授权，请先登录",
      });
    }
    const user: RequestUser = { id: userId };
    rpcContext.user = user;
    if (metadata) (metadata as Metadata & { user?: RequestUser }).user = user;
    return true;
  }

  private resolveMetadata(rpcContext: RpcContext): Metadata | undefined {
    if (rpcContext instanceof Metadata) return rpcContext;
    if (rpcContext?.metadata instanceof Metadata) return rpcContext.metadata;
    if (typeof rpcContext?.get === "function") return rpcContext as Metadata;
    return undefined;
  }

  private readUserId(metadata?: Metadata): string {
    const raw = metadata?.get(USER_ID_METADATA_KEY)?.[0];
    if (!raw) return "";
    return Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  }
}
