import { Injectable, ConflictException, UnauthorizedException, OnModuleInit, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@postgres:5432/noodledb' });

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  async onModuleInit() {
    this.logger.log('Starting auth service and verifying users table.');
    await this.ensureTable();
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
    this.logger.log(`Register attempt: username=${dto.username}, email=${dto.email}`);
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [dto.email]);
      if ((existing?.rowCount ?? 0) > 0) {
        this.logger.warn(`Register failed: email already exists ${dto.email}`);
        throw new ConflictException('email_exists');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const id = randomUUID();
      const result = await pool.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
        [id, dto.username, dto.email, passwordHash],
      );

      const user = result.rows[0];
      const token = this.signToken(user);
      this.logger.log(`Register successful: id=${user.id}, email=${dto.email}`);
      return { token, user: { id: user.id, username: user.name, email: user.email } };
    } catch (error) {
      this.logger.error(`Register error for email=${dto.email}`, error as Error);
      throw error;
    }
  }

  async login(dto: LoginDto) {
    this.logger.log(`Login attempt for email: ${dto.email}`);
    try {
      const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [dto.email]);
      const user = result.rows[0];

      if (!user) {
        this.logger.warn(`Login failed: user not found for email ${dto.email}`);
        throw new UnauthorizedException('邮箱不存在，请确认后重试。');
      }

      const valid = await bcrypt.compare(dto.password, user.password_hash);
      if (!valid) {
        this.logger.warn(`Login failed: invalid password for email ${dto.email}`);
        throw new UnauthorizedException('密码错误，请确认后重试。');
      }

      const token = this.signToken(user);
      this.logger.log(`Login successful for email: ${dto.email}`);
      return { token, user: { id: user.id, username: user.name, email: user.email } };
    } catch (error) {
      this.logger.error(`Login exception for email=${dto.email}`, error as Error);
      throw error;
    }
  }

  validateToken(token: string) {
    this.logger.log(`ValidateToken request received, tokenPresent=${Boolean(token)}`);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      this.logger.log(`ValidateToken success for user=${payload.email ?? payload.sub}`);
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
