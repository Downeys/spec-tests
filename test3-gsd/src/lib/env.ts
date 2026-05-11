// src/lib/env.ts
// Zod-validated env loader. Fails fast at import time if required keys missing.
// (P19 mitigation: API keys never silently default; .env is gitignored.)

import 'dotenv/config';
import { z } from 'zod';

// Validation rules:
// - DATABASE_URL: must be a parseable URL (Postgres needed for the whole repo layer)
// - POSTGRES_PASSWORD: must be a non-empty string
// - VOYAGE_API_KEY: must be defined (string), but empty string is allowed.
//   The Voyage call itself surfaces the auth failure when actually invoked. Allowing
//   empty here lets `npm test` run without a real key, since Voyage is mocked in
//   unit + integration suites and only voyage-live.test.ts (gated by RUN_VOYAGE_TESTS=1)
//   needs a real key.
// - PGADMIN_DEFAULT_EMAIL: optional string (the local docker .env uses 'admin@local'
//   which doesn't pass strict RFC email validation; relax to plain string).
const EnvSchema = z.object({
  // Note: z.string().url() is deprecated in Zod v4 in favor of z.url(), but we keep
  // the .url() method form to match the existing codebase style (types.ts) and the
  // plan's acceptance grep. The deprecation is a warning, not a runtime issue.
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres:// URL'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD required'),
  PGADMIN_DEFAULT_EMAIL: z.string().optional(),
  PGADMIN_DEFAULT_PASSWORD: z.string().optional(),
  VOYAGE_API_KEY: z.string({
    message: 'VOYAGE_API_KEY required (get from https://www.voyageai.com/)',
  }),
  RUN_VOYAGE_TESTS: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  // Phase 2 — Agents and Chat (RESEARCH landmine #5; PATTERNS lines 469-474):
  // ANTHROPIC_API_KEY and TAVILY_API_KEY are required at `bsp serve` boot.
  // Unit tests must inject these via vi.stubEnv() — no separate "test mode" branch
  // (mirrors VOYAGE_API_KEY's Phase-1 mock-by-default discipline).
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY required (get from https://console.anthropic.com/)'),
  TAVILY_API_KEY: z.string().min(1, 'TAVILY_API_KEY required (get from https://app.tavily.com/)'),
  PHOENIX_ENABLED: z.string().optional(),
  RUN_AGENT_TESTS: z.string().optional(),
  RUN_TAVILY_TESTS: z.string().optional(),
  VAULT_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed:\n${issues}\n\nCopy .env.example to .env and fill in values.`,
    );
  }
  return result.data;
}

export const env = load();
