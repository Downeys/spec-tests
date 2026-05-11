// src/server/index.ts
// Hono app factory + listen helper. Phase 2 plan 02-01, Task 2.
//
// Spec authority: .planning/phases/02-agents-and-chat/02-RESEARCH.md §INFRA-04
// + .planning/phases/02-agents-and-chat/02-AI-SPEC.md §3.
//
// SECURITY (T-02-05 mitigation):
//   The Hono server binds to 127.0.0.1 ONLY — never 0.0.0.0.
//   Rationale: single-user-local-only deployment per CLAUDE.md + PROJECT.md
//   ("Out of Scope: Authentication / multi-user — personal project, single user").
//   ASVS L1 deviation justified by absence of network-attached attack surface.
//   This `'127.0.0.1'` literal is load-bearing — do NOT remove or refactor to
//   a config flag without an explicit security review.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { healthRoute } from './routes/health.js';
import { chatRoute } from './routes/chat.js';
import { recompileRoute } from './routes/recompile.js';
import { logger } from '@/lib/log.js';
import { env } from '@/lib/env.js';
import { startTracing } from '@/lib/tracing.js';

export function createApp(): Hono {
  const app = new Hono();
  app.route('/', healthRoute);
  // Plan 02-06: SSE coordinator stream — bridges runCoordinatorTurn to
  // assistant-ui's AssistantChatTransport via Hono streamSSE + the SDK-event
  // adapter in src/server/streaming.ts. Output-guard (D-06) wired inside.
  app.route('/', chatRoute);
  // Plan 02-08: POST /recompile (SSE) + GET /recompile/status (JSON).
  // Invokes the compilation sub-agent ONLY (T-02-01 carry-forward); the
  // vault-audit hook fires on every tool call and crashes loud if a non-
  // compilation sub-agent attempts vault_write_atomic.
  app.route('/', recompileRoute);
  return app;
}

export interface StartServerOptions {
  port?: number;
}

export async function startServer(opts: StartServerOptions = {}): Promise<void> {
  // Boot-time env validation — ANTHROPIC_API_KEY and TAVILY_API_KEY MUST be
  // non-empty here. Touching them forces the Zod-validated env to parse and
  // throw with a helpful message if a key is missing (env.ts already calls
  // safeParse at module-load; these touches just make the dependency explicit
  // and survive any future lazy-load refactor).
  void env.ANTHROPIC_API_KEY;
  void env.TAVILY_API_KEY;

  startTracing(); // no-op unless PHOENIX_ENABLED=1

  const port = opts.port ?? 3000;
  const app = createApp();

  // T-02-05 mitigation: bind to 127.0.0.1 ONLY — never 0.0.0.0.
  // See header comment for rationale.
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
  logger.info(
    { port, hostname: '127.0.0.1' },
    'bsp serve listening (local-only — T-02-05)',
  );
}
