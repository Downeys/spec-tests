---
phase: 02-agents-and-chat
plan: 03
subsystem: agents
tags: [claude-agent-sdk, mcp, tools, tavily, vault, onebrain, zod, vitest, agent-08, comp-10, d-05]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: "src/onebrain/repo.ts (writeSource/writeClaim/writeEdge/findSource); src/compilation/runner.ts (runCompile); src/onebrain/types.ts (NewSourceSchema/NewClaimSchema/NewEdgeSchema); src/onebrain/embed.ts (1024-dim embed); tests/setup/db-setup.ts (resetSchemaAndMigrate)"
  - phase: 02-agents-and-chat
    provides: "02-01 — agent SDK exact-pinned 0.2.119, env keys for ANTHROPIC/TAVILY, vitest agents project (real DB, fileParallelism: false), @/agents alias; 02-02 — searchClaims hybrid reader signature for onebrain_search wrapper to delegate to"
provides:
  - "src/agents/tools/vault.ts — vault_read + vault_write_atomic + ToolPermissionDenied + createVaultMcpServer (COMP-10 Layer-2 belt-and-braces guard)"
  - "src/agents/tools/onebrain.ts — onebrain_write_source/write_claim/write_edge/search + SourceRowNotFoundError + resetTurnCounter + createOnebrainMcpServer (D-05 protocol-layer source-row-first; D-01 per-turn counters)"
  - "src/agents/tools/tavily.ts — tavily_search + tavily_extract + tavily_crawl + createTavilyMcpServer (RES-01 capability surface; D-03 search-default depth 'advanced')"
  - "src/onebrain/quant-pattern.ts — pure-fn QUANT_PATTERN regex + matchesQuantitativePattern (consumed by 02-05 repo Layer-1 schema guard)"
  - "tests/fixtures/quantitative-claims.ts — 5-case AGENT-08 fixture (consumed by 02-05 quantitative-claim-guard.spec.ts)"
  - "Wave 0 probes green: vault-writer-gate (4 cases), source-first-ordering (2 cases), tool-permission (4 cases), tavily (1 case mocked) — total 11/11 green in agents project"
  - "package.json scripts: test:tavily, test:agent, test:full"
  - "vitest.config.ts pool='vmThreads' workaround for vitest@4.1.5 default pool runner-init bug"
affects:
  - 02-04 (sub-agent definitions): imports createOnebrainMcpServer, createTavilyMcpServer, createVaultMcpServer + the individual tool consts; allowlist test (coordinator-config.spec.ts) consumes the tools[] surface this plan exposes
  - 02-05 (coordinator + repo Layer-1 quant-guard): imports matchesQuantitativePattern + QUANT_PATTERN from @/onebrain/quant-pattern; consumes QUANTITATIVE_CLAIM_CASES fixture for 5-case schema-layer probe
  - 02-06 / 02-08 (SSE bridge + recompile route): inherit the same MCP server factories
  - 02-07 (UI): no direct dep, but observability-trace UI surfaces tool-call events emitted from these wrappers

# Tech tracking
tech-stack:
  added:
    - "MCP tool wrapper pattern via @anthropic-ai/claude-agent-sdk@0.2.119 `tool(name, description, schema-shape, handler)` 4-arg form"
    - "Vitest pool: 'vmThreads' as default — workaround for vitest@4.1.5 forks/threads runner-init failure on Windows"
  patterns:
    - "Tool wrapper return shape: MCP CallToolResult { content: [{ type: 'text', text: JSON.stringify(payload) }] } — the SDK returns text content to the model"
    - "Schema reuse via .shape: pass NewSourceSchema.shape (raw ZodRawShape) to tool() instead of redefining fields — keeps wrapper as a thin pass-through; validation is owned by Phase 1 repo"
    - "Layer 1 / Layer 2 guard split per RESEARCH §3.1 — Layer 1 is the SDK's per-agent allowlist (production protocol guarantee), Layer 2 is the runtime guard inside the tool body (catches non-agent direct import-and-call)"
    - "Per-turn counters as module-level state — single-user-no-concurrency invariant; coordinator calls resetTurnCounter() at top of each turn (D-01 stop-criteria carrier)"
    - "Singleton lazy-init for external API clients (mirrors src/onebrain/embed.ts:30-34) — first call constructs; tests vi.mock the factory before first call"
    - "Gated live-API tests use vi.doUnmock + vi.resetModules + dynamic import to bypass the hoisted top-level vi.mock when RUN_*_TESTS=1"

