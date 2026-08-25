import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGrpcServer } from './auth.grpc';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGrpcServer],
  exports: [AuthService],
})
export class AuthModule {}
