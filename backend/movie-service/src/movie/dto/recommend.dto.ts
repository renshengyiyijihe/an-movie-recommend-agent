import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class RecommendDto {
  @IsString()
  @IsNotEmpty({ message: "message 不能为空" })
  @MaxLength(2000, { message: "message 最长 2000 字符" })
  message!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageData?: string;

  @IsOptional()
  @IsUUID(undefined, { message: "conversationId 必须是合法的 UUID" })
  conversationId?: string;
}
