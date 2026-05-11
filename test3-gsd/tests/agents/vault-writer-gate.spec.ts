// tests/agents/vault-writer-gate.spec.ts
// Wave 0 probe — VALIDATION row COMP-10 (Layer 2 audit hook).
//
// Threat: T-02-01 (Elevation of Privilege — vault_write_atomic invoked by
// non-compilation agent). Mitigation: src/agents/hooks/vault-audit.ts is a
// PreToolUse hook that BLOCKS the call when tool_name === 'mcp__vault__vault_write_atomic'
// and agent_type !== 'compilation'. The hook returns a structured `decision: 'block'`
// (NOT a thrown exception — see vault-audit.ts header for why).
//
// Layer 1 (allowedTools per-agent allowlist in src/agents/definitions/compilation.ts)
// is the PRIMARY DEFENSE; this Layer 2 hook is the audit/crash-loud layer that catches
// any Layer 1 bypass. Tests for the Layer 1 static-membership invariant live in
// tests/agents/coordinator-config.spec.ts.
//
// History (this spec was REWRITTEN at 02-08 for a critical bug fix):
//   - pre-02-04: the Layer-2 guard lived inside vault_write_atomic's handler as
//     `if (extra?.agentId !== 'compilation') throw ToolPermissionDenied`. That worked
//     in tests (which fabricated `extra: { agentId: 'compilation' }`) but FAILED in
//     production because the MCP standard RequestHandlerExtra does NOT carry an agentId.
//   - 02-04: moved the guard to a PreToolUse hook, but keyed off `BaseHookInput.agent_id`
//     (sdk.d.ts:131), which is the RUNTIME INSTANCE UUID, not the registered type name.
//     Tests passed because they fabricated synthetic events with `agent_id: 'compilation'`
//     (the literal string), but in production the SDK emits a UUID like
//     `ae45f1e9b82e3bd72`, never matching the literal — so the hook denied EVERY
//     vault_write_atomic call, including legitimate compilation calls. runCompile()
//     never executed end-to-end.
//   - 02-08: discovered via a live curl POST /recompile in the smoke check. The hook
//     now reads `BaseHookInput.agent_type` (sdk.d.ts:135), which IS the registered
//     subagent type name from the `agents:` map ('compilation', 'research', etc.).
//     The SDK comment on agent_type reads verbatim:
//       "Agent type name (e.g., \"general-purpose\", \"code-reviewer\"). Present
//        when the hook fires from within a subagent (alongside agent_id), or on the
//        main thread of a session started with --agent (without agent_id)."
//     This spec was rewritten to drive the hook with `agent_type`-shaped events, which
//     match what the SDK actually emits at runtime.

import { describe, it, expect } from 'vitest';
import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
  vaultAuditHook,
  VAULT_WRITE_TOOL_ID,
  COMPILATION_SUBAGENT_TYPE,
} from '@/agents/hooks/vault-audit';
import { ToolPermissionDenied } from '@/agents/tools/vault';

/**
 * Build a synthetic PreToolUseHookInput. The SDK's hook-event payload carries
 * BaseHookInput fields (session_id, transcript_path, cwd, agent_id?, agent_type?)
 * plus the PreToolUse-specific tool_name / tool_input / tool_use_id.
 *
 * agent_type (sdk.d.ts:135) is the REGISTERED TYPE NAME used for authorization.
 * agent_id (sdk.d.ts:131) is a runtime instance UUID surfaced for log correlation
 * only — production observation is `ae45f1e9b82e3bd72` etc., never the type literal.
 * We pass a UUID-shaped string for agent_id in every authorized case to make this
 * distinction obvious and to defend against a regression that re-keys off agent_id.
 */
function makeEvent(
  toolName: string,
  agentType: string | undefined,
): PreToolUseHookInput {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: '/tmp/test-cwd',
    // Synthetic UUID stand-in to mirror the SDK's runtime instance ID. Distinct
    // from agentType to ensure the hook is keyed off TYPE, not ID.
    agent_id: agentType ? 'ae45f1e9b82e3bd72-runtime-uuid' : undefined,
    agent_type: agentType,
    tool_name: toolName,
    tool_input: {},
    tool_use_id: 'test-tool-use-id',
  } as PreToolUseHookInput;
}

const opts = { signal: new AbortController().signal };

