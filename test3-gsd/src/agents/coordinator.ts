// SERVER-ONLY: this module uses node:fs.readFileSync at module load.
// Do NOT import from src/ui/ — Vite cannot bundle node:fs in the browser.
// The Vite alias fail-fast rule lives in 02-07 Task 0; T-02-06 mitigation.

// src/agents/coordinator.ts
// Top-level coordinator entry per AI-SPEC §3 lines 218-277.
// One query() invocation per chat turn. Loads coordinator-identity.md (the
// coordinator-specific protocol prose) at process boot and passes it to the
// SDK as `systemPrompt`. CLAUDE.md remains the project-level guardrail surface
// and is not loaded by this coordinator at runtime — see plan 02-05 Deviations.
//
// DEVIATION from AI-SPEC §3 (settingSources contract):
//   AI-SPEC §3 documents `settingSources: ['./CLAUDE.md']` to load identity from
//   CLAUDE.md. The installed @anthropic-ai/claude-agent-sdk@0.2.119 declares
//   SettingSource as the enum 'user' | 'project' | 'local' (sdk.d.ts:5043), NOT
//   a file-path array. We therefore load src/agents/coordinator-identity.md
//   inline as `systemPrompt` text via readFileSync at module init (mirrors the
//   same pattern in src/agents/definitions/research.ts + compilation.ts).
//
// Hook + agents wiring follows the shapes recorded in 02-04-SUMMARY:
//   - hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] } per sdk.d.ts:1272-1279
//   - agents: { research: researchDef, compilation: compilationDef }
//   - allowedTools: structurally excludes any vault-namespace tool (T-02-02)
//     and any tavily-namespace tool (research-only delegation). The literal
//     tool-ID strings appear only in coordinatorAllowedTools below; the
//     coordinator source is grep-clean of forbidden namespaces.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { logger } from '@/lib/log.js';
import {
  createOnebrainMcpServer,
  resetTurnCounter,
} from './tools/onebrain.js';
import { createTavilyMcpServer } from './tools/tavily.js';
import { createVaultMcpServer } from './tools/vault.js';
import { researchDef } from './definitions/research.js';
import { compilationDef } from './definitions/compilation.js';
import { vaultAuditHook } from './hooks/vault-audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Coordinator system prompt (loaded at module init from coordinator-identity.md).
 * Read once at process boot — pitfall #9 mitigation (no per-turn file I/O).
 */
export const coordinatorIdentity: string = readFileSync(
  resolve(__dirname, './coordinator-identity.md'),
  'utf-8',
);

/**
 * Coordinator's allowedTools — exported so coordinator-config.spec.ts can
 * assert membership.
 *
 * T-02-02 structural mitigation (READ-vs-WRITE split, refined at 02-08):
 *   The coordinator MAY READ the vault (mcp__vault__vault_read) for citation /
 *   quote use — quoting compiled topic pages back to the user is exactly what
 *   the wiki exists for. The coordinator CANNOT WRITE the vault: the literal
 *   string 'mcp__vault__vault_write_atomic' is intentionally absent from this
 *   allowlist, preserving COMP-10 (single-writer-to-vault — only the
 *   compilation sub-agent ever writes via runCompile). The SDK refuses to
 *   surface a tool the agent does not declare in allowedTools, so the
 *   coordinator literally cannot invoke vault_write_atomic; per-agent
 *   allowedTools is the primary defense. The vaultAuditHook below is Layer 2
 *   (audit/crash-loud) per the COMP-10 two-layer pattern, and it ONLY blocks
 *   vault_write_atomic — vault_read passes through unconditionally.
 *
 *   Spec authority for the read-allowed / write-blocked split:
 *     .planning/phases/02-agents-and-chat/02-AI-SPEC.md §3 (COMP-10 grading)
 *     .planning/phases/02-agents-and-chat/02-RESEARCH.md §3.1 (Layer 1/2 split)
 *     CLAUDE.md "Hard architectural commitments" #2 — single writer to vault
 *
 * RES-01 architectural choice: NO tavily-namespace tool either — the
 * coordinator delegates web research to the research sub-agent. This keeps
 * the coordinator's tool palette minimal (search + four onebrain writes +
 * vault_read) and makes the audit trail clean (every web-search call is owned
 * by research).
 */
