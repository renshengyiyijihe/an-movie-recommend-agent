import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Metadata, credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { REQUEST_ID_METADATA_KEY } from "./grpc-metadata";
import { RequestId } from "./request-id";
import { resolveProtoFile } from "./resolve-proto-file";

const VALIDATE_TOKEN_DEADLINE_MS = 3000;

export interface ValidateTokenResponse {
  ok: boolean;
  user?: { id: string; email: string; name: string };
  error?: string;
}

@Injectable()
export class AuthGrpcClient implements OnModuleInit {
  private client: {
    ValidateToken: (
      req: { token: string },
      metadata: Metadata,
      options: { deadline: Date },
      cb: (err: Error | null, response: ValidateTokenResponse) => void,
    ) => void;
  };
  private readonly logger = new Logger(AuthGrpcClient.name);

  onModuleInit() {
    const protoPath = resolveProtoFile("auth.proto", "AUTH_PROTO_PATH");
    const packageDef = loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcObject = loadPackageDefinition(packageDef) as unknown as {
      auth: { Auth: new (target: string, creds: unknown) => AuthGrpcClient["client"] };
    };
    const AuthService = grpcObject.auth.Auth;
    const target = process.env.AUTH_GRPC_ADDRESS ?? "auth-service:50051";
    this.client = new AuthService(target, credentials.createInsecure());
    this.logger.log(`AuthGrpcClient initialized, target=${target}`);
  }

  validateToken(token: string): Promise<ValidateTokenResponse> {
    this.logger.log(`validateToken call: tokenLength=${token?.length ?? 0}`);
    const metadata = new Metadata();
    const requestId = RequestId.current();
    if (requestId) {
      metadata.set(REQUEST_ID_METADATA_KEY, requestId);
    }
    const deadline = new Date(Date.now() + VALIDATE_TOKEN_DEADLINE_MS);

    return new Promise((resolve, reject) => {
      this.client.ValidateToken(
        { token },
        metadata,
        { deadline },
        (err, response) => {
          if (err) {
            this.logger.error("Auth gRPC call failed", err);
            return reject(err);
          }
          this.logger.log(
            `validateToken response: ok=${response.ok}, userId=${response.user?.id ?? "none"}, error=${response.error ?? "none"}`,
          );
          resolve(response);
        },
      );
    });
  }
}
