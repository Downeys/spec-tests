// src/cli/commands/serve.ts
// Phase 2 plan 02-01, Task 2 — `bsp serve` subcommand handler.
//
// Pattern: thinnest handler — delegates to startServer() (PATTERNS lines 405-422).
// The Hono server itself binds to 127.0.0.1 (T-02-05 mitigation in
// src/server/index.ts); this CLI only validates --port and forwards.

import { startServer } from '@/server/index.js';
import { logger } from '@/lib/log.js';

export interface ServeOptions {
  port?: string;
}

export async function serve(opts: ServeOptions): Promise<void> {
  const port = opts.port ? Number(opts.port) : 3000;
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`invalid --port value: ${opts.port}`);
  }
  logger.info({ port }, 'bsp serve starting');
  await startServer({ port });
  // Hono's serve() returns immediately after registering the listener but the
  // HTTP server keeps the event loop alive. Block here so the CLI process
  // doesn't exit before the server has had a chance to handle requests.
  await new Promise<void>(() => {});
}
