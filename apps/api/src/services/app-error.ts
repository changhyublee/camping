import type { ApiError, ErrorCode } from "@camping/shared";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toApiError(error: AppError): ApiError {
  return {
    code: error.code,
    message: error.message,
  };
}
