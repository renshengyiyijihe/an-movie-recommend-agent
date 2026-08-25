import { ValidationPipe } from "@nestjs/common";

export const HTTP_VALIDATION_PIPE_OPTIONS = {
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
} as const;

export function createHttpValidationPipe(): ValidationPipe {
  return new ValidationPipe(HTTP_VALIDATION_PIPE_OPTIONS);
}
