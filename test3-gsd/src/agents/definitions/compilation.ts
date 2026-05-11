// SERVER-ONLY: this module uses node:fs.readFileSync at module load.
// Do NOT import from src/ui/ — Vite cannot bundle node:fs in the browser.
// The Vite alias fail-fast rule lives in 02-07 Task 0; T-02-06 mitigation.

// src/agents/definitions/compilation.ts
// Sole holder of mcp__vault__vault_write_atomic per COMP-10 / Pitfall 5.
// The grep-able invariant: this file is the ONLY one under src/agents/definitions/ that
// lists mcp__vault__vault_write_atomic in its tools[] array. coordinator-config.spec.ts asserts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CompilationOutputSchema } from '@/onebrain/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const compilationPrompt: string = readFileSync(
  resolve(__dirname, '../prompts/compilation.md'),
  'utf-8',
);

export const compilationDef = {
  description:
    'The ONLY agent allowed to write to vault/. Wraps Phase 1 runCompile().',
  prompt: compilationPrompt,
  model: 'claude-sonnet-4-6',
  tools: [
    'mcp__onebrain__onebrain_search',
    'mcp__vault__vault_read',
    'mcp__vault__vault_write_atomic',
  ] as const,
  outputSchema: CompilationOutputSchema,
} as const;