key-files:
  created:
    - "src/onebrain/quant-pattern.ts (regex + pure-fn matcher)"
    - "src/agents/tools/vault.ts (vault_read + vault_write_atomic + ToolPermissionDenied + createVaultMcpServer)"
    - "src/agents/tools/onebrain.ts (4 tools + SourceRowNotFoundError + resetTurnCounter + createOnebrainMcpServer)"
    - "src/agents/tools/tavily.ts (3 tools + createTavilyMcpServer)"
    - "tests/fixtures/quantitative-claims.ts (5-case AGENT-08 fixture)"
    - "tests/unit/quant-pattern.test.ts (8-case regex unit cover)"
    - "tests/agents/vault-writer-gate.spec.ts (4-case Wave 0 — COMP-10 Layer 2)"
    - "tests/agents/source-first-ordering.spec.ts (2-case Wave 0 — D-05 Layer 2)"
    - "tests/agents/tool-permission.spec.ts (4-case Wave 0 — module-level static membership)"
    - "tests/agents/tavily.spec.ts (1-case Wave 0 — RES-01 mocked-default + RUN_TAVILY_TESTS=1 gated)"
  modified:
    - "package.json (+3 scripts: test:tavily, test:agent, test:full)"
    - "vitest.config.ts (pool: 'vmThreads' workaround for vitest@4.1.5 runner bug)"
    - ".planning/phases/02-agents-and-chat/deferred-items.md (logged the vitest pool issue + chdir cascade + pool-end-then-reuse cascade)"

key-decisions:
  - "Used the SDK's 4-arg tool() form `(name, description, inputSchema, handler)` per @anthropic-ai/claude-agent-sdk@0.2.119 sdk.d.ts:5279 — the plan's PATTERNS doc and RESEARCH §3.1 use a 3-arg form (name, schema, handler) which doesn't compile in this SDK version. The literal grep checks (ToolPermissionDenied, agentId.*compilation, runCompile) all match in the 4-arg form."
  - "Passed schemas as raw ZodRawShape via .shape (e.g. `NewSourceSchema.shape`), not z.object({...}) — the SDK's tool() type signature is `Schema extends AnyZodRawShape` per sdk.d.ts:114."
  - "Tool handler return shape is MCP CallToolResult `{ content: [{ type: 'text', text: JSON.stringify(payload) }] }` — the SDK's `tool()` typesig requires Promise<CallToolResult>. Tests parse the JSON to assert against payload fields."
  - "Layer-2 runtime guard reads `(extra as { agentId?: string })?.agentId` — see CAVEAT in src/agents/tools/vault.ts file header. The MCP RequestHandlerExtra (from @modelcontextprotocol/sdk) does NOT carry agentId; production wiring of the guard is a 02-04 architectural decision (the test fabricates the field directly, per the plan's own probe pattern). 4 cases green in vault-writer-gate.spec.ts."
  - "vitest pool: 'vmThreads' set as the default in vitest.config.ts (Rule 3 deviation) — vitest@4.1.5's default 'forks' pool fails ALL tests with `TypeError: Cannot read properties of undefined (reading 'config')` (the runner global is never initialized in worker context). vmThreads works for unit + agents projects; integration tests using process.chdir() now fail (logged separately)."
  - "Did NOT add a Layer-1 schema guard at repo.writeClaim — that's plan 02-05's scope. This plan ships the regex (src/onebrain/quant-pattern.ts) + the fixture so 02-05 can land the schema guard atomically."

patterns-established:
  - "MCP tool wrapper template (3 modules adopted): import tool from agent-sdk → define raw ZodRawShape input → handler returns { content: [{ type: 'text', text: JSON.stringify(...) }] } → bundle in createXxxMcpServer() factory exported from same file"
  - "Typed-error pattern at the wrapper boundary: ToolPermissionDenied (vault) + SourceRowNotFoundError (onebrain) — named class with typed payload (`invoker`, `missingId`) so callers can `instanceof` and pattern-match in tests + the SDK's structured-error channel"
  - "Wave 0 probe template for tool gates: hoisted vi.mock for runCompile/external clients → cast `tool.handler as Handler` to invoke directly with fabricated extra context → assert on the JSON-parsed CallToolResult.content[0].text payload"
  - "Per-turn counter module-level state for D-01 — coordinator owns the reset() call; sub-agent reads counters out of every write-claim response to self-stop"

