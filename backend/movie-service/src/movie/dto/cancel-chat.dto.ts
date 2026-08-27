import { IsIn, IsOptional, IsUUID } from "class-validator";
import { CANCEL_REASONS, type CancelReason } from "@an-movie/contracts";

export class CancelChatDto {
  @IsUUID(undefined, { message: "turnId 必须是合法的 UUID" })
  turnId!: string;

  @IsOptional()
  @IsIn([...CANCEL_REASONS], { message: "reason 不合法" })
  reason?: CancelReason;
}
