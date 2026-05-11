---
phase: 02-agents-and-chat
plan: 05
subsystem: agents
tags: [claude-agent-sdk, coordinator, agent-08, agent-01, crit-01, d-06, d-07, d-09, d-10, layer-1-guard, prose-smuggling, settingSources-deviation, hook-registration, t-02-02, t-02-aagent-01, t-02-03]

# Dependency graph
requires:
  - phase: 02-agents-and-chat
    provides: "02-03 — quant-pattern.ts (matchesQuantitativePattern + QUANT_PATTERN), QUANTITATIVE_CLAIM_CASES fixture, three MCP server factories (createOnebrainMcpServer/createTavilyMcpServer/createVaultMcpServer), resetTurnCounter, SourceRowNotFoundError; 02-04 — researchDef + compilationDef, vaultAuditHook + VAULT_WRITE_TOOL_ID + COMPILATION_AGENT_ID, coordinator-config.spec.ts (9 cases — extended here), Layer-2 hook registration shape"
provides:
  - "src/onebrain/repo.ts MODIFIED — adds QuantitativeClaimRequiresSourceError + writeClaim() Layer 1 schema-coercive precondition (AGENT-08 fail-closed regardless of caller)"
  - "src/agents/coordinator.ts — runCoordinatorTurn(userMessage): AsyncIterable factory; coordinatorAllowedTools array; loads coordinator-identity.md as systemPrompt; wires three MCP servers + research + compilation sub-agents + vaultAuditHook PreToolUse hook"
  - "src/agents/coordinator-output-guard.ts — applyOutputGuard runtime guard (D-06 belt-and-braces): rewrites coordinator reply to citation-only fallback when ≥12-token contiguous overlap with sub-agent summary; logs guardrail.prose_smuggling=true via pino"
  - "src/lib/ngram-overlap.ts — pure n-gram overlap helper (PRIMARY location); runtime + tests both import from here (no tests/-to-src/ cross)"
  - "src/agents/coordinator-identity.md — coordinator-specific runtime system prompt (155 lines, eight ## sections); DEVIATION from AI-SPEC §3 (split out of CLAUDE.md to keep CLAUDE.md project-scoped)"
  - "tests/agents/quantitative-claim-guard.spec.ts — Wave 0 probe AGENT-08 (5 cases: 4 Layer-1 schema + 1 Layer-2 protocol)"
  - "tests/agents/prose-smuggling.spec.ts — Wave 0 probe AI-SPEC §5 dim #3 (8 cases: 4 ngramOverlap + 4 applyOutputGuard)"
  - "tests/agents/pushback-substance.spec.ts — Wave 0 probe CRIT-01 pre-gate (gated by RUN_AGENT_TESTS=1; default placeholder for vitest visibility)"
  - "tests/agents/coordinator-config.spec.ts EXTENDED — +7 cases (16 total: 9 from 02-04 + 4 allowedTools + 1 identity-source + 2 hook-registration)"
affects:
  - 02-06 (SSE bridge + chat route): consumes runCoordinatorTurn(userMessage) as AsyncIterable; the agents map + hooks registration shape established here is what streamSSE wraps; the applyOutputGuard runs BEFORE flushing the final assembled coordinator message
  - 02-07 (UI surface): src/agents/coordinator.ts and src/agents/coordinator-identity.md and src/agents/coordinator-output-guard.ts ALL use SERVER-ONLY patterns (node:fs, pino logger, SDK runtime); MUST be added to the Vite alias fail-fast rule's grep target alongside src/agents/definitions/* and src/agents/hooks/*
  - 02-08 (recompile route): inherits the same coordinator query() configuration shape; the recompile route invokes the compilation sub-agent through the coordinator, so the vaultAuditHook fires there too — already wired
  - 02-09 verifier (`/gsd-verify-work 02`): the pushback-substance.spec.ts pre-gate ships here; the full LLM-judge runs against the 13 gate-relevant scenarios in `.planning/eval/phase2-reference-dataset.json`; this plan's pre-gate is the heuristic fallback for CI gating