describe('vaultAuditHook — Layer 2 PreToolUse audit (COMP-10 / T-02-01)', () => {
  it('BLOCKS vault_write_atomic when invoked by research subagent', async () => {
    const out = await vaultAuditHook(
      makeEvent(VAULT_WRITE_TOOL_ID, 'research'),
      'tool-use-1',
      opts,
    );
    expect(out.continue).toBe(false);
    expect((out as { decision?: string }).decision).toBe('block');
    expect((out as { reason?: string }).reason).toContain('research');
    // Confirm the deny carries the canonical class identity (the hook constructs
    // a ToolPermissionDenied internally to format the reason — testing the literal
    // identity ensures the same error type is reusable from other audit paths).
    const denial = new ToolPermissionDenied('research', VAULT_WRITE_TOOL_ID);
    expect((out as { reason?: string }).reason).toBe(denial.message);
  });

  it('BLOCKS vault_write_atomic when invoked by coordinator (main thread)', async () => {
    const out = await vaultAuditHook(
      makeEvent(VAULT_WRITE_TOOL_ID, 'coordinator'),
      'tool-use-2',
      opts,
    );
    expect(out.continue).toBe(false);
    expect((out as { decision?: string }).decision).toBe('block');
    expect((out as { reason?: string }).reason).toContain('coordinator');
  });

  it('BLOCKS vault_write_atomic when agent_type is absent (no subagent context)', async () => {
    // BaseHookInput.agent_type is `?: string` per sdk.d.ts:135 — absent on the main
    // thread of non-agent sessions. For vault_write_atomic the call MUST originate
    // from the compilation subagent, so an absent agent_type is itself a violation.
    const out = await vaultAuditHook(
      makeEvent(VAULT_WRITE_TOOL_ID, undefined),
      'tool-use-3',
      opts,
    );
    expect(out.continue).toBe(false);
    expect((out as { decision?: string }).decision).toBe('block');
    expect((out as { reason?: string }).reason).toContain('<no agent_type>');
  });

  it('PASSES vault_write_atomic when invoked by compilation subagent', async () => {
    const out = await vaultAuditHook(
      makeEvent(VAULT_WRITE_TOOL_ID, COMPILATION_SUBAGENT_TYPE),
      'tool-use-4',
      opts,
    );
    expect(out.continue).toBe(true);
    // No decision/reason on the pass-through case
    expect((out as { decision?: string }).decision).toBeUndefined();
  });

  it('PASSES non-vault tools regardless of agent identity (scope check)', async () => {
    // The hook must not interfere with any tool other than vault_write_atomic.
    const out = await vaultAuditHook(
      makeEvent('mcp__onebrain__onebrain_write_claim', 'research'),
      'tool-use-5',
      opts,
    );
    expect(out.continue).toBe(true);
    expect((out as { decision?: string }).decision).toBeUndefined();
  });

  it('PASSES mcp__vault__vault_read regardless of agent identity (Bug B — read-allowed)', async () => {
    // Bug B (02-08) refinement: the coordinator now has mcp__vault__vault_read
    // in its allowedTools so it can quote compiled topic pages back to the user.
    // The vault-audit hook is keyed ONLY off the vault_write_atomic tool ID;
    // vault_read passes through unconditionally regardless of agent identity.
    // This test locks in that scope discipline — a regression that broadens
    // the hook to the full vault namespace would fail this case immediately.
    for (const agentType of [
      'coordinator',
      'research',
      'compilation',
      undefined,
    ] as const) {
      const out = await vaultAuditHook(
        makeEvent('mcp__vault__vault_read', agentType),
        `tool-use-vault-read-${agentType ?? 'absent'}`,
        opts,
      );
      expect(
        out.continue,
        `vault_read must pass through for agent_type=${agentType ?? 'absent'}`,
      ).toBe(true);
      expect((out as { decision?: string }).decision).toBeUndefined();
    }
  });

  it('REGRESSION GUARD — does NOT permit on agent_id matching, only agent_type', async () => {
    // This case explicitly defends the bug fix from regressing. Construct an event
    // where agent_id (runtime UUID) is the literal 'compilation' (impossible at
    // runtime — UUIDs don't equal type names — but a regression that re-keys off
    // agent_id would match and incorrectly permit). Meanwhile agent_type is
    // 'research'. The hook MUST deny based on agent_type === 'research', ignoring
    // the agent_id collision.
    const malformed: PreToolUseHookInput = {
      hook_event_name: 'PreToolUse',
      session_id: 'test-session',
      transcript_path: '/tmp/test-transcript.jsonl',
      cwd: '/tmp/test-cwd',
      agent_id: 'compilation', // would-be regression bait
      agent_type: 'research', // the field that actually controls authorization
      tool_name: VAULT_WRITE_TOOL_ID,
      tool_input: {},
      tool_use_id: 'test-tool-use-6',
    } as PreToolUseHookInput;
    const out = await vaultAuditHook(malformed, 'tool-use-6', opts);
    expect(out.continue).toBe(false);
    expect((out as { decision?: string }).decision).toBe('block');
    expect((out as { reason?: string }).reason).toContain('research');
  });
});
