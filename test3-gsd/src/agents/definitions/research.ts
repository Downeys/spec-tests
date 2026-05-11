// SERVER-ONLY: this module uses node:fs.readFileSync at module load.
// Do NOT import from src/ui/ — Vite cannot bundle node:fs in the browser.
// The Vite alias fail-fast rule lives in 02-07 Task 0; T-02-06 mitigation.

// src/agents/definitions/research.ts
// Sub-agent definition per AI-SPEC §3 lines 244-255 + §4b lines 404-415.
// T-02-02 structural mitigation: tools[] does NOT contain mcp__vault__* — by absence,
// the SDK reports tool-not-found before any vault function runs (RESEARCH §3.1 Layer 1).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ResearchOutputSchema } from '@/onebrain/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const researchPrompt: string = readFileSync(
  resolve(__dirname, '../prompts/research.md'),
  'utf-8',
);

// The shape of an AgentDefinition is determined by the installed Claude Agent SDK version.
// We export the object directly; the coordinator (plan 02-05) consumes it inline as
// `agents: { research: researchDef }` in the query() options.
export const researchDef = {
  description:
    'Search the web via Tavily and write findings to OneBrain. Stops at ~10 claims or ~120s.',
  prompt: researchPrompt,
  model: 'claude-sonnet-4-6',
  tools: [
    'mcp__tavily__tavily_search',
    'mcp__tavily__tavily_extract',
    'mcp__tavily__tavily_crawl',
    'mcp__onebrain__onebrain_search',
    'mcp__onebrain__onebrain_write_source',
    'mcp__onebrain__onebrain_write_claim',
    'mcp__onebrain__onebrain_write_edge',
  ] as const,
  outputSchema: ResearchOutputSchema,
} as const;