# Tech tracking
tech-stack:
  added:
    - "Claude Agent SDK systemPrompt option — `systemPrompt: string | string[] | { type: 'preset', preset: 'claude_code', append?: string }` per @anthropic-ai/claude-agent-sdk@0.2.119 sdk.d.ts:1695-1700; chosen the plain-string form because we load the entire identity file inline"
    - "n-gram overlap detection (12-token contiguous, lowercase + Unicode-punctuation tokenization) — D-06 runtime defense"
  patterns:
    - "Layer 1 (schema-coercive) at repo boundary: writeClaim() throws QuantitativeClaimRequiresSourceError BEFORE embed/insert when QUANT_PATTERN matches AND cites_source_ids is empty/absent. Combined with Layer 2 (02-03's onebrain wrapper SourceRowNotFoundError on forward-references) gives the unbypassable AGENT-08 guarantee — every caller (CLI, agent, future ingest) hits the same guard"
    - "settingSources-as-enum vs settingSources-as-paths: the installed SDK declares `SettingSource = 'user' | 'project' | 'local'` (sdk.d.ts:5043), NOT a file-path array. The AI-SPEC §3 file-path-array pattern does not work on this SDK version. Workaround: load identity files inline as `systemPrompt` text via readFileSync at module init (mirrors src/agents/definitions/*.ts pattern)"
    - "Coordinator source kept GREP-CLEAN of forbidden tool-ID namespaces — comments use 'vault-namespace' / 'tavily-namespace' instead of literal `mcp__vault__*` / `mcp__tavily__*` strings, so grep -q for the namespace literals returns no match outside coordinatorAllowedTools (grep-asserted invariant)"
    - "Output-guard pure-function isolation: ngramOverlap lives at src/lib/ngram-overlap.ts (NOT tests/lib/) so the runtime guard can import it without crossing the production-code/tests boundary; the test imports from the same canonical @/lib/ngram-overlap.js path"
    - "Coordinator-identity prose external to CLAUDE.md: src/agents/coordinator-identity.md is loaded as systemPrompt at module init; CLAUDE.md retains its project-level mandate (47 lines of seven hard architectural commitments + GSD conventions). DEVIATION from AI-SPEC §3 — see Deviations section. Keeps CLAUDE.md byte-identical to its pre-plan state"

key-files:
  created:
    - "src/agents/coordinator.ts (runCoordinatorTurn AsyncIterable + coordinatorAllowedTools; SERVER-ONLY header; loads coordinator-identity.md as systemPrompt; registers vaultAuditHook PreToolUse)"
    - "src/agents/coordinator-output-guard.ts (applyOutputGuard runtime n-gram overlap guard; D-06 belt-and-braces)"
    - "src/lib/ngram-overlap.ts (pure n-gram overlap helper, PRIMARY location)"
    - "src/agents/coordinator-identity.md (155 lines; coordinator runtime system prompt; eight sections incl. Pushback Template, Hypothesis Framing, Never-Quote-Sub-Agent, Recompile Suggestion, Tool Trace Discipline)"
    - "tests/agents/quantitative-claim-guard.spec.ts (5 cases — AGENT-08 schema + protocol layers)"
    - "tests/agents/prose-smuggling.spec.ts (8 cases — ngramOverlap + applyOutputGuard)"
    - "tests/agents/pushback-substance.spec.ts (gated probe — RUN_AGENT_TESTS=1)"
  modified:
    - "src/onebrain/repo.ts (+QuantitativeClaimRequiresSourceError class export, +matchesQuantitativePattern import, +Layer 1 precondition in writeClaim before embed; +29 lines)"
    - "tests/agents/coordinator-config.spec.ts (+7 cases appended in [APPENDED IN PLAN 02-05] section: 4 allowedTools + 1 identity-source + 2 hook-registration; total 16/16 green)"

key-decisions:
  - "DEVIATION — coordinator identity prose lives at src/agents/coordinator-identity.md, NOT appended to CLAUDE.md. AI-SPEC §3 documented `settingSources: ['./CLAUDE.md']` to load identity from CLAUDE.md, but the installed SDK's SettingSource type is the enum `'user' | 'project' | 'local'`, NOT a file-path array (sdk.d.ts:5043). Combined with the prompt-budget concern (CLAUDE.md is read by every Claude Code session in this repo, not just the coordinator runtime), splitting the prose into src/agents/coordinator-identity.md keeps CLAUDE.md scoped to project-level guardrails. Coordinator loads coordinator-identity.md inline as `systemPrompt` text via readFileSync at module init."
  - "Coordinator source is GREP-CLEAN of `mcp__vault__*` and `mcp__tavily__*` namespace literals — comments use 'vault-namespace' / 'tavily-namespace' instead. The literal tool-ID strings appear ONLY inside coordinatorAllowedTools array entries (the four mcp__onebrain__* tools). This means a future plan that accidentally adds a vault tool to the coordinator's allowedTools introduces a new grep match in coordinator.ts and is structurally visible."
  - "ngramOverlap canonical location is src/lib/ngram-overlap.ts (NOT tests/lib/). Both the runtime guard (src/agents/coordinator-output-guard.ts) and the test (tests/agents/prose-smuggling.spec.ts) import from `@/lib/ngram-overlap.js` — no cross-tree import (production code never imports from tests/). PATTERNS originally documented `tests/lib/`; this plan canonicalizes to `src/lib/` per the runtime-imports-tests anti-pattern fix in the plan's Task 3 description."
  - "Coordinator allowedTools is exported as `as const` array (NOT a Set) so the test can assert `.toContain` and `.startsWith` directly. The four onebrain tool IDs are explicit literals — adding/removing one is a one-line surface change and visible in code review."
  - "vaultAuditHook PreToolUse registration shape: `hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] }` — the doubly-nested `hooks` key is the SDK's HookCallbackMatcher pattern (sdk.d.ts:1272-1279). Asserted in coordinator-config.spec.ts via source-tree grep AND function-shape check (vaultAuditHook.length === 3 confirms HookCallback signature)."
  - "AGENT-08 Layer 1 fires BEFORE embed (which is a slow network call). Order matters: NewClaimSchema.parse → matchesQuantitativePattern check → throw if violation → embed → transaction. Catching the violation before embed avoids wasted Voyage credits and keeps the failure trace concise."
  - "Gated test pattern for pushback-substance: explicit if/else on RUN_AGENT_TESTS instead of vitest's `.skipIf` — keeps both branches visible in vitest output regardless of env state and avoids the SDK-runtime import unless live mode is active. The placeholder it() case in default mode keeps the file in the agents project's count without forcing a real Opus call."

