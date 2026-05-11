// src/cli/commands/compile.ts
// D-05: human-readable table by default; --json for machine output.

import { runCompile } from '@/compilation/runner.js';
import { logger } from '@/lib/log.js';

export interface CompileOptions {
  json?: boolean;
  verbose?: boolean;
}

export async function compile(opts: CompileOptions): Promise<void> {
  logger.info('compile started');
  const result = await runCompile();

  if (opts.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  process.stdout.write(
    `Compiled ${result.runId}:\n` +
      `  planned: ${result.pagesPlanned}\n` +
      `  written: ${result.pagesWritten}\n` +
      `  skipped: ${result.pagesSkipped}\n`,
  );
  for (const p of result.topicPages) {
    process.stdout.write(
      `  - ${p.path}  hash=${p.hash.slice(0, 16)}…  ${p.written ? 'WRITTEN' : 'unchanged'}\n`,
    );
  }
}
