import { IsNotEmpty, IsString } from 'class-validator';

export class AppendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsString()
  @IsNotEmpty()
  messageType!: string;

  @IsString()
  @IsNotEmpty()
  stage!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}
