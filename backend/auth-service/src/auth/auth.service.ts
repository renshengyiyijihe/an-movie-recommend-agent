import { Injectable, ConflictException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL ?? 'postgresql://postgres:password@postgres:5432/noodledb' });

@Injectable()
export class AuthService implements OnModuleInit {
  async onModuleInit() {
    await this.ensureTable();
  }

  private async ensureTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );`);
  }

  async register(dto: RegisterDto) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [dto.email]);
    if ((existing?.rowCount ?? 0) > 0) {
      throw new ConflictException('email_exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await pool.query(
      'INSERT INTO users (name,email,password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [dto.username, dto.email, passwordHash],
    );

    const user = result.rows[0];
    const token = this.signToken(user);
    return { token, user: { id: user.id, username: user.name, email: user.email } };
  }

  async login(dto: LoginDto) {
    const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [dto.email]);
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const token = this.signToken(user);
    return { token, user: { id: user.id, username: user.name, email: user.email } };
  }

  validateToken(token: string) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      return { ok: true, user: { id: payload.sub, username: payload.username ?? payload.name, email: payload.email } };
    } catch {
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
