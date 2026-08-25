import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_USERNAME_MIN_LENGTH,
} from '@an-movie/contracts';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  @Length(AUTH_USERNAME_MIN_LENGTH, AUTH_USERNAME_MAX_LENGTH)
  username: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH)
  password: string;
}
