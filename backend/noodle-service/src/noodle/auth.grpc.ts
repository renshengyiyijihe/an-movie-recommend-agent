import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

interface ValidateTokenResponse {
  ok: boolean;
  user?: { id: string; email: string; name: string };
  error?: string;
}

@Injectable()
export class AuthGrpcClient implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(AuthGrpcClient.name);

  onModuleInit() {
    const protoPath = join(__dirname, '..', '..', 'proto', 'auth.proto');
    const packageDef = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDef) as any;
    const AuthService = grpcObject.auth.Auth;
    const target = process.env.AUTH_GRPC_ADDRESS ?? 'auth-service:50051';
    this.client = new AuthService(target, credentials.createInsecure());
    this.logger.log(`AuthGrpcClient initialized, target=${target}`);
  }

  validateToken(token: string): Promise<ValidateTokenResponse> {
    this.logger.log(`validateToken call: tokenLength=${token?.length ?? 0}`);
    return new Promise((resolve, reject) => {
      this.client.ValidateToken({ token }, (err: any, response: ValidateTokenResponse) => {
        if (err) {
          this.logger.error('Auth gRPC call failed', err);
          return reject(err);
        }
        this.logger.log(`validateToken response: ok=${response.ok}, user=${response.user?.email ?? 'unknown'}, error=${response.error ?? 'none'}`);
        resolve(response);
      });
    });
  }
}