requirements-completed:
  - COMP-10
  - RES-01

# Metrics
duration: 27min
completed: 2026-04-27
---

# Phase 02 Plan 03: Tool-Permission Boundary Summary

**Three MCP tool modules (vault, onebrain, tavily) with the COMP-10 single-writer Layer-2 runtime guard, the D-05 source-row-first protocol-layer guard, and the AGENT-08 Layer-1 quant-pattern regex (consumed by 02-05) — all four Wave 0 probes green (11/11 cases) and the @anthropic-ai/claude-agent-sdk@0.2.119 surface verified for 02-04's allowlist wiring.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-04-27T03:05:15Z
- **Completed:** 2026-04-27T03:31:45Z
- **Tasks:** 5
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments

- **COMP-10 Layer 2 runtime guard:** `vault_write_atomic` throws `ToolPermissionDenied` for any caller whose `extra.agentId !== 'compilation'`. 4 cases green in `vault-writer-gate.spec.ts` (research/coordinator/missing-ctx all rejected; compilation passes through to the mocked runCompile). The literal `'compilation'` and `ToolPermissionDenied` both appear together in `src/agents/tools/vault.ts` per RESEARCH §3.1.
- **AGENT-08 Layer 2 protocol guard:** `onebrain_write_claim` iterates `cites_source_ids[]` and calls `findSource(id)` on each ULID; first miss → throws `SourceRowNotFoundError`. 2 cases green in `source-first-ordering.spec.ts` (forward-ref rejected; real-source accepted with the full counter response).
- **D-01 per-turn counters wired:** every `onebrain_write_claim` response carries `{ claim, elapsed_seconds, claim_count_this_turn }` so the sub-agent can self-stop at ~10 claims / ~120s. The coordinator (02-05) will call `resetTurnCounter()` at turn-start.
- **RES-01 capability surface:** all three Tavily tools live (`search` default depth `'advanced'` per D-03; `extract`; `crawl` wired but not default-invoked). 1-case mocked probe green; live probe runnable via `npm run test:tavily`.
- **Module-level COMP-10 static membership probe:** `tool-permission.spec.ts` (4 cases) proves `vault_write_atomic` is exclusively in the vault module; the onebrain + tavily modules don't accidentally re-export it; `createVaultMcpServer()` registers under name='vault' with type='sdk'.
- **Quant-pattern + 5-case fixture for 02-05:** `src/onebrain/quant-pattern.ts` exports the verbatim RESEARCH §3.5 regex; `tests/fixtures/quantitative-claims.ts` exports 5 frozen cases. Both consumed by plan 02-05's repo-layer probe.
- **No regressions in unit project:** 17/17 test files, 123/123 cases green (8 of those new in `tests/unit/quant-pattern.test.ts`).

## Task Commits

Each task committed atomically on `main`:

1. **Task 1: Pure utility — quant-pattern + 5-case fixture + vitest pool workaround** — `ab7b5b5` (feat)
2. **Task 2: src/agents/tools/vault.ts + Layer-2 guard probe** — `391a045` (feat)
3. **Task 3: src/agents/tools/onebrain.ts + D-05 wrapper + counters** — `b417804` (feat)
4. **Task 4: src/agents/tools/tavily.ts + gated probe + test scripts** — `4698f7f` (feat)
5. **Task 5: tool-permission + source-first-ordering Wave 0 probes** — `d78f545` (test)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP_

## Resolved SDK Surface (downstream-plan reference for 02-04)

Recorded so 02-04..02-08 know the exact API surface they're building against.

### `tool()` arity

```ts
// @anthropic-ai/claude-agent-sdk@0.2.119 sdk.d.ts:5279
function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,                                  // raw shape, NOT z.object({...})
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations; searchHint?: string; alwaysLoad?: boolean },
): SdkMcpToolDefinition<Schema>;
```

### `extra` parameter shape (CRITICAL for 02-04)

The `extra: unknown` passed to handlers is, at runtime, an MCP `RequestHandlerExtra` (from `@modelcontextprotocol/sdk/types.js`):

