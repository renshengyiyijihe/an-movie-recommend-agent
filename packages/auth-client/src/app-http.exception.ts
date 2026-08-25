import { HttpException } from "@nestjs/common";
import type { ErrorCode } from "@an-movie/contracts";

export class AppHttpException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}
