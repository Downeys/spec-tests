---
phase: 02-agents-and-chat
plan: 04
subsystem: agents
tags: [claude-agent-sdk, sub-agents, mcp, zod, agentdefinition, server-only, hooks, agent-02, agent-06, agent-07, comp-10, res-02, t-02-02, t-02-06]

# Dependency graph
requires:
  - phase: 02-agents-and-chat
    provides: "02-01 — agents vitest project (real DB, fileParallelism: false), pool='vmThreads', @/agents alias; 02-03 — vault/onebrain/tavily MCP tool wrappers + tool IDs (mcp__<server>__<tool>); 02-03 — ToolPermissionDenied class (kept exported, repurposed for hook); 02-03 — D-01 per-turn counters (resetTurnCounter); 02-03 SUMMARY recorded the agentId-injection BLOCKING decision and three options (a/b/c) — 02-04 chose option (a)"
provides:
  - "src/agents/hooks/vault-audit.ts — vaultAuditHook PreToolUse callback (Layer-2 audit) + VAULT_WRITE_TOOL_ID + COMPILATION_AGENT_ID constants (BLOCKING DECISION RESOLVED — see Decisions)"
  - "src/onebrain/types.ts — ContradictionRefSchema + ResearchOutputSchema + CompilationOutputSchema (D-21 carry-forward; consumed by sub-agent definitions)"
  - "src/agents/definitions/research.ts — researchDef AgentDefinition (Sonnet, 7 tools, ResearchOutputSchema, SERVER-ONLY)"
  - "src/agents/definitions/compilation.ts — compilationDef AgentDefinition (Sonnet, 3 tools incl. SOLE mcp__vault__vault_write_atomic, CompilationOutputSchema, SERVER-ONLY)"
  - "src/agents/prompts/research.md — research sub-agent system prompt (D-01/D-04/D-05/D-06 + T-02-04 injection guardrail + 2-shot examples)"
  - "src/agents/prompts/compilation.md — compilation sub-agent system prompt (thin wrapper per RESEARCH §AGENT-06)"
  - "Wave 0 probes green: vault-writer-gate (5 cases — refactored to test hook directly), coordinator-config (9 cases), no-peer-messaging (1 case), schema-malformed-output (5 cases), recompile-roundtrip (1 case), research-no-vault-write (1 case) — total 22 NEW cases this plan + 7 carried from 02-03; agents project total 29/29 green"
  - "tests/fixtures/sub-agent-stubs.ts — VALID + 2 MALFORMED ResearchOutput stubs for AGENT-02 D-04 probe"
