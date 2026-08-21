import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
