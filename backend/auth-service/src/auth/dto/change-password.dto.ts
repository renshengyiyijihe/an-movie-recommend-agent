import { IsNotEmpty, IsString, Length } from 'class-validator';
import { AUTH_PASSWORD_MAX_LENGTH, AUTH_PASSWORD_MIN_LENGTH } from '@an-movie/contracts';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  @Length(AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @Length(AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH)
  newPassword: string;
}
