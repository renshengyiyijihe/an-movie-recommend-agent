import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { Server, ServerCredentials } from '@grpc/grpc-js';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGrpcServer implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  onModuleInit() {
    const protoPath = join(__dirname, '..', '..', 'proto', 'auth.proto');
    const packageDefinition = loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObject = loadPackageDefinition(packageDefinition) as any;
    const authPackage = grpcObject.auth;
    const server = new Server();
    server.addService(authPackage.Auth.service, {
      ValidateToken: (call: any, callback: any) => {
        const token = call.request?.token;
        if (!token) return callback(null, { ok: false, error: 'no_token' });
        const result = this.authService.validateToken(token);
        callback(null, result);
      },
    });
    const bindAddress = process.env.AUTH_GRPC_BIND ?? '0.0.0.0:50051';
    server.bindAsync(bindAddress, ServerCredentials.createInsecure(), (err, port) => {
      if (err) throw err;
      server.start();
      console.log(`Auth gRPC server listening on ${bindAddress}`);
    });
  }
}