export const coordinatorAllowedTools = [
  'mcp__onebrain__onebrain_search',
  'mcp__onebrain__onebrain_write_source',
  'mcp__onebrain__onebrain_write_claim',
  'mcp__onebrain__onebrain_write_edge',
  'mcp__vault__vault_read',
] as const;

/**
 * Run one chat turn through the coordinator. Yields SDK events as they arrive
 * (text deltas, tool calls, tool results, end-of-turn markers).
 *
 * Per-turn lifecycle:
 *   1. resetTurnCounter() — D-01 stop counters reset to zero (the research
 *      sub-agent reads these from each onebrain_write_claim response and
 *      self-stops at ~10 claims / ~120s).
 *   2. Construct three MCP servers (onebrain, tavily, vault). Each is a fresh
 *      handle for this turn; idempotent factory.
 *   3. Invoke query() with the coordinator's systemPrompt + allowedTools +
 *      agents map + PreToolUse hook for the vault audit.
 *   4. for-await over the SDK iterator, re-yielding every event upstream
 *      (the 02-06 SSE bridge translates these into SSE frames).
 *
 * Per-turn iteration uses for-await per RESEARCH pitfall #16 (the SDK
 * iterator must be drained sequentially; do NOT collect via Array.from or
 * Promise.all).
 */
export async function* runCoordinatorTurn(userMessage: string) {
  resetTurnCounter();

  const onebrain = createOnebrainMcpServer();
  const tavily = createTavilyMcpServer();
  const vault = createVaultMcpServer();

  logger.info(
    { userMessageLength: userMessage.length },
    'coordinator turn start',
  );

  // The agents map and outputSchema field on the AgentDefinitions are not
  // declared on the installed SDK's exported AgentDefinition type (the type
  // accepts `tools?: string[]`, prompt, model, etc., but not the outputSchema
  // we attach). We cast through `unknown` to keep tsc green; runtime behavior
  // is unchanged because the SDK consumes the agents map structurally.
  //
  // PERMISSION MODE — bypassPermissions (CORRECT for this deployment) ----------
  // The Claude Agent SDK defaults `permissionMode` to 'default'
  // (sdk.d.ts:1447, sdk.d.ts:3230, PermissionMode union sdk.d.ts:1757), which
  // prompts a HUMAN for permission on every tool call. In a server context
  // (this coordinator runs inside a Hono SSE handler), there IS no interactive
  // prompter — those prompts go nowhere and the SDK silently rejects every
  // tool call. The model then concludes "I have no tools wired" and refuses to
  // answer ("I have no visibility into either side of the hybrid in this
  // session"), even though OneBrain + vault_read ARE both wired.
  //
  // For this project's deployment posture — single-user, local-only, no auth
  // (PROJECT.md §"Out of scope" lines 36-38; CLAUDE.md project-instructions
  // header) — the `allowedTools` allowlist IS the real authorization gate.
  // The coordinator's tool palette is structurally minimized at coordinator-
  // AllowedTools above (T-02-02 read/write split) and at the per-sub-agent
  // tools[] arrays in src/agents/definitions/*. The vault-audit hook is
  // Layer 2 for COMP-10 specifically. Interactive permission prompts add no
  // additional security in this single-user-local-only model and break the
  // server runtime by design.
  //
  // `allowDangerouslySkipPermissions: true` is a required acknowledgment per
  // sdk.d.ts:1456-1459 + sdk.d.ts:3199-3202: "Must be set to `true` when
  // using `permissionMode: 'bypassPermissions'`. This is a safety measure to
  // ensure intentional bypassing of permissions." The acknowledgment is
  // intentional here — see CLAUDE.md hard architectural commitments.
  // ------------------------------------------------------------------------
  const result = query({
    prompt: userMessage,
    options: {
      model: 'claude-opus-4-7',
      systemPrompt: coordinatorIdentity,
      mcpServers: { onebrain, tavily, vault },
      allowedTools: [...coordinatorAllowedTools],
      // See PERMISSION MODE comment block above for rationale.
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      agents: {
        research: researchDef as unknown as never,
        compilation: compilationDef as unknown as never,
      },
      hooks: {
        PreToolUse: [{ hooks: [vaultAuditHook] }],
      },
    } as never,
  });

  // Iterate the SDK iterator with for-await per RESEARCH pitfall #16.
  for await (const ev of result as AsyncIterable<unknown>) {
    yield ev;
  }
}
