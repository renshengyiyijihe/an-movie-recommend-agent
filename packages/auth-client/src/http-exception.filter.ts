import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ERROR_CODE } from "@an-movie/contracts";
import { AppHttpException } from "./app-http.exception";
import { RequestId } from "./request-id";

type Reply = { status: (code: number) => { json: (body: unknown) => void } };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") {
      throw exception;
    }

    const res = host.switchToHttp().getResponse<Reply>();
    const requestId = RequestId.current();
    const body = toErrorBody(exception, requestId);

    if (body.status >= 500) {
      this.logger.error(
        `requestId=${requestId ?? "none"} ${body.code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(body.status).json({
      code: body.code,
      message: body.message,
      details: body.details,
      requestId,
    });
  }
}

function toErrorBody(
  exception: unknown,
  _requestId: string | undefined,
): { status: number; code: string; message: string; details?: unknown } {
  if (exception instanceof AppHttpException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const { message, details } = nestResponse(exception);
    return {
      status,
      code: codeForStatus(status),
      message,
      details,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ERROR_CODE.INTERNAL_ERROR,
    message: "服务暂时不可用",
  };
}

function codeForStatus(status: number): string {
  if (status === HttpStatus.UNAUTHORIZED) return ERROR_CODE.UNAUTHORIZED;
  if (status === HttpStatus.BAD_REQUEST) return ERROR_CODE.VALIDATION_FAILED;
  if (status === HttpStatus.NOT_FOUND) return ERROR_CODE.NOT_FOUND;
  if (status === HttpStatus.CONFLICT) return ERROR_CODE.EMAIL_EXISTS;
  return ERROR_CODE.INTERNAL_ERROR;
}

function nestResponse(exception: HttpException): { message: string; details?: unknown } {
  const raw = exception.getResponse();
  if (typeof raw === "string") {
    return { message: raw };
  }
  if (typeof raw === "object" && raw) {
    const record = raw as { message?: unknown };
    if (Array.isArray(record.message)) {
      return { message: record.message.join("; "), details: record.message };
    }
    if (typeof record.message === "string" && record.message) {
      return { message: record.message };
    }
  }
  return { message: exception.message };
}