```ts
{
  signal: AbortSignal;
  authInfo?: AuthInfo;
  sessionId?: string;
  _meta?: RequestMeta;
  requestId: RequestId;
  taskId?: string;
  taskStore?: RequestTaskStore;
  taskRequestedTtl?: number;
  requestInfo?: RequestInfo;
}
```

**It does NOT carry an `agentId` field at runtime.** The Claude Agent SDK's hooks (per sdk.d.ts:5167-5190) surface `agent_id` (snake_case) in the *hook* event payload, but does NOT inject it into the per-tool `extra` parameter.

**Consequence:** the Layer-2 runtime guard in `src/agents/tools/vault.ts` (`if (ctx?.agentId !== 'compilation') throw ToolPermissionDenied`) — implemented verbatim per the plan and RESEARCH §3.1 — would in production reject ALL invocations because `agentId` is always `undefined`. The `vault-writer-gate.spec.ts` probe passes because the test fabricates `{ agentId: 'compilation' }` directly via `(tool.handler)(args, { agentId: 'compilation' })`.

**Required 02-04 decision (one of):**
1. Use only Layer 1 (per-agent SDK allowlist) and downgrade Layer 2 to a hook-based assertion (`onToolCall` reads `event.agent_id`).
2. Inject `agentId` into the tool's input schema as a sub-agent prompt convention.
3. Wire a custom transport shim that decorates `extra` with the current sub-agent identity.

The plan's `<output>` block explicitly asked this be recorded for 02-04 — plan 02-04 cannot start without resolving this.

### `@tavily/core` ESM status

