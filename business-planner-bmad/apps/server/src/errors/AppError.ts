import type { AppErrorShape, ErrorCode } from '@bp/shared';

export interface AppErrorOptions {
  status: number;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error implements AppErrorShape {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}