patterns-established:
  - "Schema-layer Coercive Boundary template: `<NewSchema>.parse(input)` → input-shape check (custom predicate like matchesQuantitativePattern) → throw NamedError if violation → existing logic unchanged. The error class is exported from the same module for tests + downstream consumers."
  - "Coordinator factory module template: SERVER-ONLY header → import from node:* + SDK + own modules → readFileSync identity file at module init → export allowedTools as `as const` array → export `async function*` runCoordinatorTurn that resets per-turn state, constructs MCP servers, calls query() with hooks/agents/allowedTools/systemPrompt, and for-await yields events"
  - "Runtime output-guard template: pure helper at src/lib/ → runtime guard at src/agents/<feature>-output-guard.ts → import helper from src/lib/ → log violation via pino with structured guardrail tag → return either pass-through or rewritten reply with cited fallback"
  - "Pushback Template literal embedded in coordinator-identity.md verbatim (D-07 / CRIT-01 grading rubric depends on the three-token-set heuristic matching the prose). The pre-gate test (pushback-substance.spec.ts) checks all three sets against a real Opus reply when RUN_AGENT_TESTS=1; full LLM-judge ships in 02-09."

requirements-completed:
  - AGENT-01
  - AGENT-08
  - CRIT-01

# Metrics
duration: ~11.5min
completed: 2026-04-27
---

# Phase 02 Plan 05: Coordinator + AGENT-08 Layer 1 + Prose-Smuggling Guard Summary

**Coordinator orchestration layer + two coercive boundaries (repo Layer-1 quantitative-claim guard + runtime n-gram-overlap output guard) + extracted coordinator-identity.md + four green Wave 0 probes — completes Phase 2's defensibility-by-construction story for AGENT-01, AGENT-08, and CRIT-01.**

## Performance

- **Duration:** ~11.5 min
- **Started:** 2026-04-27T04:15:15Z
- **Completed:** 2026-04-27T04:26:42Z
- **Tasks:** 6
- **Files created:** 7
- **Files modified:** 2
- **Commits:** 6 (one per task) + this metadata commit

## Accomplishments