ESM-clean. `import { tavily } from '@tavily/core'` works under NodeNext. No createRequire fallback needed (matches 02-01-SUMMARY's verification at install time). `tavily_search/extract/crawl` all use the static import.

### Tool exports (for 02-04 imports)

```ts
// src/agents/tools/vault.ts
export const vault_read;                  // SdkMcpToolDefinition
export const vault_write_atomic;          // SdkMcpToolDefinition (Layer-2 guarded)
export class ToolPermissionDenied;        // typed error
export function createVaultMcpServer();   // returns McpSdkServerConfigWithInstance

// src/agents/tools/onebrain.ts
export const onebrain_write_source;       // SdkMcpToolDefinition (idempotent)
export const onebrain_write_claim;        // SdkMcpToolDefinition (D-05 + counters)
export const onebrain_write_edge;         // SdkMcpToolDefinition
export const onebrain_search;             // SdkMcpToolDefinition (embed → searchClaims)
export class SourceRowNotFoundError;      // typed error
export function resetTurnCounter();       // coordinator calls at turn-start
export function createOnebrainMcpServer();

// src/agents/tools/tavily.ts
export const tavily_search;               // depth 'advanced'
export const tavily_extract;
export const tavily_crawl;                // wired, not default-invoked (D-03)
export function createTavilyMcpServer();

// src/onebrain/quant-pattern.ts (consumed by 02-05)
export const QUANT_PATTERN: RegExp;
export function matchesQuantitativePattern(text: string): boolean;
```

MCP tool IDs exposed to agents (for 02-04 `tools[]` allowlists):
- `mcp__vault__vault_read`
- `mcp__vault__vault_write_atomic`
- `mcp__onebrain__onebrain_write_source`
- `mcp__onebrain__onebrain_write_claim`
- `mcp__onebrain__onebrain_write_edge`
- `mcp__onebrain__onebrain_search`
- `mcp__tavily__tavily_search`
- `mcp__tavily__tavily_extract`
- `mcp__tavily__tavily_crawl`

## Files Created/Modified

**Created (10):**
- `src/onebrain/quant-pattern.ts` — RESEARCH §3.5 verbatim regex; pure fn; consumer-list comment for 02-05 + this plan's tests
- `src/agents/tools/vault.ts` — vault_read + vault_write_atomic with Layer-2 runtime guard + ToolPermissionDenied + createVaultMcpServer; file-header CAVEAT documents the production-context concern for 02-04
- `src/agents/tools/onebrain.ts` — four MCP tools + SourceRowNotFoundError + resetTurnCounter + createOnebrainMcpServer; D-05 source-row-first guard at onebrain_write_claim; per-turn counter logic
- `src/agents/tools/tavily.ts` — three MCP tools + createTavilyMcpServer; singleton lazy-init client; D-03 default depth 'advanced'
- `tests/fixtures/quantitative-claims.ts` — 5-case fixture (sourced/unsourced/sub-million/TAM-keyword/forward-ref) frozen + typed
- `tests/unit/quant-pattern.test.ts` — 8 cases verifying regex matches expected outcomes per AGENT-08
- `tests/agents/vault-writer-gate.spec.ts` — 4 cases (research/coordinator/missing-ctx rejected; compilation passes through)
- `tests/agents/source-first-ordering.spec.ts` — 2 cases (forward-ref → SourceRowNotFoundError; real-source → claim + counters)
- `tests/agents/tool-permission.spec.ts` — 4 cases (module-level compartmentalization)
- `tests/agents/tavily.spec.ts` — 1 case (mocked default + RUN_TAVILY_TESTS=1 gated)

**Modified (3):**
- `package.json` — +3 scripts (test:tavily, test:agent, test:full)
- `vitest.config.ts` — `test.pool: 'vmThreads'` workaround (Rule 3 deviation; see Deviations below)
- `.planning/phases/02-agents-and-chat/deferred-items.md` — three new entries documenting the vitest pool issue and its two cascades

## Decisions Made

- **4-arg `tool()` form** instead of the 3-arg form in PATTERNS / RESEARCH §3.1 prose. The installed SDK requires 4 args (`name, description, schema, handler`) per `sdk.d.ts:5279`; the 3-arg form doesn't compile. All grep acceptance criteria still match because the literal `'compilation'` + `ToolPermissionDenied` + `runCompile` are still present.
- **Raw ZodRawShape via `.shape`** instead of `z.object({...})` for tool input schemas. The SDK's `Schema extends AnyZodRawShape` constraint (per `sdk.d.ts:114`) accepts only raw shapes. Reusing `NewSourceSchema.shape` etc. keeps the wrapper as a thin pass-through.
- **MCP CallToolResult return shape** instead of returning the payload directly. The SDK's `tool()` requires `Promise<CallToolResult>`; we return `{ content: [{ type: 'text', text: JSON.stringify(payload) }] }`. Tests parse the JSON to assert against the inner payload.
- **Vitest `pool: 'vmThreads'`** as the default. Rule 3 — without it, ALL tests fail with `TypeError: Cannot read properties of undefined (reading 'config')` (a runner-init bug in vitest@4.1.5's default `forks` pool on Windows). vmThreads works for unit + agents; integration tests using `process.chdir()` now fail (pipeline.test.ts, hash-stability.test.ts, reingest-skip.test.ts, search-hybrid.spec.ts) — all logged in deferred-items.md.
- **DID NOT** add the Layer-1 schema guard at `repo.writeClaim` — that's plan 02-05's scope. This plan ships the regex + fixture that 02-05 will consume.
- **DID NOT** re-canonicalize tags in `onebrain_write_claim` — `repo.writeClaim` already does it (`src/onebrain/repo.ts:99-100`). Re-canonicalizing would be a no-op (idempotent fn) but adds drift risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted `tool()` invocations to 4-arg form**

- **Found during:** Task 2 (writing src/agents/tools/vault.ts)
- **Issue:** Plan PATTERNS lines 311-318 and RESEARCH §3.1 line 110 show the 3-arg form `tool('name', z.object({}), handler)`. The installed `@anthropic-ai/claude-agent-sdk@0.2.119` (per `sdk.d.ts:5279`) requires the 4-arg form `tool(name, description, inputSchema, handler)`. The 3-arg form does not compile (`Expected 4-5 arguments, but got 3`).
- **Fix:** Used the 4-arg form throughout vault.ts, onebrain.ts, tavily.ts. Each tool gets a substantive description (used by the SDK's tool-discovery surface in chat).
- **Files modified:** src/agents/tools/vault.ts, onebrain.ts, tavily.ts
- **Verification:** `npm run build` exits 0; all 4 Wave 0 probes green; grep checks for `ToolPermissionDenied`, `agentId.*compilation`, `runCompile` all match.
- **Committed in:** 391a045, b417804, 4698f7f

**2. [Rule 3 - Blocking] Used raw ZodRawShape via `.shape`, not z.object({...})**

- **Found during:** Task 3 (writing onebrain.ts wrapper for NewClaimSchema)
- **Issue:** Plan PATTERNS examples use `z.object({...})` as the second arg to `tool()`. The SDK's `Schema extends AnyZodRawShape` constraint (sdk.d.ts:114) accepts only raw shape literals (`{ key: z.string(), ... }`). Passing `z.object({...})` doesn't satisfy the type.
- **Fix:** Pass `NewSourceSchema.shape` / `NewClaimSchema.shape` / `NewEdgeSchema.shape` (which are the underlying raw shapes), and pass raw literal shapes for tools whose input doesn't reuse a Phase 1 schema (vault_read, onebrain_search).
- **Files modified:** src/agents/tools/onebrain.ts (3 sites), src/agents/tools/vault.ts (2 sites), src/agents/tools/tavily.ts (3 sites)
- **Verification:** `npm run build` exits 0.
- **Committed in:** 391a045, b417804, 4698f7f

**3. [Rule 3 - Blocking] Adjusted handler return shape to MCP CallToolResult**

- **Found during:** Task 2 (vault_write_atomic handler)
- **Issue:** Plan example handlers `return await runCompile(...)` directly. The SDK's `tool()` typesig requires `Promise<CallToolResult>` (the MCP standard return). Returning the raw payload doesn't compile.
- **Fix:** Wrap each handler's return as `{ content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }`. Tests `JSON.parse(result.content[0].text)` to assert against payload fields.
- **Files modified:** src/agents/tools/vault.ts, onebrain.ts, tavily.ts (all handlers); tests/agents/vault-writer-gate.spec.ts, source-first-ordering.spec.ts, tavily.spec.ts (test assertions)
- **Verification:** All 4 Wave 0 probes (11/11 cases) green.
- **Committed in:** 391a045, b417804, 4698f7f, d78f545

**4. [Rule 3 - Blocking] Adjusted runCompile mock to camelCase return shape**

- **Found during:** Task 2 (writing the runCompile vi.mock in vault-writer-gate.spec.ts)
- **Issue:** Plan example mock returned `{ run_id: 'test-run', pages_written: 0, pages_skipped: 0 }` (snake_case). Phase 1's actual `runCompile()` (src/compilation/runner.ts:36-43) returns `RunCompileResult` with camelCase fields: `{ runId, pagesPlanned, pagesWritten, pagesSkipped, topicPages }`.
- **Fix:** Updated the mock to return the actual camelCase shape. Test assertions parse the JSON-stringified result to check `runId === 'test-run'`.
- **Files modified:** tests/agents/vault-writer-gate.spec.ts
- **Verification:** All 4 vault-writer-gate cases green.
- **Committed in:** 391a045

**5. [Rule 3 - Blocking] vitest pool default switched to 'vmThreads'**

- **Found during:** Task 1 (running `npm test` to verify quant-pattern.test.ts)
- **Issue:** vitest@4.1.5's default pool (`forks` on Windows) fails 26/26 test files at the first `describe()` call with `TypeError: Cannot read properties of undefined (reading 'config')` (the runner global is never initialized in worker context). `--pool=threads` has the same failure. Reproduced cold BEFORE any 02-03 file was created — confirmed pre-existing (02-02-SUMMARY recorded "161 passing, 1 skipped" at 02-02 close, so this regressed in the environment between then and now).
- **Fix:** Set `test.pool: 'vmThreads'` at the root of vitest.config.ts. Verified working: 8/8 unit tests green for new quant-pattern.test.ts; 6/6 green for tests/integration/append-only.test.ts (when run standalone); 11/11 green for the four agents-project probes.
- **Side effect (logged separately):** vmThreads disallows `process.chdir()` and the integration suite's pool-singleton `pool.end()` cascades — pipeline.test.ts, hash-stability.test.ts, reingest-skip.test.ts, search-hybrid.spec.ts (all chdir-based), and append-only.test.ts (when run after search-hybrid in the same project) regress under vmThreads. These are pre-existing patterns from plans 01-06 + 02-02 that 02-03 surfaces but did NOT introduce. Documented at `.planning/phases/02-agents-and-chat/deferred-items.md`.
- **Files modified:** vitest.config.ts, .planning/phases/02-agents-and-chat/deferred-items.md
- **Verification:** unit project 17/17 files 123/123 cases green; agents project 4/4 files 11/11 cases green.
- **Committed in:** ab7b5b5

**6. [Rule 1 - Bug] Adjusted source-first-ordering test fixture to use real NewSourceSchema enum values**

- **Found during:** Task 5 (writing source-first-ordering.spec.ts)
- **Issue:** Plan example used `kind: 'web'` and `kind: 'evidence'` for the source/claim writes, but `NewSourceSchema.kind` enum (per src/onebrain/types.ts:39-48) accepts `web_article|paper|transcript|pdf|user_note|chat_excerpt|web_search_result`, and `NewClaimSchema.kind` (types.ts:17-26) accepts `fact|inference|hypothesis|counter|finance.calc|finance.assumption|decision|question`. The plan example values would have failed Zod validation before reaching the wrapper's D-05 check.
- **Fix:** Used `kind: 'web_article'` for the source and `kind: 'fact'` / `kind: 'hypothesis'` for the claims. Used a non-quantitative claim text so the (future) Layer-1 schema guard in 02-05 won't intercept these test cases before the Layer-2 D-05 check fires.
- **Files modified:** tests/agents/source-first-ordering.spec.ts
- **Verification:** Both cases green; forward-ref → SourceRowNotFoundError; real-source → claim.id ULID + counters returned.
- **Committed in:** d78f545

**7. [Rule 1 - Bug] Inspect `createVaultMcpServer` via .name fields, not JSON.stringify**

- **Found during:** Task 5 (writing tool-permission.spec.ts case 4)
- **Issue:** Plan example used `JSON.stringify(server)` to look for the literal `vault_write_atomic` in the server config. The SDK's `McpSdkServerConfigWithInstance` (sdk.d.ts:942-944) carries a live McpServer instance with circular references (`'NJ' → root closes the circle`), so JSON.stringify throws `Converting circular structure to JSON`.
- **Fix:** Asserted directly against the visible config surface: `server.name === 'vault'`, `server.type === 'sdk'`, `server.instance` defined; AND against the source tool definitions' `.name` fields (`vault_write_atomic.name === 'vault_write_atomic'`, `vault_read.name === 'vault_read'`).
- **Files modified:** tests/agents/tool-permission.spec.ts
- **Verification:** All 4 cases green.
- **Committed in:** d78f545

---

**Total deviations:** 7 auto-fixed (5 Rule 3 blocking — required by SDK type signatures and vitest infrastructure; 2 Rule 1 bug — schema enum mismatches and circular-ref serialization).
**Impact on plan:** All deviations were strictly necessary for type-correctness or test execution. No new features; no scope creep. The plan's `<read_first>` blocks anticipated some of these (the SDK ctx-shape note, the createRequire fallback, the SDK API churn warning).

## Issues Encountered

### Pre-existing test infrastructure regressions surfaced by the vitest pool change

When the global pool was switched to `vmThreads` (the only pool that lets vitest's runner initialize at all in this environment), the following Phase 1 / 02-02 test patterns started failing — none introduced by 02-03:

- **`process.chdir()` not supported in vmThreads workers:** breaks tests/integration/pipeline.test.ts (9 cases), tests/integration/hash-stability.test.ts (4 cases), tests/integration/reingest-skip.test.ts, tests/onebrain/search-hybrid.spec.ts (4 cases). All four files use the tmpRoot-as-cwd pattern from plan 01-06.
- **Pool-end-then-reuse cascade:** tests/onebrain/search-hybrid.spec.ts (02-02) closes the shared pg.Pool singleton in afterAll, breaking subsequent integration tests in the same project run (append-only.test.ts and any other resetSchemaAndMigrate consumer).

Both are documented at `.planning/phases/02-agents-and-chat/deferred-items.md` with fix candidates. Owner is the next maintenance window or `/gsd-verify-work 02`.

### Cross-project test runs hit a vitest@4.1.5 bug

`npm test -- tests/agents/ tests/unit/quant-pattern.test.ts` (mixing two projects in one command) errors with `Projects "agents" and "unit" have different 'maxWorkers' but same 'sequence.groupOrder'`. Workaround: run projects separately (`--project unit` and `--project agents`). Both pass cleanly.

## User Setup Required

None — no new external services. The existing `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` (added in 02-01) are sufficient for the live `npm run test:tavily` gated probe.

## Next Phase Readiness

**Ready for 02-04 (sub-agent definitions):**

- All three MCP server factories (`createOnebrainMcpServer`, `createTavilyMcpServer`, `createVaultMcpServer`) are exported and verified.
- Tool IDs are stable (listed under "Resolved SDK Surface" above) — 02-04's `tools[]` allowlists can reference them by name without re-discovery.
- **BLOCKING ARCHITECTURAL DECISION:** 02-04 must resolve how production runtime gets `agentId` into the tool's `extra` parameter — the MCP standard `RequestHandlerExtra` doesn't carry it. Three options listed above; the `<output>` block of the plan explicitly asked this be flagged. The Layer-2 guard as written would reject all production invocations otherwise.

**Ready for 02-05 (coordinator + repo Layer-1 quant-guard):**

- `import { matchesQuantitativePattern, QUANT_PATTERN } from '@/onebrain/quant-pattern.js'` works.
- `import { QUANTITATIVE_CLAIM_CASES } from '../fixtures/quantitative-claims.js'` works for the 5-case schema-layer probe.
- `resetTurnCounter()` is exported from `@/agents/tools/onebrain` for the coordinator to call at turn-start.

**Blockers for next plan:**

1. **02-04 architectural decision** on `agentId` injection (one of: hook-based assertion, schema-injection, transport shim).
2. **Vitest pool issue** ideally fixed before 02-04 lands more tests — current `vmThreads` workaround is good enough for the new agents project, but the integration project will keep accumulating chdir-related regressions until pipeline.test.ts is refactored.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The two declared threats (T-02-01 and T-02-03) both have explicit Layer-2 mitigations shipped in this plan; T-02-TOOL-01 (tavily key) is `accept`'d (env loader + pino redact already cover it); T-02-TOOL-02 (vault_read traversal) is `mitigate`'d by the `safe.startsWith(root + path.sep)` guard in vault.ts.

## Self-Check: PASSED

Files created (all present):
- `src/onebrain/quant-pattern.ts` — FOUND
- `src/agents/tools/vault.ts` — FOUND
- `src/agents/tools/onebrain.ts` — FOUND
- `src/agents/tools/tavily.ts` — FOUND
- `tests/fixtures/quantitative-claims.ts` — FOUND
- `tests/unit/quant-pattern.test.ts` — FOUND
- `tests/agents/vault-writer-gate.spec.ts` — FOUND
- `tests/agents/source-first-ordering.spec.ts` — FOUND
- `tests/agents/tool-permission.spec.ts` — FOUND
- `tests/agents/tavily.spec.ts` — FOUND

Files modified (verified):
- `package.json` — +3 scripts (verified)
- `vitest.config.ts` — pool: 'vmThreads' added (verified)
- `.planning/phases/02-agents-and-chat/deferred-items.md` — 3 new entries (verified)

Commits exist:
- `ab7b5b5` — feat(02-03): add QUANT_PATTERN pure utility + 5-case fixture
- `391a045` — feat(02-03): add vault MCP tools + Layer-2 runtime guard
- `b417804` — feat(02-03): add onebrain MCP tools — D-05 source-first wrapper + D-01 counters
- `4698f7f` — feat(02-03): add Tavily MCP tools (RES-01) + gated probe + test scripts
- `d78f545` — test(02-03): Wave 0 probes — tool-permission + source-first-ordering

Test results:
- `npm test -- --project unit` → 17/17 files, 123/123 cases green
- `npm test -- --project agents` → 4/4 files, 11/11 cases green (vault-writer-gate 4, source-first-ordering 2, tool-permission 4, tavily 1)
- `npm run build` → exits 0 (clean tsc --noEmit on all new src/ files)

Wave 0 probes:
- COMP-10 module-level static membership (`tests/agents/tool-permission.spec.ts`) — 4/4 ✓
- COMP-10 Layer-2 runtime guard (`tests/agents/vault-writer-gate.spec.ts`) — 4/4 ✓
- D-05 source-first ordering (`tests/agents/source-first-ordering.spec.ts`) — 2/2 ✓
- RES-01 Tavily wrapper (`tests/agents/tavily.spec.ts`) — 1/1 (mocked default) ✓

---
*Phase: 02-agents-and-chat*
*Plan: 03*
*Completed: 2026-04-27*
