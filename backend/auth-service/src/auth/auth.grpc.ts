import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server, ServerCredentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { REQUEST_ID_METADATA_KEY, resolveProtoFile } from '@an-movie/auth-client';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGrpcServer implements OnModuleInit {
  private readonly logger = new Logger(AuthGrpcServer.name);

  constructor(private readonly authService: AuthService) {}

  onModuleInit() {
    const protoPath = resolveProtoFile('auth.proto', 'AUTH_PROTO_PATH');
    const packageDefinition = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDefinition) as any;
    const authPackage = grpcObject.auth;
    const server = new Server();
    server.addService(authPackage.Auth.service, {
      ValidateToken: (call: any, callback: any) => {
        const token = call.request?.token;
        const requestId = readMetadataValue(call.metadata, REQUEST_ID_METADATA_KEY);
        this.logger.log(
          `gRPC ValidateToken request received, tokenPresent=${Boolean(token)}, requestId=${requestId ?? 'none'}`,
        );
        if (!token) return callback(null, { ok: false, error: 'no_token' });
        const result = this.authService.validateToken(token);
        this.logger.log(`gRPC ValidateToken result ok=${result.ok} userId=${result.user?.id ?? 'none'}`);
        callback(null, result);
      },
    });
    const bindAddress = process.env.AUTH_GRPC_BIND ?? '0.0.0.0:50051';
    server.bindAsync(bindAddress, ServerCredentials.createInsecure(), (err, _port) => {
      if (err) {
        this.logger.error('Auth gRPC bind failed', err);
        throw err;
      }
      server.start();
      this.logger.log(`Auth gRPC server listening on ${bindAddress}`);
    });
  }
}

function readMetadataValue(metadata: { get?: (key: string) => unknown[] } | undefined, key: string): string | undefined {
  const raw = metadata?.get?.(key)?.[0];
  if (!raw) return undefined;
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
}
