import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { Client, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

interface ValidateTokenResponse {
  ok: boolean;
  user?: { id: string; email: string; name: string };
  error?: string;
}

@Injectable()
export class AuthGrpcClient implements OnModuleInit {
  private client: any;

  onModuleInit() {
    const protoPath = join(__dirname, '..', '..', 'proto', 'auth.proto');
    const packageDef = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDef) as any;
    const AuthService = grpcObject.auth.Auth;
    const target = process.env.AUTH_GRPC_ADDRESS ?? 'auth-service:50051';
    this.client = new AuthService(target, credentials.createInsecure());
  }

  validateToken(token: string): Promise<ValidateTokenResponse> {
    return new Promise((resolve, reject) => {
      this.client.ValidateToken({ token }, (err: any, response: ValidateTokenResponse) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }
}
