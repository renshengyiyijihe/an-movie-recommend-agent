import { IsOptional, IsString, MaxLength } from "class-validator";
import { CONVERSATION_TITLE_MAX_LENGTH } from "@an-movie/contracts";

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(CONVERSATION_TITLE_MAX_LENGTH)
  title?: string;
}
