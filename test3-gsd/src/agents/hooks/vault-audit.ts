// src/agents/hooks/vault-audit.ts
// Layer-2 AUDIT defense for COMP-10 single-writer-to-vault enforcement.
//
// Layer 1 (PRIMARY DEFENSE) is the SDK's per-agent allowedTools allowlist: only the
// compilation sub-agent (src/agents/definitions/compilation.ts) has the literal string
// 'mcp__vault__vault_write_atomic' in its tools[] array. The Claude Agent SDK refuses
// to surface a tool to a sub-agent that does not list it, so the model literally cannot
// invoke it. The grep-asserted invariant — "exactly ONE file under src/agents/definitions/
// names mcp__vault__vault_write_atomic" — is the canonical source-tree control.
//
// Layer 2 (this file) is a `PreToolUse` hook that reads the SDK's hook event payload
// (which carries `agent_type` — the registered subagent TYPE NAME — per
// @anthropic-ai/claude-agent-sdk sdk.d.ts:135 BaseHookInput.agent_type, snake_case)
// and BLOCKS the call if the tool is vault_write_atomic and the subagent type is not
// 'compilation'. If Layer 1 is ever bypassed (e.g., a future plan accidentally adds
// vault_write_atomic to the research sub-agent's allowlist, or a developer hand-edits
// the definition during a refactor), this hook crashes loudly via the SDK's
// `decision: 'block'` channel and surfaces the regression in the chat trace. The hook
// is a SECOND line of defense, not a substitute for Layer 1.
//
// FIELD CHOICE — agent_type vs agent_id (CRITICAL, was a bug pre-02-08):
//   - BaseHookInput.agent_id (sdk.d.ts:131) is the RUNTIME INSTANCE UUID of the
//     subagent invocation (e.g., 'ae45f1e9b82e3bd72'). It is NOT the registered type.
//   - BaseHookInput.agent_type (sdk.d.ts:135) is the REGISTERED TYPE NAME from the
//     `agents:` map passed to query() (e.g., 'compilation', 'research'). The SDK
//     comment on the field reads: "Agent type name (e.g., \"general-purpose\",
//     \"code-reviewer\"). Present when the hook fires from within a subagent
//     (alongside agent_id), or on the main thread of a session started with --agent
//     (without agent_id)."
//   - 02-04 keyed off `agent_id` and asserted `agent_id === 'compilation'`. That
//     never matched at runtime (the UUID never equals the literal string), so the
//     hook denied EVERY vault_write_atomic call — including legitimate compilation
//     calls — and runCompile() never executed. Tests passed because they fabricated
//     `agent_id: 'compilation'` on the synthetic event, asserting the wrong shape.
//     02-08 corrects the field to `agent_type`.
//
// Wiring: the coordinator (plan 02-05) registers this hook with `query()` via the
// `hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] }` option. See sdk.d.ts:1272-1279
// for the registration shape and sdk.d.ts:718-720 for the HookCallback signature.
//
// Why we do NOT throw: the SDK's hook contract is to RETURN a SyncHookJSONOutput with
// `decision: 'block'` and a `reason`. Throwing inside a hook would surface as an
// unhandled rejection in the SDK's hook runner; returning the structured deny lets
// the SDK report a clean tool-permission denial back through the assistant message.

import type {
  HookInput,
  HookJSONOutput,
  PreToolUseHookInput,
} from '@anthropic-ai/claude-agent-sdk';
import { ToolPermissionDenied } from '@/agents/tools/vault.js';
import { logger } from '@/lib/log.js';

/**
 * The MCP tool ID that uniquely identifies vault_write_atomic. Hard-coded as a
 * literal so a grep for this string yields the audit-layer call site and the
 * compilation sub-agent definition (and only those). If a future plan needs to
 * rename the tool, both call sites must be updated together.
 */
export const VAULT_WRITE_TOOL_ID = 'mcp__vault__vault_write_atomic';

/**
 * The single sub-agent TYPE NAME allowed to invoke vault_write_atomic. Compared
 * against `BaseHookInput.agent_type` (sdk.d.ts:135), which carries the registered
 * subagent type from the `agents:` map (NOT the runtime instance UUID — see
 * file-header FIELD CHOICE note for why that distinction matters). Mirrors the key
 * used to register compilationDef in src/agents/coordinator.ts and the standalone
 * recompile route at src/server/routes/recompile.ts.
 */
export const COMPILATION_SUBAGENT_TYPE = 'compilation';

/**
 * PreToolUse hook callback: blocks vault_write_atomic invocations from any
 * subagent other than 'compilation'. Conforms to the SDK's HookCallback signature
 * (sdk.d.ts:718-720).
 *
 * Behavior:
 *   - tool_name !== VAULT_WRITE_TOOL_ID  → pass through (return continue=true)
 *   - tool_name === VAULT_WRITE_TOOL_ID and agent_type === 'compilation' → pass through
 *   - tool_name === VAULT_WRITE_TOOL_ID and agent_type !== 'compilation' (or absent)
 *     → emit a structured `decision: 'block'` with a deny reason; logger.error so
 *       the regression surfaces in pino output; do NOT throw (see file-header note)
 */
export const vaultAuditHook = async (
  input: HookInput,
  _toolUseID: string | undefined,
  _options: { signal: AbortSignal },
): Promise<HookJSONOutput> => {
  // Narrow to PreToolUse — other hook events flow through untouched. The SDK only
  // wires this callback into PreToolUse via the registration shape, but the
  // HookInput union type is broad so we narrow defensively.
  if (input.hook_event_name !== 'PreToolUse') {
    return { continue: true };
  }
  const evt = input as PreToolUseHookInput;
  if (evt.tool_name !== VAULT_WRITE_TOOL_ID) {
    return { continue: true };
  }

  // Read the subagent TYPE NAME from BaseHookInput.agent_type (snake_case, sdk.d.ts:135).
  // This is the registered type ('compilation', 'research', etc.) — NOT the runtime
  // instance UUID in `agent_id`. Absent on main-thread tool calls in non-agent sessions;
  // present on subagent (AgentTool worker) calls and on --agent main threads. For
  // vault_write_atomic the call MUST originate from the compilation subagent, so an
  // absent agent_type is itself a violation. We also capture agent_id (the runtime
  // UUID) for log correlation only — never for authorization.
  const agentType = evt.agent_type;
  const agentId = evt.agent_id;
  if (agentType === COMPILATION_SUBAGENT_TYPE) {
    logger.info(
      { tool: VAULT_WRITE_TOOL_ID, agent_type: agentType, agent_id: agentId ?? null },
      'vault-audit hook: compilation invocation allowed',
    );
    return { continue: true };
  }

  // Layer 1 should have prevented this call. If we are here, Layer 1 is broken.
  const denial = new ToolPermissionDenied(
    agentType ?? '<no agent_type>',
    VAULT_WRITE_TOOL_ID,
  );
  logger.error(
    {
      tool: VAULT_WRITE_TOOL_ID,
      agent_type: agentType ?? null,
      agent_id: agentId ?? null,
      audit_layer: 'PreToolUse',
      err: denial.message,
    },
    'vault-audit hook: BLOCK — Layer 1 (allowedTools) bypass detected',
  );

  return {
    continue: false,
    decision: 'block',
    reason: denial.message,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: denial.message,
    },
  };
};