affects:
  - 02-05 (coordinator + repo Layer-1 quant-guard): MUST register vaultAuditHook as a PreToolUse hook in query() options; imports researchDef + compilationDef + agents:{research,compilation} in query options; extends coordinator-config.spec.ts with coordinator allowedTools assertions; extends schema-malformed-output.spec.ts with the SDK retry-once integration test
  - 02-06 (SSE bridge + chat route): consumes the same query() configuration shape (research+compilation agents, vaultAuditHook hook, MCP servers from 02-03)
  - 02-07 (UI surface): MUST add the Vite alias fail-fast rule for src/agents/definitions/* per Task 0 in that plan (T-02-06 mitigation completion — the SERVER-ONLY comment headers in 02-04's definitions are the source-tree anchor for 02-07's enforcement)
  - 02-08 (recompile route): inherits the compilation sub-agent definition + the vault-audit hook for the SSE-driven recompile path

# Tech tracking
tech-stack:
  added:
    - "Claude Agent SDK PreToolUse hook pattern — `hooks: { PreToolUse: [{ hooks: [callback] }] }` per @anthropic-ai/claude-agent-sdk@0.2.119 sdk.d.ts:1272-1279; HookCallback signature `(input, toolUseID, { signal }) => Promise<HookJSONOutput>` per sdk.d.ts:718-720"
    - "AgentDefinition object literal pattern — `{ description, prompt, model, tools: [...] as const, outputSchema }` consumed by `query({ agents: { research: researchDef } })`"
    - "vi.hoisted + Proxy-based env mock — selectively override env.VAULT_PATH per test while passing all other keys (DATABASE_URL etc.) through to the real env loader"
  patterns:
    - "Layer 1 (allowedTools) is PRIMARY DEFENSE for COMP-10 — only compilation sub-agent's tools[] contains mcp__vault__vault_write_atomic; SDK refuses to surface the tool to other agents BEFORE any handler runs"
    - "Layer 2 (PreToolUse hook) is AUDIT/CRASH-LOUD — vaultAuditHook reads BaseHookInput.agent_id (snake_case) and returns decision='block' if the tool is vault_write_atomic and agent_id !== 'compilation'. Catches Layer 1 bypass; does NOT throw (returns structured deny per SDK contract)"
    - "SERVER-ONLY comment header on src/agents/definitions/*.ts — names node:fs.readFileSync usage explicitly so the 02-07 Vite alias fail-fast rule has a greppable source-tree anchor (T-02-06 mitigation)"
    - "vi.hoisted + Proxy env mock for selective key override — vi.mock factories are hoisted above const/let declarations (TDZ); vi.hoisted resolves it. Proxy with Reflect.get fallback to actual env keeps DATABASE_URL etc. working for transitive db.ts consumers."
    - "Plan 02-04 chose option (a) for COMP-10 production wiring: Layer 1 (allowedTools) primary + Layer 2 hook audit. Did NOT choose option (b) schema-injected agentId or (c) custom transport shim (both would have required broader SDK plumbing)."

key-files:
  created:
    - "src/agents/hooks/vault-audit.ts (vaultAuditHook PreToolUse callback + VAULT_WRITE_TOOL_ID + COMPILATION_AGENT_ID; ToolPermissionDenied imported from vault.ts and reused)"
    - "src/agents/definitions/research.ts (researchDef + researchPrompt; SERVER-ONLY header)"
    - "src/agents/definitions/compilation.ts (compilationDef + compilationPrompt; SERVER-ONLY header; SOLE holder of mcp__vault__vault_write_atomic in src/agents/definitions/)"
    - "src/agents/prompts/research.md (105 lines, ~2.5k tokens — D-01/D-05/D-06 + T-02-04 injection guardrail + 2-shot examples)"
    - "src/agents/prompts/compilation.md (31 lines — thin wrapper per RESEARCH §AGENT-06)"
    - "tests/agents/coordinator-config.spec.ts (9 cases — sub-agent halves of AGENT-01/COMP-10; 02-05 will extend with coordinator allowedTools assertions)"
    - "tests/agents/no-peer-messaging.spec.ts (1 case — VALIDATION row AGENT-07 grep test)"
    - "tests/agents/schema-malformed-output.spec.ts (5 cases — AGENT-02 D-04 schema-layer half; SDK retry-once integration in 02-05)"
    - "tests/agents/recompile-roundtrip.spec.ts (1 case — AGENT-06; direct fixture seed + vault_write_atomic.handler call)"
    - "tests/agents/research-no-vault-write.spec.ts (1 case — RES-02; sources count + sentinel mtime invariants)"
    - "tests/fixtures/sub-agent-stubs.ts (3 fixture exports)"
  modified:
    - "src/onebrain/types.ts (+3 schemas — Phase 2 section appended; D-21 single-source-of-truth)"
    - "src/agents/tools/vault.ts (REMOVED in-handler agentId check; updated file-header CAVEAT to RESOLVED with reference to hook approach; ToolPermissionDenied class kept exported for hook reuse)"
    - "tests/agents/vault-writer-gate.spec.ts (REWROTE to drive the hook function directly with synthetic PreToolUseHookInput events; 4 original cases kept + 1 new scope-check case; total 5 green)"

key-decisions:
  - "ARCHITECTURAL — Resolved 02-03's BLOCKING decision via option (a): Layer 1 (allowedTools per-agent allowlist) is PRIMARY DEFENSE; Layer 2 is now a PreToolUse hook (src/agents/hooks/vault-audit.ts) that reads BaseHookInput.agent_id (snake_case, present on subagent tool calls). The pre-02-04 in-handler `extra?.agentId` check would have rejected ALL production invocations (MCP RequestHandlerExtra does not carry agentId). Did NOT choose option (b) schema-injected agentId or (c) custom transport shim."
  - "Hook function returns SyncHookJSONOutput with `decision: 'block'` instead of throwing — the SDK's hook contract is structured deny via the JSON channel; throwing inside a hook would surface as an unhandled rejection and bypass the SDK's clean tool-permission denial path."
  - "AgentDefinition shape ships as a plain object literal `as const` — the installed @anthropic-ai/claude-agent-sdk@0.2.119 has no exported `AgentDefinition` type (the agents map is consumed inline by `query({ agents: { research: researchDef } })`). Outputs typed via `outputSchema: ResearchOutputSchema` (the field name `outputSchema` is what the installed SDK accepts; not `responseFormat` or `output`)."
  - "SERVER-ONLY comment header on both definition files — names `node:fs.readFileSync` explicitly so the 02-07 Task 0 Vite alias fail-fast rule has a greppable source-tree anchor (T-02-06 mitigation). Both files load their prompt markdown via `readFileSync(import.meta.url-relative path, 'utf-8')` at module load (process-start, NOT per turn — matches AI-SPEC pitfall #9)."
  - "vi.hoisted + Proxy env mock for VAULT_PATH override — `env.VAULT_PATH` is captured ONCE at module init by Zod safeParse, so mutating process.env.VAULT_PATH after the fact has no effect. The mock intercepts only VAULT_PATH and forwards everything else to the real env via Reflect.get, so transitive consumers like @/onebrain/db.ts (which uses env.DATABASE_URL) keep working."
  - "Direct fixture-walk seed in recompile-roundtrip.spec.ts (instead of calling `ingest(...)`) — the Phase 1 ingest() command calls `appendLogEntry(path.resolve(process.cwd(), 'vault'), ...)` which writes to a cwd-relative path. process.chdir() is NOT supported under vmThreads (per 02-03 deferred-items), so we walk the fixture manually (writeSource → writeEntity → writeClaim → writeEdge in dependency order), skipping the appendLogEntry step."
  - "DID NOT add a coordinator allowedTools assertion in coordinator-config.spec.ts — that's plan 02-05's scope (no coordinator exists yet). The coordinator-config.spec.ts file ships with the research+compilation halves; 02-05 will extend it."
  - "DID NOT add a SDK retry-once integration test in schema-malformed-output.spec.ts — that requires the actual coordinator query() instance to retry, which ships in 02-05. This plan's probe covers the schema-layer half (Zod rejection + path-naming) only."

patterns-established:
  - "AgentDefinition module template: open with SERVER-ONLY header → import readFileSync + fileURLToPath + dirname + resolve → load prompt at module init via readFileSync(resolve(__dirname, '../prompts/X.md'), 'utf-8') → export AgentDefinition as `const def = { description, prompt, model, tools: [...] as const, outputSchema } as const`"
  - "PreToolUse hook template for tool-permission audits: narrow HookInput to PreToolUse → check tool_name === target tool ID → read agent_id from BaseHookInput → return { continue: false, decision: 'block', reason, hookSpecificOutput: { hookEventName, permissionDecision: 'deny', permissionDecisionReason } } on violation; { continue: true } on pass-through"
  - "vi.hoisted + Proxy env mock template for selective key override: `const { state } = vi.hoisted(() => ({ state: { KEY: undefined } }))` → `vi.mock('@/lib/env', async () => { const actual = await vi.importActual<...>('@/lib/env'); return { env: new Proxy(actual.env, { get: (t, p) => p === 'KEY' ? state.KEY : Reflect.get(t, p) }) } })` → mutate state.KEY in beforeEach/afterEach"
  - "Wave 0 hook-test template: import the hook function + import const tool/agent IDs → build synthetic HookInput object → assert on continue/decision/reason fields; do NOT spin up the actual SDK (the hook is a pure function of its input)"

requirements-completed:
  - AGENT-02
  - AGENT-06
  - AGENT-07
  - RES-02

# Metrics
duration: 14min
completed: 2026-04-27
---

# Phase 02 Plan 04: Sub-Agent Definitions Summary

**Two sub-agent definitions (research + compilation) shipped as AgentDefinition objects with strict Zod outputSchemas (D-04), a refactored COMP-10 Layer-2 vault guard moved from in-handler check to a PreToolUse hook, and 22 new Wave 0 probe cases (29 total in agents project) — resolves the 02-03 BLOCKING agentId-injection architectural decision via option (a) and lands all four AGENT-02/AGENT-06/AGENT-07/RES-02 success criteria.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-27T03:49:11Z
- **Completed:** 2026-04-27T04:03:33Z
- **Tasks:** 7 (1 architectural-refactor pre-task + 6 standard plan tasks)
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments

- **BLOCKING ARCHITECTURAL DECISION RESOLVED (Task 0):** The 02-03-SUMMARY flagged that the in-handler `extra?.agentId` check in vault.ts would reject all production invocations because MCP `RequestHandlerExtra` does not carry agentId. Refactored per user direction to option (a): removed the in-handler check; added a PreToolUse hook (src/agents/hooks/vault-audit.ts) that reads `BaseHookInput.agent_id` (snake_case, sdk.d.ts:131) from the SDK's hook event payload (which DOES carry it). Layer 1 (allowedTools) is the primary defense; Layer 2 hook is the audit/crash-loud layer. Test rewritten to drive the hook function directly with synthetic PreToolUseHookInput events; 5/5 cases green (4 original + 1 new scope-check).
- **AGENT-02 + D-04 strict outputSchema shipped:** ResearchOutputSchema + CompilationOutputSchema added to src/onebrain/types.ts (D-21 single source of truth). Wave 0 probe (5 cases) confirms schema rejection of null claim_ids_written, missing proposed_tags, claim_ids_written.length > 10 (D-01 cap), and summary.length > 900 (~150 word D-06 cap). The "exactly one retry then structured error" half ships in 02-05.
- **AGENT-06 compilation sub-agent + recompile round-trip green:** compilationDef defined with model='claude-sonnet-4-6' and tools=[onebrain_search, vault_read, vault_write_atomic]. Wave 0 probe seeds OneBrain via direct fixture walk (avoids ingest()'s cwd-relative log path), invokes vault_write_atomic.handler, asserts pagesWritten>0, frontmatter source_claim_ids overlap with seeded ULIDs, compile_runs.error IS NULL.
- **AGENT-07 no-peer-messaging asserted:** grep-test under src/agents/ for forbidden API names (subAgentToSubAgent, peerInvoke, sendToSubAgent, callSubAgent, invokeSubAgent, delegateTo) returns empty. Sub-agents communicate via OneBrain rows only.
- **RES-02 invariants asserted:** research-no-vault-write probe simulates a research turn (onebrain_write_source + onebrain_write_claim), confirms sources count ≥ 1 AND vault sentinel.md mtime byte-identical AND no new files in tmpVault.
- **COMP-10 sub-agent halves asserted:** coordinator-config.spec.ts (9 cases) confirms researchDef.tools[] contains NO mcp__vault__* tool, compilationDef.tools[] is the sole holder of mcp__vault__vault_write_atomic, compilationDef.tools[] contains no mcp__tavily__* tools, compilationDef.tools[] contains no mcp__onebrain__onebrain_write_* tools, both definitions use claude-sonnet-4-6.
- **T-02-06 source-tree anchor in place:** Both src/agents/definitions/*.ts open with the SERVER-ONLY comment header naming node:fs.readFileSync usage explicitly. The 02-07 Task 0 Vite alias fail-fast rule (still TBD) will use this as the grep target.
- **No regressions:** unit project 17/17 files / 123/123 cases green. Agents project 9/9 files / 29/29 cases green (02-03's 11 cases still passing under the refactored hook approach + 18 new cases from this plan).

## Resolved SDK Surface (downstream-plan reference for 02-05)

Recorded so 02-05..02-08 know the exact API surface they're building against.

### `outputSchema` field name

The installed `@anthropic-ai/claude-agent-sdk@0.2.119` accepts `outputSchema: z.ZodSchema` on the AgentDefinition shape directly. NOT `responseFormat`, NOT `output`, NOT `responseSchema`. There is no exported `AgentDefinition` type from the SDK at this version — we ship the definitions as plain object literals `as const` and the SDK's `query({ agents: { research: researchDef } })` consumes them inline. Plan 02-05's coordinator integration uses the same field name.

### `readFileSync(prompts/research.md)` under NodeNext

Works as expected — `import { readFileSync } from 'node:fs'` + `fileURLToPath(import.meta.url)` + `dirname()` + `resolve(__dirname, '../prompts/research.md')` resolves correctly under tsc + vitest under NodeNext. No import-attribute syntax (`with { type: 'text' }`) needed; no `import.meta.url` adjustment needed. Build (`tsc --noEmit -p tsconfig.node.json`) exits 0; both research.md and compilation.md load at module-init time without runtime errors.

### `mcp__vault__vault_write_atomic` literal-string grep result

```
$ grep -r "mcp__vault__vault_write_atomic" src/agents/definitions/
src/agents/definitions/compilation.ts:// Sole holder of mcp__vault__vault_write_atomic per COMP-10 / Pitfall 5.
src/agents/definitions/compilation.ts:// lists mcp__vault__vault_write_atomic in its tools[] array. coordinator-config.spec.ts asserts.
src/agents/definitions/compilation.ts:    'mcp__vault__vault_write_atomic',
```

EXACTLY ONE file (compilation.ts) under src/agents/definitions/ contains the literal string — 3 mentions all within compilation.ts (2 comments + 1 tools[] array entry). Plan-success criterion #4 satisfied: `grep -r "mcp__vault__vault_write_atomic" src/agents/definitions/ -l | wc -l` returns 1.

### `SERVER-ONLY` comment header grep result

```
$ grep -l "SERVER-ONLY" src/agents/definitions/
src/agents/definitions/research.ts
src/agents/definitions/compilation.ts
```

Both definition files open with the SERVER-ONLY header (T-02-06 source-tree anchor). 02-07 Task 0 must add a Vite alias fail-fast rule using this header as the grep target.

### PreToolUse hook registration shape (for 02-05)

```ts
// src/agents/coordinator.ts (or wherever query() is constructed in 02-05):
import { query } from '@anthropic-ai/claude-agent-sdk';
import { vaultAuditHook } from '@/agents/hooks/vault-audit.js';
import { researchDef } from '@/agents/definitions/research.js';
import { compilationDef } from '@/agents/definitions/compilation.js';
// ... + MCP server factories from 02-03 ...

const result = query({
  prompt: '...',
  agents: { research: researchDef, compilation: compilationDef },
  mcpServers: { vault: createVaultMcpServer(), onebrain: createOnebrainMcpServer(), tavily: createTavilyMcpServer() },
  hooks: {
    PreToolUse: [{ hooks: [vaultAuditHook] }],
  },
});
```

The hook fires on EVERY tool call (sub-agent or main); it short-circuits to `{ continue: true }` for any tool other than `mcp__vault__vault_write_atomic`. Performance impact: one synchronous JSON-shape check per tool invocation.

## Task Commits

Each task committed atomically on `main`:

0. **Task 0: Refactor Layer-2 vault guard from in-handler check to PreToolUse hook** — `26da80c` (refactor) — REQUIRED PRE-TASK per the user directive resolving 02-03's BLOCKING architectural decision
1. **Task 1: Extend src/onebrain/types.ts with 3 new Zod schemas** — `9400087` (feat)
2. **Task 2: Research + compilation sub-agent system prompts** — `2d8a378` (feat)
3. **Task 3: Research + compilation AgentDefinition objects** — `615b540` (feat)
4. **Task 4: coordinator-config + no-peer-messaging Wave 0 probes** — `6897471` (test)
5. **Task 5: schema-malformed-output Wave 0 probe + sub-agent-stubs fixture** — `81cc2ec` (test)
6. **Task 6: recompile-roundtrip + research-no-vault-write Wave 0 probes** — `868db9e` (test)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP_

## Files Created/Modified

**Created (10):**
- `src/agents/hooks/vault-audit.ts` — vaultAuditHook PreToolUse callback + VAULT_WRITE_TOOL_ID + COMPILATION_AGENT_ID constants. Reuses ToolPermissionDenied from vault.ts. Returns `decision: 'block'` on violation; does NOT throw (per SDK contract).
- `src/agents/definitions/research.ts` — researchDef object literal + researchPrompt (loaded via readFileSync at module init). SERVER-ONLY comment header. T-02-02 mitigation: tools[] contains NO mcp__vault__* tool by absence.
- `src/agents/definitions/compilation.ts` — compilationDef object literal + compilationPrompt. SERVER-ONLY comment header. SOLE holder of mcp__vault__vault_write_atomic (COMP-10 / Pitfall 5).
- `src/agents/prompts/research.md` — 105 lines, ~2.5k tokens. Role + ResearchOutputSchema JSON contract + tool palette + D-01/D-05/D-06 + 4 forbidden behaviors (incl. T-02-04 prompt-injection guardrail) + 2-shot examples (happy path + Tavily 5xx).
- `src/agents/prompts/compilation.md` — 31 lines. Thin wrapper per RESEARCH §AGENT-06.
- `tests/agents/coordinator-config.spec.ts` — 9 cases (sub-agent halves of AGENT-01/COMP-10).
- `tests/agents/no-peer-messaging.spec.ts` — 1 case (AGENT-07 grep test).
- `tests/agents/schema-malformed-output.spec.ts` — 5 cases (AGENT-02 D-04 schema-layer).
- `tests/agents/recompile-roundtrip.spec.ts` — 1 case (AGENT-06 round-trip; direct fixture seed + vi.hoisted env mock).
- `tests/agents/research-no-vault-write.spec.ts` — 1 case (RES-02 sources count + sentinel mtime).
- `tests/fixtures/sub-agent-stubs.ts` — 3 fixture exports (VALID + 2 MALFORMED).

**Modified (3):**
- `src/onebrain/types.ts` — appended Phase 2 section with ContradictionRefSchema + ResearchOutputSchema + CompilationOutputSchema (D-21 single source of truth; +32 lines).
- `src/agents/tools/vault.ts` — REMOVED in-handler `extra?.agentId` check; updated file-header CAVEAT from "must be addressed by plan 02-04" to "RESOLVED in 02-04 (Layer-2 hook approach)"; ToolPermissionDenied class kept exported (reused by vaultAuditHook). Handler now passes through to runCompile unconditionally.
- `tests/agents/vault-writer-gate.spec.ts` — REWROTE to drive vaultAuditHook directly with synthetic PreToolUseHookInput events. Kept all 4 original cases (research/coordinator/absent → block; compilation → pass) + added 1 new scope-check case (non-vault tools pass regardless of agent identity). 5/5 green.

## Decisions Made

- **ARCHITECTURAL — chose option (a) for COMP-10 production wiring:** Layer 1 (per-agent allowedTools allowlist) is PRIMARY DEFENSE; Layer 2 is a PreToolUse hook (vault-audit.ts) that reads BaseHookInput.agent_id (snake_case). The pre-02-04 in-handler `extra?.agentId` check would have rejected ALL production invocations because MCP RequestHandlerExtra has no agentId field. Did NOT choose option (b) schema-injected agentId (would have required modifying every vault tool's input schema and complicating the model's tool-call shape) or option (c) custom transport shim (would have required forking/wrapping the SDK's MCP transport, much higher maintenance burden).
- **Hook returns `decision: 'block'` instead of throwing:** the SDK's hook contract is structured deny via SyncHookJSONOutput.decision; throwing inside a hook would bypass the SDK's clean tool-permission denial path and surface as an unhandled rejection.
- **AgentDefinition shape ships as plain object literal `as const`:** the installed SDK has no exported AgentDefinition type; the agents map is consumed inline by `query({ agents: { research: researchDef } })`. The `outputSchema` field name is what the installed SDK accepts (NOT responseFormat/output/responseSchema).
- **SERVER-ONLY comment header on both definition files:** names node:fs.readFileSync usage explicitly so the 02-07 Task 0 Vite alias fail-fast rule has a greppable source-tree anchor (T-02-06 mitigation completion).
- **vi.hoisted + Proxy env mock for VAULT_PATH override:** env.VAULT_PATH is captured ONCE at module init by Zod safeParse. The mock intercepts only VAULT_PATH and forwards everything else to the real env via Reflect.get, keeping db.ts (env.DATABASE_URL) and other transitive consumers working. vi.hoisted required because vi.mock factories hoist above const/let declarations (TDZ).
- **Direct fixture-walk seed in recompile-roundtrip (instead of `ingest(...)`):** Phase 1 `ingest()` calls `appendLogEntry(path.resolve(process.cwd(), 'vault'), ...)` which writes to a cwd-relative path. process.chdir() is NOT supported under vmThreads (per 02-03 deferred-items). Walking the fixture manually skips the appendLogEntry step.
- **DID NOT add coordinator allowedTools assertion in coordinator-config.spec.ts:** that's plan 02-05's scope (no coordinator exists yet).
- **DID NOT add SDK retry-once integration test in schema-malformed-output.spec.ts:** that requires the actual coordinator query() instance to retry (ships in 02-05).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - Architectural] User-directed pre-task: refactor Layer-2 vault guard from in-handler check to onToolCall hook**

- **Found during:** Task 0 (executed BEFORE the standard 02-04 task list per user directive in the spawn prompt)
- **Issue:** The 02-03 implementation read `(extra as { agentId?: string })?.agentId` inside the vault_write_atomic handler. That worked in 02-03 tests (which fabricated `extra: { agentId: 'compilation' }`) but FAILED in production because the MCP standard RequestHandlerExtra does NOT carry agentId — extra.agentId is always undefined in real invocations, so the guard would have rejected ALL calls. The 02-03-SUMMARY flagged this as a BLOCKING architectural decision for 02-04 with three options (a/b/c).
- **Fix:** Per user direction (option a from 02-03-SUMMARY): removed the in-handler check from vault.ts (handler now passes through to runCompile unconditionally); created src/agents/hooks/vault-audit.ts with `vaultAuditHook` PreToolUse callback that reads `BaseHookInput.agent_id` (snake_case, sdk.d.ts:131); rewrote tests/agents/vault-writer-gate.spec.ts to drive the hook function directly with synthetic events. Updated file-header CAVEAT in vault.ts from "must be addressed by plan 02-04" to "RESOLVED in 02-04 (Layer-2 hook approach)".
- **Files modified:** src/agents/tools/vault.ts, tests/agents/vault-writer-gate.spec.ts; created src/agents/hooks/vault-audit.ts
- **Verification:** 5/5 vault-writer-gate cases green; agents project 29/29 cases green (no regressions in 02-03's source-first-ordering, tool-permission, tavily probes); npm run build exits 0.
- **Committed in:** 26da80c (Task 0 commit — separate from the standard 02-04 tasks per user directive)

**2. [Rule 3 - Blocking] process.chdir() avoided in recompile-roundtrip + research-no-vault-write tests (vmThreads incompatibility)**

- **Found during:** Task 6 (writing recompile-roundtrip.spec.ts)
- **Issue:** The plan prescribed `process.chdir(tmpRoot)` + `process.env.VAULT_PATH = tmpVault` to isolate vault writes. process.chdir() is NOT supported under vmThreads pool (per 02-03 deferred-items.md). Without chdir, ingest()'s `appendLogEntry(path.resolve(process.cwd(), 'vault'), ...)` would write to the project's vault/log.md instead of tmpVault.
- **Fix:** Two-pronged. (a) recompile-roundtrip: replaced the `ingest(...)` call with a direct fixture-walk that mirrors ingest's dependency-order writes (writeSource → writeEntity → writeClaim → writeEdge) but skips appendLogEntry. (b) research-no-vault-write: research wrappers don't touch the filesystem at all (only Postgres + pino logging), so chdir was never needed for that test. Both tests use `envState.VAULT_PATH = tmpVault` via the env-mock proxy.
- **Files modified:** tests/agents/recompile-roundtrip.spec.ts, tests/agents/research-no-vault-write.spec.ts
- **Verification:** Both probes green (recompile-roundtrip writes to tmpVault per the runCompile log line `vaultPath:"...recompile-roundtrip-...\\vault"`; research-no-vault-write asserts sentinel.md mtime unchanged AND no new files).
- **Committed in:** 868db9e (Task 6 commit)

**3. [Rule 3 - Blocking] env mock with vi.hoisted Proxy pattern (env.VAULT_PATH captured at module init)**

- **Found during:** Task 6 (first attempt at recompile-roundtrip with bare process.env mutation failed)
- **Issue:** `env.VAULT_PATH` is captured ONCE at module init by Zod safeParse in src/lib/env.ts. Mutating `process.env.VAULT_PATH` in beforeEach has no effect because the env object's value is frozen at import time. First attempt to mock @/lib/env with a bare proxy returning undefined for non-VAULT_PATH keys broke db-setup.ts (which transitively uses env.DATABASE_URL).
- **Fix:** Used `vi.hoisted` to define a mutable envState object (resolves the TDZ issue where vi.mock factories are hoisted above const/let declarations); used `vi.importActual` inside the vi.mock factory to load the real env, then wrapped it in a Proxy that intercepts only VAULT_PATH and forwards everything else via Reflect.get.
- **Files modified:** tests/agents/recompile-roundtrip.spec.ts, tests/agents/research-no-vault-write.spec.ts
- **Verification:** Both probes green; db.ts pool init works (no SCRAM password errors); tests can rewrite VAULT_PATH per case.
- **Committed in:** 868db9e (Task 6 commit, bundled with deviation #2)

**4. [Rule 1 - Bug] Frontmatter field name + tool result shape corrections in recompile-roundtrip**

- **Found during:** Task 6 (asserting frontmatter content)
- **Issue:** Plan example used `claim_ids` for the frontmatter field, but Phase 1's COMP-02 frontmatter convention uses `source_claim_ids`. Plan example also treated the tool handler return as the RunCompileResult directly (`result.error`, `result.pages_written`, `result.run_id`); the actual return is the MCP CallToolResult shape `{ content: [{ type, text: JSON.stringify(...) }] }` with camelCase fields (`runId`, `pagesWritten`, `pagesPlanned`, `pagesSkipped`, `topicPages`).
- **Fix:** Read the JSON from `callResult.content[0].text` first; assert against camelCase fields (`result.pagesWritten`, `result.runId`); read either `source_claim_ids` or `claim_ids` from the frontmatter for forward-compatibility.
- **Files modified:** tests/agents/recompile-roundtrip.spec.ts
- **Verification:** Probe green; frontmatter overlap check passes (seeded ULIDs ⊆ source_claim_ids).
- **Committed in:** 868db9e (Task 6 commit)

**5. [Rule 1 - Bug] Schema enum corrections in research-no-vault-write fixture inputs**

- **Found during:** Task 6 (writing research-no-vault-write.spec.ts)
- **Issue:** Plan example used `kind: 'web'` for the source and `kind: 'evidence'` for the claim. Actual NewSourceSchema.kind enum (per src/onebrain/types.ts:39-48) accepts `web_article|paper|transcript|pdf|user_note|chat_excerpt|web_search_result`; NewClaimSchema.kind enum (types.ts:17-26) accepts `fact|inference|hypothesis|counter|finance.calc|finance.assumption|decision|question`. Plan values would have failed Zod validation. Plan example also used `retrieved_at: new Date()` on the source — that field is NOT in NewSourceSchema (which is `SourceSchema.omit({ id, ingested_at, embedding, raw_text_hash, embedding_model })`).
- **Fix:** Used `kind: 'web_article'` for source, `kind: 'fact'` for claim. Removed `retrieved_at` (not in NewSource), kept `kind, url, title, author: null, published_at: null, raw_text, metadata`. Same correction-pattern as 02-03's source-first-ordering.spec.ts.
- **Files modified:** tests/agents/research-no-vault-write.spec.ts
- **Verification:** Probe green; source row written to Postgres; sentinel mtime invariants pass.
- **Committed in:** 868db9e (Task 6 commit)

**6. [Rule 3 - Blocking] Compilation prompt grep adjustment for "MUST NOT call any tavily" literal**

- **Found during:** Task 2 (verifying acceptance grep `MUST NOT call any tavily`)
- **Issue:** First draft of compilation.md had "You MUST NOT call any \`mcp__tavily__*\` tool" — the backtick + mcp prefix between "any" and "tavily" prevents the literal-string regex match from succeeding.
- **Fix:** Reworded to "You MUST NOT call any tavily_* tool (no \`mcp__tavily__tavily_search\`, ...)" so the literal "MUST NOT call any tavily" appears verbatim. Same adjustment for the onebrain_write_* line.
- **Files modified:** src/agents/prompts/compilation.md
- **Verification:** All Task 2 acceptance greps now match.
- **Committed in:** 2d8a378 (Task 2 commit)

---

**Total deviations:** 6 (1 Rule 4 user-directed architectural; 4 Rule 3 blocking; 1 Rule 1 bug). The Rule 4 was the explicit user pre-task; the rest were necessary for test infrastructure correctness or schema correctness.
**Impact on plan:** All deviations strictly necessary for type-correctness, test infrastructure, or schema validity. No new features; no scope creep. The plan's `<read_first>` blocks anticipated several (the env mock pattern was unanticipated but cleanly resolved via vi.hoisted + Proxy).

## Issues Encountered

**Pre-existing test infrastructure constraint surfaced:** `process.chdir()` not supported under vmThreads (the workaround pool from 02-03 for vitest@4.1.5's broken default forks/threads). Worked around in this plan for both new probes (deviation #2 above); the broader fix (refactor pipeline.test.ts/hash-stability.test.ts/reingest-skip.test.ts/search-hybrid.spec.ts to pass vaultPath explicitly instead of using chdir) remains tracked in `.planning/phases/02-agents-and-chat/deferred-items.md`. No new entries added to deferred-items this plan.

**SDK type for AgentDefinition:** No exported `AgentDefinition` type from @anthropic-ai/claude-agent-sdk@0.2.119. The agents map shape is consumed inline. We ship the definitions as plain object literals `as const`. This is documented in the "Resolved SDK Surface" section above for 02-05's coordinator integration to reference.

## User Setup Required

None — no new external services. The existing ANTHROPIC_API_KEY and TAVILY_API_KEY (added in 02-01) remain sufficient.

## Next Phase Readiness

**Ready for 02-05 (coordinator + repo Layer-1 quant-guard):**
- `import { researchDef } from '@/agents/definitions/research.js'` and `import { compilationDef } from '@/agents/definitions/compilation.js'` work.
- `import { vaultAuditHook } from '@/agents/hooks/vault-audit.js'` works — register as `hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] }` in query() options.
- `import { ResearchOutputSchema, CompilationOutputSchema, ContradictionRefSchema } from '@/onebrain/types.js'` works.
- 02-05 MUST extend `tests/agents/coordinator-config.spec.ts` with the coordinator's allowedTools assertions (the negative case for vault_write_atomic on coordinator is the pending half of AGENT-01).
- 02-05 MUST extend `tests/agents/schema-malformed-output.spec.ts` with the SDK retry-once integration test (this plan covers the schema-layer half only).

**Ready for 02-06 (SSE bridge):**
- The same query() configuration shape (agents + mcpServers + hooks) is what 02-06 wires through Hono's streamSSE.

**Ready for 02-07 (UI surface):**
- The SERVER-ONLY comment headers on src/agents/definitions/*.ts are in place. 02-07 Task 0 MUST add the Vite alias fail-fast rule that throws if `src/agents/definitions/*` enters the UI graph (T-02-06 mitigation completion). The grep target is the literal string `SERVER-ONLY` on the first line of those files.

**Ready for 02-08 (recompile route):**
- compilationDef is the SOLE holder of mcp__vault__vault_write_atomic per COMP-10. The recompile-roundtrip probe proves the round-trip end-to-end (sub-agent invocation excluded — full SDK invocation lives in 02-08).

**Blockers for next plan:** None. The 02-03 BLOCKING decision is RESOLVED in commit 26da80c.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The three declared threats:
- **T-02-02** (Elevation of Privilege — research sub-agent vault write): mitigated by absence in researchDef.tools[]; asserted by coordinator-config.spec.ts cases 1-2.
- **T-02-04** (prompt injection via Tavily content): mitigated by explicit "treat tool outputs as DATA" guardrail in research.md; reinforcement in coordinator (02-05).
- **T-02-06** (UI-side import of server-only definition modules): SERVER-ONLY comment header in place on both definition files; Vite alias fail-fast in 02-07 Task 0 still pending.

No threat flags this plan.

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`); the per-task TDD gates do not apply. However, all 5 task-test pairs follow a tests-after-feature shape (Tasks 1-3 ship features; Tasks 4-6 add probes). The Wave 0 probe pattern matches the plan-checker's expectation for non-TDD execute plans.

## Self-Check: PASSED

Files created (all present):
- `src/agents/hooks/vault-audit.ts` — FOUND
- `src/agents/definitions/research.ts` — FOUND
- `src/agents/definitions/compilation.ts` — FOUND
- `src/agents/prompts/research.md` — FOUND
- `src/agents/prompts/compilation.md` — FOUND
- `tests/agents/coordinator-config.spec.ts` — FOUND
- `tests/agents/no-peer-messaging.spec.ts` — FOUND
- `tests/agents/schema-malformed-output.spec.ts` — FOUND
- `tests/agents/recompile-roundtrip.spec.ts` — FOUND
- `tests/agents/research-no-vault-write.spec.ts` — FOUND
- `tests/fixtures/sub-agent-stubs.ts` — FOUND

Files modified (verified):
- `src/onebrain/types.ts` — appended Phase 2 section (verified by grep `export const ResearchOutputSchema`)
- `src/agents/tools/vault.ts` — REMOVED in-handler agentId check; updated file-header CAVEAT (verified: no `extra?.agentId` reference remains in handler body)
- `tests/agents/vault-writer-gate.spec.ts` — REWROTE to test hook directly (verified: imports vaultAuditHook + makeEvent helper)

Commits exist:
- `26da80c` — refactor(02-04): move COMP-10 Layer-2 vault guard from in-handler check to onToolCall hook
- `9400087` — feat(02-04): extend src/onebrain/types.ts with Phase 2 sub-agent output schemas
- `2d8a378` — feat(02-04): research + compilation sub-agent system prompts
- `615b540` — feat(02-04): research + compilation AgentDefinition objects (Layer-1 allowedTools)
- `6897471` — test(02-04): coordinator-config + no-peer-messaging Wave 0 probes
- `81cc2ec` — test(02-04): schema-malformed-output Wave 0 probe + sub-agent-stubs fixture
- `868db9e` — test(02-04): recompile-roundtrip + research-no-vault-write Wave 0 probes

Wave 0 probes (all green):
- AGENT-01/COMP-10 sub-agent halves (`tests/agents/coordinator-config.spec.ts`) — 9/9 ✓
- AGENT-07 no-peer-messaging (`tests/agents/no-peer-messaging.spec.ts`) — 1/1 ✓
- AGENT-02/D-04 schema-layer (`tests/agents/schema-malformed-output.spec.ts`) — 5/5 ✓
- AGENT-06 recompile round-trip (`tests/agents/recompile-roundtrip.spec.ts`) — 1/1 ✓
- RES-02 research no-vault-write (`tests/agents/research-no-vault-write.spec.ts`) — 1/1 ✓
- COMP-10 Layer-2 audit hook (`tests/agents/vault-writer-gate.spec.ts`, refactored) — 5/5 ✓

Test results:
- `npm test -- --run --project agents` → 9/9 files / 29/29 cases green in 7.48s
- `npm test -- --run --project unit` → 17/17 files / 123/123 cases green in 15.16s
- `npm run build` → exits 0 (clean tsc --noEmit on all new + modified src/ files)

Grep invariants:
- `grep -r "mcp__vault__vault_write_atomic" src/agents/definitions/` returns matches in compilation.ts ONLY (1 file) — COMP-10 single-writer invariant satisfied.
- `grep -l "SERVER-ONLY" src/agents/definitions/` returns research.ts AND compilation.ts (T-02-06 source-tree anchor in place).
- `grep -E "outputSchema:\s*ResearchOutputSchema" src/agents/definitions/research.ts` matches.
- `grep -E "outputSchema:\s*CompilationOutputSchema" src/agents/definitions/compilation.ts` matches.

---
*Phase: 02-agents-and-chat*
*Plan: 04*
*Completed: 2026-04-27*
