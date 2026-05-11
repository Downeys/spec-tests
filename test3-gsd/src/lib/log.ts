// src/lib/log.ts
// Pino structured logger with redact rules for sensitive paths.
// P19 mitigation: API keys never leak to logs.

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      '*.api_key',
      '*.apiKey',
      'api_key',
      'apiKey',
      '*.headers.authorization',
      'headers.authorization',
      '*.password',
      'password',
      '*.VOYAGE_API_KEY',
      'VOYAGE_API_KEY',
      '*.POSTGRES_PASSWORD',
      'POSTGRES_PASSWORD',
    ],
    censor: '[REDACTED]',
  },
});
