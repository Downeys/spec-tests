// src/agents/tools/vault.ts
// Two MCP tools: vault_read (any agent) and vault_write_atomic (compilation only).
//
// Layer 1 / Layer 2 split per .planning/phases/02-agents-and-chat/02-RESEARCH.md §3.1:
//   - Layer 1 (PRIMARY DEFENSE — protocol-layer guarantee): the SDK's per-agent allowlist
//     (`agents[*].tools`) refuses to surface vault_write_atomic to any agent that does not
//     list it. Wired in plan 02-04 (src/agents/definitions/compilation.ts is the SOLE file
//     under src/agents/definitions/ that lists 'mcp__vault__vault_write_atomic'); enforced
//     by the Claude Agent SDK before any tool handler runs.
//   - Layer 2 (AUDIT — belt-and-braces): a PreToolUse hook reads `event.agent_id` (snake-
//     case, present on subagent tool calls per @anthropic-ai/claude-agent-sdk sdk.d.ts:131
//     BaseHookInput.agent_id) and BLOCKS the call if the tool is vault_write_atomic and the
//     subagent identity is not 'compilation'. The hook lives in src/agents/hooks/vault-audit.ts
//     and is registered with `query()` by the coordinator (plan 02-05). If Layer 1 is
//     ever bypassed (e.g., a future plan accidentally adds vault_write_atomic to another
//     sub-agent's allowlist), the hook crashes loudly so the regression cannot ship silently.
//
// CAVEAT — RESOLVED in 02-04 (Layer-2 hook approach):
//   The pre-02-04 implementation used `if ((extra as { agentId?: string })?.agentId !==
//   'compilation') throw ToolPermissionDenied` inside this handler. That worked in tests
//   (which fabricated `extra: { agentId: 'compilation' }`) but FAILED in production because
//   the MCP standard `RequestHandlerExtra` does NOT carry an agentId field — extra.agentId
//   is always undefined in real invocations. 02-04 chose option (a) from the original three
//   options: use Layer 1 (allowedTools) as the primary defense, and downgrade Layer 2 to a
//   PreToolUse hook assertion that reads the SDK's hook-event payload (which DOES carry
//   agent_id). The hook function is exported from src/agents/hooks/vault-audit.ts; tests
//   for it live in tests/agents/vault-writer-gate.spec.ts.

import {
  tool,
  createSdkMcpServer,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runCompile } from '@/compilation/runner.js';
import { env } from '@/lib/env.js';
import { logger } from '@/lib/log.js';

/**
 * Thrown by the vault-audit Layer-2 PreToolUse hook when a non-compilation subagent
 * attempts to invoke vault_write_atomic. Layer 1 (allowedTools) should normally prevent
 * the call from reaching the hook at all; if this fires, Layer 1 has been bypassed and
 * the regression must be fixed loudly.
 *
 * Kept exported (rather than removed) because the hook in src/agents/hooks/vault-audit.ts
 * uses it and downstream tests assert on the class identity.
 */
export class ToolPermissionDenied extends Error {
  constructor(
    public readonly invoker: string,
    public readonly toolName: string,
  ) {
    super(`${toolName} invoked by ${invoker}, only 'compilation' allowed`);
    this.name = 'ToolPermissionDenied';
  }
}

// `tool()` returns SdkMcpToolDefinition<Schema>. The 4-arg arity per @anthropic-ai/
// claude-agent-sdk@0.2.119 sdk.d.ts:5279 is (name, description, inputSchema, handler).
// The schema must be an AnyZodRawShape (raw key→type map) per sdk.d.ts:114; passing
// `z.object({...})` directly would fail typing.

/**
 * vault_write_atomic — the SOLE write surface to the vault filesystem.
 * Delegates entirely to Phase 1's runCompile() (no new compile logic in Phase 2).
 *
 * Permission model:
 *   - Layer 1 (primary): only compilation sub-agent has this tool in its allowlist;
 *     enforced by the SDK before this handler runs. See src/agents/definitions/compilation.ts.
 *   - Layer 2 (audit): the vault-audit PreToolUse hook (src/agents/hooks/vault-audit.ts)
 *     blocks any non-compilation subagent invocation, providing a crash-loud audit trail
 *     if Layer 1 is bypassed.
 *
 * The handler itself unconditionally delegates to runCompile — there is no in-handler
 * agentId check (see RESOLVED note in the file header).
 */
export const vault_write_atomic = tool(
  'vault_write_atomic',
  'Atomically rewrite the vault from current OneBrain state via runCompile(). Only the compilation sub-agent may invoke this tool (enforced by SDK allowedTools + audit hook). Returns runId + page counts.',
  // Empty input schema — the tool takes no arguments; runCompile reads vaultPath from env.
  {},
  async (_args, _extra) => {
    logger.info('vault_write_atomic invoked');
    const result = await runCompile({ vaultPath: env.VAULT_PATH ?? undefined });
    // Stringify for the MCP tool response surface — the SDK returns this to the model
    // in the tool-result content channel.
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
    };
  },
);

/**
 * vault_read — read a single file from the vault relative path. Any agent may call;
 * useful for the compilation sub-agent's drift detection (Phase 3) and for the
 * coordinator to quote a wiki excerpt back into chat without re-rendering.
 *
 * Path-traversal guard: resolves the relativePath against env.VAULT_PATH and
 * rejects any escape outside the vault root.
 */
export const vault_read = tool(
  'vault_read',
  'Read a file from the vault by relative path. Path-traversal protected.',
  { relativePath: z.string().min(1) },
  async ({ relativePath }, _extra) => {
    const vaultPath = env.VAULT_PATH ?? path.resolve(process.cwd(), 'vault');
    const safe = path.resolve(vaultPath, relativePath);
    // Path-traversal guard — must remain inside vaultPath
    const root = path.resolve(vaultPath);
    if (!safe.startsWith(root + path.sep) && safe !== root) {
      throw new Error(`vault_read path traversal blocked: ${relativePath}`);
    }
    const content = await fs.readFile(safe, 'utf-8');
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify({ relativePath, content }) },
      ],
    };
  },
);

/**
 * Bundle the two vault tools into an MCP server. Coordinator + sub-agents wire this
 * into `query()`'s mcpServers map per AI-SPEC §3 "Entry Point Pattern". Tool IDs
 * exposed to agents: mcp__vault__vault_read and mcp__vault__vault_write_atomic.
 */
export function createVaultMcpServer() {
  return createSdkMcpServer({
    name: 'vault',
    tools: [vault_read, vault_write_atomic],
  });
}
