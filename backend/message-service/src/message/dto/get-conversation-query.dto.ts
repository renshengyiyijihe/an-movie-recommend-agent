import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { CONVERSATION_PAGE } from "@an-movie/contracts";

export class GetConversationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATION_PAGE.MAX_SIZE)
  limit?: number;

  @IsOptional()
  @IsString()
  before?: string;
}
