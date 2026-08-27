import { IsNotEmpty, IsString, Length } from 'class-validator';
import { AUTH_USERNAME_MAX_LENGTH, AUTH_USERNAME_MIN_LENGTH } from '@an-movie/contracts';

export class ChangeUsernameDto {
  @IsNotEmpty()
  @IsString()
  @Length(AUTH_USERNAME_MIN_LENGTH, AUTH_USERNAME_MAX_LENGTH)
  username: string;
}
