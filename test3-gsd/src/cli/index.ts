#!/usr/bin/env node
// src/cli/index.ts
// D-01: single binary `bsp`. D-02: subcommands ingest / compile / db migrate / db reset.
// D-05: --json + -v/-vv flags. D-24: invokable via `npm run bsp -- <args>` for dev.
//
// Source pattern: commander 14.0.3 (RESEARCH.md §"commander CLI skeleton").
//
// The `bin` field in package.json (Plan 01) maps `bsp` → `./dist/cli/index.js`,
// and the `bsp` npm script runs `tsx src/cli/index.ts` for dev. Both end up here.
//
// ARCHITECTURE NOTE — dynamic imports for handlers:
// Each .action() callback dynamic-imports its handler module. This keeps `bsp --help`
// (and any subcommand --help) fast and free of side effects from heavy deps (Voyage SDK,
// pg.Pool, drizzle). The CLI entry should never eagerly load network clients.

import { Command } from 'commander';

const program = new Command();

program
  .name('bsp')
  .description('Business Strategy Planner CLI (Phase 1: walking skeleton)')
  .version('0.1.0');

// ---- ingest ----
program
  .command('ingest')
  .description(
    'Ingest a source into OneBrain (Phase 1: --fixture only; bare URL/file paths rejected per D-08)',
  )
  .argument('[input]', 'URL or file path (REJECTED in Phase 1; use --fixture instead)')
  .option('--fixture <name>', 'Load a built-in test fixture (run with no args to see available)')
  .option('--json', 'Emit JSON instead of human-readable text (D-05)')
  .option('-v, --verbose', 'Verbose output (pino info+) (D-05)')
  .option('--very-verbose', 'Very verbose output (pino debug+) (D-05; commander 14 disallows -vv as short flag — use long form)')
  .action(async (input: string | undefined, opts) => {
    const { ingest } = await import('./commands/ingest.js');
    await ingest(input, opts);
  });

// ---- compile ----
program
  .command('compile')
  .description('Render OneBrain rows into the Obsidian vault (D-13/D-14)')
  .option('--json', 'Emit JSON instead of human-readable text (D-05)')
  .option('-v, --verbose', 'Verbose output (D-05)')
  .action(async (opts) => {
    const { compile } = await import('./commands/compile.js');
    await compile(opts);
  });

// ---- serve (Phase 2, plan 02-01) ----
program
  .command('serve')
  .description(
    'Start the Hono backend server (chat + recompile + health) on 127.0.0.1 (T-02-05)',
  )
  .option('--port <port>', 'Port to listen on (default 3000)', '3000')
  .action(async (opts) => {
    const { serve } = await import('./commands/serve.js');
    await serve(opts);
  });

// ---- db migrate / db reset ----
const db = program
  .command('db')
  .description('Database lifecycle operations (D-06, D-07)');

db.command('migrate')
  .description('Apply pending node-pg-migrate migrations (D-06)')
  .action(async () => {
    const { dbMigrate } = await import('./commands/db-migrate.js');
    await dbMigrate();
  });

db.command('reset')
  .description('Drop schema, re-migrate, clear vault/. Destructive. (D-07)')
  .requiredOption('--confirm', 'Required acknowledgement that this is destructive')
  .action(async (opts) => {
    const { dbReset } = await import('./commands/db-reset.js');
    await dbReset(opts);
  });

// Top-level dispatch with async handler support
try {
  await program.parseAsync(process.argv);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