- **AGENT-08 Layer 1 schema-coercive guard SHIPPED:** `repo.writeClaim()` throws `QuantitativeClaimRequiresSourceError` BEFORE embed/insert when `matchesQuantitativePattern(text)` is true AND `cites_source_ids` is empty/absent. Combined with 02-03's Layer 2 (protocol-layer wrapper SourceRowNotFoundError on forward-references), the AGENT-08 guarantee is unbypassable: every caller hits the same guard regardless of code path. 5/5 Wave 0 probe cases green (4 Layer-1 schema + 1 Layer-2 protocol).
- **Coordinator factory + 16/16 cases green:** `runCoordinatorTurn(userMessage)` AsyncIterable factory wires three MCP servers (onebrain, tavily, vault), both sub-agent definitions (research + compilation) as the agents map, and the vaultAuditHook as a PreToolUse hook — completes the critical handoff from 02-04 (Layer-2 vault audit live in production wiring). `coordinatorAllowedTools` is exported as a typed array; structurally excludes vault and tavily namespaces (T-02-02 + RES-01 mitigations). coordinator-config.spec.ts extended from 9 → 16 cases.
- **D-06 runtime prose-smuggling guard SHIPPED:** `applyOutputGuard(reply, summary, claimIds)` rewrites the coordinator reply to a citation-only fallback when 12+ contiguous tokens overlap with the most recent sub-agent summary, logging `guardrail.prose_smuggling=true` via pino. The pure n-gram helper lives at `src/lib/ngram-overlap.ts` (PRIMARY location, NOT tests/lib/) so runtime + tests share the same import path. 8/8 Wave 0 probe cases green.
- **CRIT-01 pre-gate IN PLACE (gated):** `tests/agents/pushback-substance.spec.ts` placeholder ships in default mode; live three-token-set assertion (rule-named + action-named + path-forward-named) runs against a real Opus call when `RUN_AGENT_TESTS=1`. Full LLM-judge ships in Phase 4 (02-09 reference-dataset hand-grading).
- **coordinator-identity.md AUTHORED (155 lines):** runtime system prompt for the coordinator. Eight ## sections covering Coordinator Role, Write Protocol, Sub-Agent Usage Rules, Sub-Agent Invocation Narration (D-08), Pushback Substance Template (D-07/CRIT-01) with VERBATIM template, Hypothesis Framing (D-09) with `[[claim:<8-char>…]]` inline citation form, Never-Quote-Sub-Agent (D-06), Recompile Suggestion (D-10), Tool Trace Discipline, and Operating Posture Recap. Contains all rule-named tokens (TAM, hypothesis, source) for CRIT-01 grading.
- **CLAUDE.md UNCHANGED:** byte-identical to its pre-plan state (47 lines, no modifications). The coordinator-identity prose lives in src/agents/ per the AI-SPEC §3 deviation; CLAUDE.md retains its scope as project-level guardrails (the seven hard architectural commitments + GSD conventions).
- **No regressions:** unit project 17/17 files / 123/123 cases green (same as 02-04 baseline). Agents project 12/12 files / 50/50 cases green (+21 cases from 02-04's 29: +5 quantitative-claim-guard, +8 prose-smuggling, +1 pushback-substance placeholder, +7 coordinator-config extensions).

## Resolved SDK Surface (downstream-plan reference for 02-06+)

Recorded so 02-06..02-08 know the exact API surface the coordinator was built against.

### `systemPrompt` field (NOT `system`, NOT `settingSources`-with-paths)

The installed `@anthropic-ai/claude-agent-sdk@0.2.119` exposes `systemPrompt?: string | string[] | { type: 'preset'; preset: 'claude_code'; append?: string; excludeDynamicSections?: boolean }` per `sdk.d.ts:1695-1700`. We pass the plain-string form because we load the entire identity file inline. The `system` field name from earlier SDK examples does NOT work on this version (no such property on Options type).

### `settingSources` is enum-only — does NOT accept file paths

`SettingSource = 'user' | 'project' | 'local'` per `sdk.d.ts:5043`. The `settingSources: ['./CLAUDE.md', './src/agents/coordinator-identity.md']` pattern from AI-SPEC §3 fails typecheck on this SDK. The plan's deviation note anticipated this; we took the inline-systemPrompt fallback path.

### `agents` map field name (NOT `subAgents`, NOT `subagents`)

`agents?: Record<string, AgentDefinition>` per `sdk.d.ts:1163`. The map is consumed inline by `query({ agents: { research: researchDef, compilation: compilationDef } })`. The exported `AgentDefinition` type at `sdk.d.ts:38-83` does NOT declare an `outputSchema` field — the Phase 2 sub-agent definitions ship `outputSchema` as an extra `as const` property that the SDK ignores at runtime; we cast through `unknown as never` to keep tsc green. The 02-04 schema-malformed-output probe asserts the schema independently of SDK retry behavior.

### `hooks` PreToolUse registration shape

`hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>` per `sdk.d.ts:1279`. The doubly-nested form is `hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] }`. The outer array is the matcher list; each matcher object has its own `hooks` array of HookCallback functions. Confirmed by tests/agents/coordinator-config.spec.ts source-tree grep + the agents project 50/50 green run (vault-writer-gate.spec.ts hook tests pass under this registration).

### `mcpServers` is a Record<string, McpServerConfig>

Per `sdk.d.ts:1416`. Coordinator passes `{ onebrain, tavily, vault }` — three named MCP servers. The 02-03 server factories return SDK-compatible config objects directly; no wrapping needed.

### `model: 'claude-opus-4-7'` accepted

The Options type accepts `model?: string` (free-form alias or full model ID). Coordinator uses `'claude-opus-4-7'` per the project's quality-profile model selection.

## Settingsource Path Taken (DEVIATION outcome)

**Inline `systemPrompt` was the path taken**, NOT multi-file `settingSources`. The plan's draft included the multi-file `settingSources: ['./CLAUDE.md', './src/agents/coordinator-identity.md']` as the preferred path with inline-systemPrompt as fallback; on inspection of `sdk.d.ts:5043` the multi-file path is structurally impossible on this SDK version (SettingSource is enum, not array of file paths). The deviation outcome is therefore: coordinator-identity.md is loaded inline via `readFileSync(resolve(__dirname, './coordinator-identity.md'), 'utf-8')` at module init, then passed to `query()` as `systemPrompt: coordinatorIdentity`. CLAUDE.md is NOT referenced by the coordinator at runtime — the coordinator's effective system prompt is the contents of coordinator-identity.md only.

## ngramOverlap Canonical Location

**`src/lib/ngram-overlap.ts` is the ONLY location**. No `tests/lib/ngram-overlap.ts` exists. Both the runtime guard (`src/agents/coordinator-output-guard.ts`) and the test (`tests/agents/prose-smuggling.spec.ts`) import from `@/lib/ngram-overlap.js`. PATTERNS originally documented the helper under `tests/lib/`; this plan canonicalizes to `src/lib/` to avoid the runtime-imports-tests anti-pattern.

## CLAUDE.md Line Count Before/After

- **Before this plan:** 47 lines (47 lines of project-level guardrails, GSD conventions, reference inputs)
- **After this plan:** 47 lines (UNCHANGED — git status shows no diff, no commit)
- **Bloat avoided:** ≥150 lines that would have been appended per AI-SPEC §3 are now in `src/agents/coordinator-identity.md` (155 lines) instead.

## describe.skipIf Availability

Not used. The pushback-substance.spec.ts file uses an explicit `if (RUN_LIVE) { describe(...) } else { describe(... placeholder ...) }` pattern instead. Reasoning: the explicit branch keeps both states visible in vitest output without depending on vitest 4's `.skipIf` API (which exists but adds API surface for no benefit here), and avoids importing `runCoordinatorTurn` at module-load time when live mode is off (the import would force the SDK + MCP server modules to initialize, which is unnecessary in default mode).

## Wave 0 Probe Status

| Probe | Cases | Status | Notes |
|-------|-------|--------|-------|
| `quantitative-claim-guard.spec.ts` | 5 | green | 4 Layer-1 schema + 1 Layer-2 protocol; positive-control case writes a real source first to satisfy FK |
| `coordinator-config.spec.ts` | 16 | green | 9 from 02-04 + 4 allowedTools + 1 identity-source + 2 hook-registration |
| `prose-smuggling.spec.ts` | 8 | green | 4 ngramOverlap pure + 4 applyOutputGuard runtime |
| `pushback-substance.spec.ts` | 1 (default) / 1 (live, gated) | green | Default placeholder; live three-token-set assertion runs at `RUN_AGENT_TESTS=1` |

## Task Commits

Each task committed atomically on `main`:

1. **Task 1: AGENT-08 Layer 1 schema-coercive guard at repo.writeClaim** — `d11e28f` (feat)
2. **Task 2: tests/agents/quantitative-claim-guard.spec.ts (5-case probe)** — `231d4be` (test)
3. **Task 3: src/lib/ngram-overlap.ts + src/agents/coordinator-output-guard.ts** — `fe8b601` (feat)
4. **Task 4: src/agents/coordinator-identity.md (155-line runtime system prompt)** — `53b8d7b` (feat)
5. **Task 5: src/agents/coordinator.ts + extended coordinator-config.spec.ts** — `d5bc83f` (feat)
6. **Task 6: prose-smuggling.spec.ts + pushback-substance.spec.ts** — `47d06f0` (test)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP + REQUIREMENTS_

## Files Created/Modified

**Created (7):**
- `src/onebrain/repo.ts` (modified — see below)
- `src/agents/coordinator.ts` (139 lines; SERVER-ONLY header; loads coordinator-identity.md as systemPrompt; registers vaultAuditHook PreToolUse)
- `src/agents/coordinator-output-guard.ts` (78 lines; applyOutputGuard runtime guard; D-06 belt-and-braces)
- `src/lib/ngram-overlap.ts` (75 lines; pure n-gram overlap helper, PRIMARY location)
- `src/agents/coordinator-identity.md` (155 lines; coordinator runtime system prompt)
- `tests/agents/quantitative-claim-guard.spec.ts` (101 lines; 5 cases — AGENT-08 schema + protocol layers)
- `tests/agents/prose-smuggling.spec.ts` (88 lines; 8 cases — ngramOverlap + applyOutputGuard)
- `tests/agents/pushback-substance.spec.ts` (60 lines; gated probe — RUN_AGENT_TESTS=1)

**Modified (2):**
- `src/onebrain/repo.ts` (+QuantitativeClaimRequiresSourceError class export, +matchesQuantitativePattern import, +Layer 1 precondition in writeClaim before embed; +29 lines)
- `tests/agents/coordinator-config.spec.ts` (+7 cases appended in [APPENDED IN PLAN 02-05] section: 4 allowedTools + 1 identity-source + 2 hook-registration; +93 lines; total 16/16 green)

## Decisions Made

- **DEVIATION — coordinator identity prose lives at src/agents/coordinator-identity.md, NOT in CLAUDE.md.** AI-SPEC §3's `settingSources: ['./CLAUDE.md']` pattern is structurally impossible on the installed SDK (SettingSource is enum-only). Coordinator loads coordinator-identity.md inline as `systemPrompt` via readFileSync at module init. CLAUDE.md is left unchanged.
- **Coordinator source kept GREP-CLEAN of `mcp__vault__*` and `mcp__tavily__*` namespaces.** Comments use 'vault-namespace' / 'tavily-namespace'. The literal tool-ID strings appear ONLY inside coordinatorAllowedTools array entries.
- **ngramOverlap canonical location is src/lib/.** No tests/lib/ duplicate. Runtime + tests share the same `@/lib/ngram-overlap.js` import path.
- **vaultAuditHook PreToolUse wired in production.** Critical handoff from 02-04 complete — Layer-2 vault audit is live, not dead code.
- **AGENT-08 Layer 1 fires BEFORE embed** to avoid wasted Voyage credits + keep failure trace concise.
- **Gated test pattern for pushback-substance uses explicit if/else** instead of `.skipIf` — keeps both branches visible without depending on vitest 4 API surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] settingSources is enum-only — split-file path was structurally impossible**

