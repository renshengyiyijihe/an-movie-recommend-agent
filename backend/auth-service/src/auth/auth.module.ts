import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGrpcServer } from './auth.grpc';
import { LocalJwtGuard } from './local-jwt.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGrpcServer, LocalJwtGuard],
  exports: [AuthService],
})
export class AuthModule {}
