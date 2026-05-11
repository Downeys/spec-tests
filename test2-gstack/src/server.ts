// MCP server entrypoint. Order of operations:
//   1. dotenv first — loads .env into process.env so db.ts (imported below)
//      sees DATABASE_URL. We resolve the .env path RELATIVE TO THIS FILE
//      (not cwd) because Claude Desktop's UWP-sandboxed spawn doesn't
//      reliably set cwd to the project dir. dotenv is silent to stdout
//      (only writes to stderr on parse errors), so it's safe to run before
//      the stdout-guard.
//   2. installStdoutGuard() — poisons process.stdout.write so any other
//      caller (third-party deps, accidental console.log) is caught.
//   3. Build the McpServer + register every tool from src/tools/index.ts.
//   4. Hand StdioServerTransport our trustedStdout so its JSON-RPC frames
//      bypass the guard cleanly.
//   5. Install SIGINT/SIGTERM handlers (A2): close server + pg pool, exit 0.

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// dist/server.js lives at <project>/dist/server.js, so .env is one up.
// During `pnpm dev` (tsx running src/server.ts), src/server.ts is at
// <project>/src/server.ts, so .env is also one up. Either way: ../.env.
const __server_dir = dirname(fileURLToPath(import.meta.url));
const dotenvResult = dotenvConfig({ path: resolve(__server_dir, '../.env') });

import { installStdoutGuard, getTrustedStdout } from './lib/stdout-guard.js';

installStdoutGuard();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { tools } from './tools/index.js';
import { closePool } from './lib/db.js';
import { log } from './lib/logger.js';

// Surface what dotenv saw, masked. Helps debug "key not configured" without
// echoing secrets. Logged after stdout-guard + logger are wired.
log.info('dotenv_loaded', {
  path_resolved: resolve(__server_dir, '../.env'),
  parse_error: dotenvResult.error?.message,
  keys_loaded: dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : [],
});

const VERSION = '0.1.0';
const SERVER_NAME = 'onebrain-composer';

async function main(): Promise<void> {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });

  for (const t of tools) {
    // registerTool is the current MCP SDK API (server.tool is deprecated).
    // Config takes description + inputSchema (the raw Zod shape, not z.object).
    // The callback receives parsed args; we forward to the factory's invoke.
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.inputShape,
      },
      async (rawInput: unknown) => {
        const result = await t.invoke(rawInput);
        return result as { content: { type: 'text'; text: string }[]; isError?: boolean };
      },
    );
  }
  log.info('tools_registered', { count: tools.length, names: tools.map((t) => t.name) });

  // Graceful shutdown (A2). Stop accepting new requests, close pg, exit 0.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutdown_initiated', { signal });
    try {
      await server.close();
      await closePool();
      log.info('shutdown_complete');
      process.exit(0);
    } catch (err) {
      log.error('shutdown_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Surface unhandled errors via the logger (NOT console — would hit stdout).
  process.on('uncaughtException', (err: Error) => {
    log.error('uncaught_exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    log.error('unhandled_rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  // Connect via stdio. Pass trustedStdout so JSON-RPC frames bypass the guard.
  // Note: if your installed @modelcontextprotocol/sdk version doesn't accept a
  // custom stdout in the constructor, fall back to `new StdioServerTransport()`
  // and accept that the guard's poisoned process.stdout.write must be lifted
  // for the transport's lifetime — see the workaround pattern in TODOS.md TODO 6.
  const transport = new StdioServerTransport(process.stdin, getTrustedStdout());
  await server.connect(transport);
  log.info('server_connected', { name: SERVER_NAME, version: VERSION });
}

try {
  await main();
} catch (err) {
  log.error('startup_failed', {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}
