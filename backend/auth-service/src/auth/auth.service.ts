import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { ERROR_CODE } from '@an-movie/contracts';
import { AppHttpException } from '@an-movie/auth-client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeUsernameDto } from './dto/change-username.dto';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const LOGIN_FAILED_MESSAGE = '邮箱或密码错误';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@localhost:5432/anmovie_db' });

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  async onModuleInit() {
    this.logger.log('Starting auth service and verifying users table.');
    await this.ensureTable();
  }

  async ping(): Promise<void> {
    await pool.query('SELECT 1');
  }

  private async ensureTable() {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      );`);
      this.logger.log('Verified users table exists or created it successfully.');
    } catch (error) {
      this.logger.error('Failed to ensure users table exists', error as Error);
      throw error;
    }
  }

  async register(dto: RegisterDto) {
    this.logger.log('Register attempt');
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [dto.email]);
      if ((existing?.rowCount ?? 0) > 0) {
        this.logger.warn('Register failed: email already exists');
        throw new AppHttpException(ERROR_CODE.EMAIL_EXISTS, '该邮箱已注册', 409);
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const id = randomUUID();
      const result = await pool.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
        [id, dto.username, dto.email, passwordHash],
      );

      const user = result.rows[0];
      const token = this.signToken(user);
      this.logger.log(`Register successful: id=${user.id}`);
      return { token, user: { id: user.id, username: user.name, email: user.email } };
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      this.logger.error('Register error', error as Error);
      throw error;
    }
  }

  async login(dto: LoginDto) {
    this.logger.log('Login attempt');
    try {
      const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [dto.email]);
      const user = result.rows[0];

      if (!user) {
        this.logger.warn('Login failed');
        throw new AppHttpException(ERROR_CODE.INVALID_CREDENTIALS, LOGIN_FAILED_MESSAGE, 401);
      }

      const valid = await bcrypt.compare(dto.password, user.password_hash);
      if (!valid) {
        this.logger.warn('Login failed');
        throw new AppHttpException(ERROR_CODE.INVALID_CREDENTIALS, LOGIN_FAILED_MESSAGE, 401);
      }

      const token = this.signToken(user);
      this.logger.log(`Login successful: id=${user.id}`);
      return { token, user: { id: user.id, username: user.name, email: user.email } };
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      this.logger.error('Login exception', error as Error);
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    this.logger.log(`Change password attempt: id=${userId}`);
    try {
      if (dto.currentPassword === dto.newPassword) {
        throw new AppHttpException(ERROR_CODE.VALIDATION_FAILED, '新密码不能与当前密码相同', 400);
      }

      const result = await pool.query(
        'SELECT id, name, email, password_hash FROM users WHERE id = $1',
        [userId],
      );
      const user = result.rows[0];
      if (!user) {
        this.logger.warn('Change password failed: user not found');
        throw new AppHttpException(ERROR_CODE.UNAUTHORIZED, '未授权，请先登录', 401);
      }

      const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
      if (!valid) {
        this.logger.warn(`Change password failed: id=${userId}`);
        throw new AppHttpException(ERROR_CODE.INVALID_CREDENTIALS, '当前密码错误', 401);
      }

      const passwordHash = await bcrypt.hash(dto.newPassword, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        passwordHash,
        user.id,
      ]);

      const token = this.signToken(user);
      this.logger.log(`Change password successful: id=${user.id}`);
      return { token, user: { id: user.id, username: user.name, email: user.email } };
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      this.logger.error('Change password error', error as Error);
      throw error;
    }
  }

  async changeUsername(userId: string, dto: ChangeUsernameDto) {
    this.logger.log(`Change username attempt: id=${userId}`);
    try {
      const result = await pool.query(
        'SELECT id, name, email FROM users WHERE id = $1',
        [userId],
      );
      const user = result.rows[0];
      if (!user) {
        this.logger.warn('Change username failed: user not found');
        throw new AppHttpException(ERROR_CODE.UNAUTHORIZED, '未授权，请先登录', 401);
      }

      if (user.name === dto.username) {
        throw new AppHttpException(ERROR_CODE.VALIDATION_FAILED, '新用户名不能与当前用户名相同', 400);
      }

      await pool.query('UPDATE users SET name = $1 WHERE id = $2', [dto.username, user.id]);

      const updated = { id: user.id, name: dto.username, email: user.email };
      const token = this.signToken(updated);
      this.logger.log(`Change username successful: id=${user.id}`);
      return { token, user: { id: updated.id, username: updated.name, email: updated.email } };
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      this.logger.error('Change username error', error as Error);
      throw error;
    }
  }

  validateToken(token: string) {
    this.logger.log(`ValidateToken request received, tokenPresent=${Boolean(token)}`);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      const allowedEmail = '1191681452@qq.com';
      
      if (payload.email !== allowedEmail) {
        this.logger.warn(`ValidateToken failed: email is not authorized`);
        return { ok: false, error: 'email_not_authorized' };
      }
      
      this.logger.log(`ValidateToken success for user=${payload.sub}`);
      return { ok: true, user: { id: payload.sub, username: payload.username ?? payload.name, email: payload.email } };
    } catch (error) {
      this.logger.warn(`ValidateToken failed: ${(error as Error).message}`);
      return { ok: false, error: 'invalid_token' };
    }
  }

  private signToken(user: any) {
    return jwt.sign(
      { sub: user.id, email: user.email, username: user.name ?? user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
  }
}