- **Found during:** Task 5 (writing coordinator.ts)
- **Issue:** Plan's primary path used `settingSources: ['./CLAUDE.md', './src/agents/coordinator-identity.md']`. The installed SDK declares `SettingSource = 'user' | 'project' | 'local'` (sdk.d.ts:5043), NOT a file-path array. tsc would have rejected the array-of-strings shape entirely.
- **Fix:** Took the plan's documented fallback path: load coordinator-identity.md inline as `systemPrompt` text via readFileSync at module init. CLAUDE.md is NOT referenced by the coordinator at runtime. The coordinator's effective system prompt is the contents of coordinator-identity.md only.
- **Files affected:** src/agents/coordinator.ts
- **Verification:** Build clean (tsc --noEmit -p tsconfig.node.json exits 0); 16/16 coordinator-config cases green; agents project 50/50 green.
- **Committed in:** d5bc83f (Task 5)

**2. [Rule 3 - Blocking] Coordinator source initially contained `mcp__vault__*` and `mcp__tavily__*` namespace literals in comments — broke grep-clean invariant**

- **Found during:** Task 5 (verifying acceptance grep `grep -q "mcp__vault__" src/agents/coordinator.ts returns NO match`)
- **Issue:** First draft had explanatory comments like "T-02-02 structural mitigation: NO `mcp__vault__*` tool ID in this list". Grep is namespace-blind — comments are matches just like code. Acceptance criterion would have failed.
- **Fix:** Reworded comments to use 'vault-namespace' / 'tavily-namespace' instead of the literal tool-ID prefixes. The literal strings now appear ONLY inside `coordinatorAllowedTools` array entries (the four mcp__onebrain__* tools).
- **Files affected:** src/agents/coordinator.ts
- **Verification:** `grep -q "mcp__vault__" src/agents/coordinator.ts` returns no match; `grep -q "mcp__tavily__" src/agents/coordinator.ts` returns no match; tests still green.
- **Committed in:** d5bc83f (Task 5, bundled with deviation #1)

**3. [Rule 1 - Bug] AgentDefinition type does not declare outputSchema field — coordinator agents map needed cast**

- **Found during:** Task 5 (typechecking coordinator.ts)
- **Issue:** The installed SDK's `AgentDefinition` type at sdk.d.ts:38-83 has no `outputSchema` field. The Phase 2 sub-agent definitions (researchDef, compilationDef) attach `outputSchema: ResearchOutputSchema` as an extra property `as const`. tsc rejects assigning these into `agents: Record<string, AgentDefinition>` because the inferred type has the extra property.
- **Fix:** Cast through `as unknown as never` for both agents map entries AND the entire options object. The runtime behavior is unchanged because the SDK consumes the agents map structurally (the extra `outputSchema` field is ignored). The 02-04 schema-malformed-output probe already asserts the schema independently.
- **Files affected:** src/agents/coordinator.ts
- **Verification:** Build clean; agents project 50/50 green (research + compilation definitions still consumed correctly).
- **Committed in:** d5bc83f (Task 5)

**4. [Rule 2 - Critical functionality] Added 2 hook-registration sanity tests beyond plan's 14-case target**

- **Found during:** Task 5 (writing coordinator-config.spec.ts extension)
- **Issue:** Plan called for 14 total it() cases (9 from 02-04 + 4 allowedTools + 1 identity-source). The user spawn prompt explicitly required: "Verify the registration is present in the final coordinator implementation AND add a test (or extend coordinator-config.spec.ts) that asserts the hooks array contains vaultAuditHook for the PreToolUse phase." The 14-case target did not include this assertion.
- **Fix:** Added a `describe('Coordinator hook registration ...')` block with 2 cases: (a) source-tree grep that coordinator.ts contains the `hooks: [vaultAuditHook]` registration, (b) function-shape check that vaultAuditHook is callable with the SDK's HookCallback signature (length === 3). Total cases: 16, not 14.
- **Files affected:** tests/agents/coordinator-config.spec.ts
- **Verification:** Both new cases green; total 16/16 in coordinator-config.spec.ts; agents project 50/50 green.
- **Committed in:** d5bc83f (Task 5, bundled with deviations #1-3)

---

**Total deviations:** 4 (3 Rule 3 blocking, 1 Rule 2 critical functionality). All necessary for type-correctness, grep-invariant compliance, or completing the user-mandated handoff verification. No new features; no scope creep.
**Impact on plan:** All deviations strictly necessary. The settingSources deviation was anticipated by the plan's Deviations section; the grep-clean comment cleanup was anticipated by the acceptance criteria; the AgentDefinition cast was anticipated by 02-04-SUMMARY's "Resolved SDK Surface" note; the +2 hook-registration tests honor the user spawn prompt's explicit requirement.

## Issues Encountered

**Pre-existing test infrastructure constraint:** `process.chdir()` not supported under vmThreads. Affects pipeline.test.ts + hash-stability.test.ts + reingest-skip.test.ts + search-hybrid.spec.ts (4 files, all from 01-06 / 02-02). Pre-existing per deferred-items.md; this plan did not surface any new instances or regress those files.

**SDK type for AgentDefinition has no outputSchema:** documented in deviation #3 above and in 02-04-SUMMARY. The cast pattern `as unknown as never` is the durable workaround for this SDK version.

**No new external service dependencies.** ANTHROPIC_API_KEY (02-01) and TAVILY_API_KEY (02-01) remain sufficient. The pushback-substance live mode requires ANTHROPIC_API_KEY to call Opus 4.7.

## User Setup Required

None — no new external services. The coordinator is wired but not yet invoked from the chat surface (02-06 SSE bridge does that). To smoke-test the coordinator manually before 02-06: write a one-off Node script that imports `runCoordinatorTurn` and `for-await`s the events.

## Next Phase Readiness

**Ready for 02-06 (SSE bridge + chat route):**
- `import { runCoordinatorTurn } from '@/agents/coordinator.js'` works.
- `import { applyOutputGuard } from '@/agents/coordinator-output-guard.js'` works — the SSE bridge applies this BEFORE flushing the assembled coordinator message.
- The coordinator's hook + agents + mcpServers wiring is the canonical config that streamSSE wraps.
- `coordinatorAllowedTools` exported for test reuse.

**Ready for 02-07 (UI surface):**
- THREE NEW SERVER-ONLY files added under src/agents/: coordinator.ts, coordinator-output-guard.ts (transitively safe — pure helper but imports pino), coordinator-identity.md (.md not source). 02-07 Task 0's Vite alias fail-fast rule MUST cover src/agents/coordinator.ts AND src/agents/coordinator-output-guard.ts in addition to src/agents/definitions/* and src/agents/hooks/*. The grep target remains the SERVER-ONLY comment header.

**Ready for 02-08 (recompile route):**
- The same coordinator query() shape carries through; the recompile route can either invoke runCoordinatorTurn with a "/recompile" message or directly invoke compilationDef as the main agent. Either path inherits the vaultAuditHook (it fires on every tool call regardless of which agent invokes).

**Ready for 02-09 verifier (`/gsd-verify-work 02`):**
- pushback-substance.spec.ts pre-gate is in place; live mode runs against the 13 gate-relevant scenarios in `.planning/eval/phase2-reference-dataset.json`. The user-labeling debt (12 `labeled_outcome: null` slots) flagged in STATE.md is the verifier's responsibility per the resolved-deferred decision in 02-09.

**Blockers for next plan:** None. Critical handoff from 02-04 (vaultAuditHook registration) is complete and tested.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The three declared threats:
- **T-02-03** (Tampering — repo.writeClaim Layer 1): mitigated by QuantitativeClaimRequiresSourceError thrown before embed/insert; asserted by quantitative-claim-guard.spec.ts cases 1-4.
- **T-02-AGENT-01** (Information Disclosure — sub-agent prose smuggling): mitigated by applyOutputGuard runtime n-gram check; asserted by prose-smuggling.spec.ts cases 5-7. Layer 1 (prompt rule) is the never-quote-sub-agent clause in coordinator-identity.md.
- **T-02-02** (Elevation of Privilege — coordinator vault writes): mitigated by absence of `mcp__vault__*` from `coordinatorAllowedTools`; asserted by coordinator-config.spec.ts allowedTools cases. Plus the vaultAuditHook PreToolUse layer is now wired in production via the coordinator.

No threat flags this plan.

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`); per-task TDD gates do not apply. Task pairs follow tests-after-feature shape (Tasks 1, 3, 4, 5 ship features; Tasks 2 and 6 add probes). Standard for non-TDD execute plans.

## Self-Check: PASSED

Files created (all present):
- `src/agents/coordinator.ts` — FOUND
- `src/agents/coordinator-output-guard.ts` — FOUND
- `src/lib/ngram-overlap.ts` — FOUND
- `src/agents/coordinator-identity.md` — FOUND (155 lines)
- `tests/agents/quantitative-claim-guard.spec.ts` — FOUND
- `tests/agents/prose-smuggling.spec.ts` — FOUND
- `tests/agents/pushback-substance.spec.ts` — FOUND

Files modified (verified):
- `src/onebrain/repo.ts` — verified by grep `export class QuantitativeClaimRequiresSourceError` + grep `matchesQuantitativePattern` + grep `throw new QuantitativeClaimRequiresSourceError`
- `tests/agents/coordinator-config.spec.ts` — verified by grep `coordinatorAllowedTools` + 16/16 cases green
- `CLAUDE.md` — UNCHANGED (47 lines, not committed in this plan)

Commits exist:
- `d11e28f` — feat(02-05): AGENT-08 Layer 1 schema-coercive guard at repo.writeClaim
- `231d4be` — test(02-05): AGENT-08 quantitative-claim-guard 5-case Wave 0 probe
- `fe8b601` — feat(02-05): D-06 prose-smuggling guard — ngramOverlap + applyOutputGuard
- `53b8d7b` — feat(02-05): coordinator-identity.md — runtime system prompt for coordinator
- `d5bc83f` — feat(02-05): coordinator factory + extended coordinator-config probe
- `47d06f0` — test(02-05): prose-smuggling + pushback-substance Wave 0 probes

Wave 0 probes (all green):
- AGENT-08 Layer 1 + Layer 2 (`tests/agents/quantitative-claim-guard.spec.ts`) — 5/5 ✓
- AGENT-01 + COMP-10 + identity-source + hook-registration (`tests/agents/coordinator-config.spec.ts`) — 16/16 ✓
- D-06 prose-smuggling (`tests/agents/prose-smuggling.spec.ts`) — 8/8 ✓
- CRIT-01 pre-gate placeholder (`tests/agents/pushback-substance.spec.ts`) — 1/1 ✓ default mode

Test results:
- `npm test -- --run --project agents` → 12/12 files / 50/50 cases green in 11.55s
- `npm test -- --run --project unit` → 17/17 files / 123/123 cases green in 14.32s
- `npm run build` → exits 0 (clean tsc --noEmit on all new + modified src/ files)

Grep invariants:
- `grep -q "QuantitativeClaimRequiresSourceError" src/onebrain/repo.ts` matches (Layer 1 guard live).
- `grep -q "matchesQuantitativePattern" src/onebrain/repo.ts` matches (import wired).
- `grep -q "mcp__vault__" src/agents/coordinator.ts` returns NO match (T-02-02 grep-clean).
- `grep -q "mcp__tavily__" src/agents/coordinator.ts` returns NO match (RES-01 grep-clean).
- `grep -q "vaultAuditHook" src/agents/coordinator.ts` matches (critical handoff complete).
- `grep -q "PreToolUse" src/agents/coordinator.ts` matches.
- `grep -q "for await" src/agents/coordinator.ts` matches (RESEARCH pitfall #16).
- `grep -q "resetTurnCounter" src/agents/coordinator.ts` matches (D-01 counter reset).
- coordinator-identity.md contains: TAM-shaped, no source attached, claim:, Never-Quote-Sub-Agent, Recompile to refresh, Researching, Coordinator role, Write Protocol, Sub-Agent Usage Rules — all matched.
- `src/lib/ngram-overlap.ts` exists; `tests/lib/ngram-overlap.*` does NOT exist (canonical location enforced).

---
*Phase: 02-agents-and-chat*
*Plan: 05*
*Completed: 2026-04-27*
