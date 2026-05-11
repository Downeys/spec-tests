import type { FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@bp/shared';
import { AppError } from './AppError.js';

function sanitizeDetails(details: unknown): unknown {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    return details;
  }
  try {
    const cloned = structuredClone(details) as Record<string, unknown>;
    delete cloned['stack'];
    return cloned;
  } catch {
    return '[unserializable]';
  }
}

export function registerErrorHooks(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      const logLevel = err.status >= 500 ? 'error' : 'warn';
      req.log[logLevel](
        {
          code: err.code,
          status: err.status,
          retryable: err.retryable,
          req_id: req.id,
          err,
        },
        err.message,
      );

      const safeDetails = err.details === undefined ? undefined : sanitizeDetails(err.details);
      const body: ErrorEnvelope = {
        error: {
          code: err.code,
          message: err.message,
          retryable: err.retryable,
          ...(safeDetails !== undefined ? { details: safeDetails } : {}),
        },
      };
      void reply.status(err.status).send(body);
      return;
    }

    req.log.error({ err, req_id: req.id }, 'unhandled_exception');
    const body: ErrorEnvelope = {
      error: {
        code: 'internal',
        message: 'internal_error',
        retryable: false,
      },
    };
    void reply.status(500).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ErrorEnvelope = {
      error: {
        code: 'not_found',
        message: 'Route not found',
        retryable: false,
      },
    };
    void reply.status(404).send(body);
  });
}
