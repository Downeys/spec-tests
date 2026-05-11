---
phase: 2
slug: agents-and-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `02-RESEARCH.md` §5 Validation Architecture (17 probes, one per REQ-ID).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 (Phase 1 EVAL-01, already configured) |
| **Config file** | `vitest.config.ts` (existing) — Phase 2 adds projects for `tests/ui/` (jsdom env) and `tests/agents/` (node env, integration) |
| **Quick run command** | `npm test -- --run tests/<modified-area>/` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~60s unit, ~90s integration (`fileParallelism: false` for the integration project per Phase 1 plan 01-06) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/<modified-area>/` (≤30s)
- **After every plan wave:** Run `npm test -- --run` (full unit + integration; ≤90s)
- **Before `/gsd-verify-work`:** Full suite green + gated suites must pass: `RUN_AGENT_TESTS=1 RUN_TAVILY_TESTS=1 RUN_VOYAGE_TESTS=1 npm test`
- **Coordinator pushback rubric:** hand-graded against the 15-example reference dataset before phase gate (mechanized as Promptfoo EVAL-02 in Phase 4)
- **Max feedback latency:** 30s for the per-task subset; 90s for the per-wave full suite

---

## Per-Task Verification Map

> Plans assign tasks to plan files (e.g., `02-01-…`, `02-02-…`); the table below maps requirements → tests. The plan-checker pairs Plan/Wave/Task IDs to these probes during planning.

| Req ID | Behavior | Test Type | Automated Command | File | Wave 0? |
|--------|----------|-----------|-------------------|------|---------|
| INFRA-04 | Hono `/health` returns 200 + JSON; `/chat` SSE stream emits ≥1 chunk for stubbed coordinator | integration | `npm test -- --run tests/server/health.spec.ts tests/server/chat-sse.spec.ts` | `tests/server/health.spec.ts`, `tests/server/chat-sse.spec.ts` | ❌ |
| DATA-09 | Hybrid search returns expected claim ULID in top-5 for known query against fixture; FTS-only and vector-only baselines also recorded | integration | `npm test -- --run tests/onebrain/search-hybrid.spec.ts` | `tests/onebrain/search-hybrid.spec.ts` | ❌ |
| AGENT-01 | Coordinator boot loads `CLAUDE.md`; `vault_write_atomic` not in coordinator's `allowedTools` | unit (static membership) | `npm test -- --run tests/agents/coordinator-config.spec.ts` | `tests/agents/coordinator-config.spec.ts` | ❌ |
| AGENT-02 | Research sub-agent stub returns valid `ResearchOutputSchema`; SDK retries once on first malformed output, surfaces structured error on second | integration | `npm test -- --run tests/agents/schema-malformed-output.spec.ts` | `tests/agents/schema-malformed-output.spec.ts` | ❌ |
| AGENT-06 | Compilation sub-agent invokes `runCompile()` and writes vault file; `compile_runs.error IS NULL`; rendered frontmatter contains expected `claim_ids[]` | integration | `npm test -- --run tests/agents/recompile-roundtrip.spec.ts` | `tests/agents/recompile-roundtrip.spec.ts` | ❌ |
| AGENT-07 | No agent-to-agent in-context message passing; sub-agents only communicate via OneBrain rows | unit (grep + assertion) | `npm test -- --run tests/agents/no-peer-messaging.spec.ts` | `tests/agents/no-peer-messaging.spec.ts` | ❌ |
| AGENT-08 | Quantitative claim without source rejected; with source accepted; sub-million unsourced accepted; source-after-claim same-turn rejected | unit + integration | `npm test -- --run tests/agents/quantitative-claim-guard.spec.ts` | `tests/agents/quantitative-claim-guard.spec.ts` | ❌ |
| UI-01 | Dev server boots; `App.tsx` renders Thread + Composer + HeaderBar without runtime error | unit (jsdom) | `npm test -- --run tests/ui/app-shell.spec.tsx` | `tests/ui/app-shell.spec.tsx` | ❌ |
| UI-02 | Streaming chunks render incrementally; first chunk produces visible text within 100ms of arrival in test harness | integration (jsdom + mock SSE) | `npm test -- --run tests/ui/streaming.spec.tsx` | `tests/ui/streaming.spec.tsx` | ❌ |
| UI-03 | Tool-trace renders collapsed by default; click expands; row format matches `tool(args) → result` (D-11/D-12) | unit (jsdom) | `npm test -- --run tests/ui/tool-trace.spec.tsx` | `tests/ui/tool-trace.spec.tsx` | ❌ |
| UI-04 | Wiki-citation renders excerpt + Open-in-Obsidian button; `obsidian://open?vault=…&file=…` URL correctly encoded | unit (jsdom) | `npm test -- --run tests/ui/wiki-citation.spec.tsx` | `tests/ui/wiki-citation.spec.tsx` | ❌ |
| UI-06 | Recompile button triggers `POST /recompile`; status pill flips in-flight → `Last compiled: now`; D-18 system message lands in chat | integration (jsdom + mock fetch) | `npm test -- --run tests/ui/recompile-button.spec.tsx` | `tests/ui/recompile-button.spec.tsx` | ❌ |
| RES-01 | `tavily_search` tool returns ≥1 result for known query (gated by `RUN_TAVILY_TESTS=1`); without env, mocked client used | integration (gated) | `RUN_TAVILY_TESTS=1 npm test -- --run tests/agents/tavily.spec.ts` | `tests/agents/tavily.spec.ts` | ❌ |
| RES-02 | After research turn that wrote N claims: `SELECT count(*) FROM sources WHERE retrieved_at > $turn_start >= 1` AND no vault file mtime > $turn_start | integration | `npm test -- --run tests/agents/research-no-vault-write.spec.ts` | `tests/agents/research-no-vault-write.spec.ts` | ❌ |
| COMP-10 | (a) static: `vault_write_atomic` ∉ research-agent tools; (b) runtime: invoke tool with `ctx={agentId:'research'}` → throws `ToolPermissionDenied`; (c) E2E: `vault/` snapshot byte-identical before/after research turn | unit + integration | `npm test -- --run tests/agents/tool-permission.spec.ts tests/agents/vault-writer-gate.spec.ts` | `tests/agents/tool-permission.spec.ts`, `tests/agents/vault-writer-gate.spec.ts` | ❌ |
| COMP-11 | `POST /recompile` invokes compilation sub-agent only; `/recompile` slash command in composer routes identically | integration + unit | `npm test -- --run tests/server/recompile-route.spec.ts tests/ui/slash-command.spec.tsx` | `tests/server/recompile-route.spec.ts`, `tests/ui/slash-command.spec.tsx` | ❌ |
| CRIT-01 | For unsourced TAM-shaped user assertion, coordinator reply contains all three token sets: rule-named ("hypothesis"/"TAM"/"unsourced") + action-named ("logging"/"confidence"/"claim:") + path-forward ("source"/"research") — Phase 2 pre-gate; LLM-judge full rubric in Phase 4 | integration (gated) | `RUN_AGENT_TESTS=1 npm test -- --run tests/agents/pushback-substance.spec.ts` | `tests/agents/pushback-substance.spec.ts` | ❌ |
| `data-claim-id` (D-09 / pairs with UI-04) | UI consumes `data-claim-id` chunks emitted by 02-06; `[[claim:<ULID>]]` text tokens (per coordinator-identity.md) render as `<ClaimChip>` elements; race-safe (chunk-before-text and text-before-chunk both produce the chip; literal bracket text is the safe fallback when no chunk has yet arrived) | unit (jsdom) | `npm test -- --run tests/ui/claim-chip.spec.tsx` | `tests/ui/claim-chip.spec.tsx` | ❌ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All 17 probes are net-new (Phase 1 had no agent or UI surface). Wave 0 of Phase 2 must install:

### Server probes
- [ ] `tests/server/health.spec.ts` — `/health` 200 + JSON body
- [ ] `tests/server/chat-sse.spec.ts` — Hono SSE harness; stubbed coordinator emits ≥1 chunk; data-claim-id forwarding asserted
- [ ] `tests/server/recompile-route.spec.ts` — `POST /recompile` invokes compilation sub-agent only

### Agent probes
- [ ] `tests/agents/coordinator-config.spec.ts` — static `allowedTools` membership
- [ ] `tests/agents/schema-malformed-output.spec.ts` — retry-once-then-structured-error
- [ ] `tests/agents/recompile-roundtrip.spec.ts` — seed claims → `POST /recompile` → assert frontmatter `claim_ids[]`
- [ ] `tests/agents/no-peer-messaging.spec.ts` — grep + re-fetch-via-`findClaim()` assertion
- [ ] `tests/agents/quantitative-claim-guard.spec.ts` — five-case AGENT-08 fixture
- [ ] `tests/agents/tool-permission.spec.ts` — static membership across all sub-agents
- [ ] `tests/agents/vault-writer-gate.spec.ts` — runtime guard inside `tools/vault.ts`
- [ ] `tests/agents/research-no-vault-write.spec.ts` — sources count + vault mtime invariants
- [ ] `tests/agents/tavily.spec.ts` — gated real-call probe + default mock
- [ ] `tests/agents/pushback-substance.spec.ts` — CRIT-01 three-token-set regex pre-gate
- [ ] `tests/agents/prose-smuggling.spec.ts` — n-gram-overlap pure helper + applyOutputGuard runtime guard (per plan 02-05)

### Hybrid-search probe
- [ ] `tests/onebrain/search-hybrid.spec.ts` — Porter fixture; weighted-sum top-5 + FTS-only + vector-only baselines

### UI probes (assistant-ui via jsdom + `@testing-library/react`)
- [ ] `tests/ui/app-shell.spec.tsx`
- [ ] `tests/ui/streaming.spec.tsx`
- [ ] `tests/ui/tool-trace.spec.tsx`
- [ ] `tests/ui/wiki-citation.spec.tsx`
- [ ] `tests/ui/claim-chip.spec.tsx` — D-09 `[[claim:<ULID>]]` token replacement via `data-claim-id` chunk handler; race-safe in both chunk-before-text and text-before-chunk orderings
- [ ] `tests/ui/recompile-button.spec.tsx`
- [ ] `tests/ui/slash-command.spec.tsx`

### Shared fixtures and helpers
- [ ] `src/lib/ngram-overlap.ts` — n-gram overlap helper for prose-smuggling detection. **Lives under `src/lib/` (NOT `tests/lib/`)** so the runtime guard at `src/agents/coordinator-output-guard.ts` can import it without crossing the production-code/tests boundary. Both runtime and tests import from `@/lib/ngram-overlap.js`. (Plan 02-05 establishes this canonical location.) The TEST FILE that exercises it is `tests/agents/prose-smuggling.spec.ts` — that path is unchanged.
- [ ] `tests/fixtures/quantitative-claims.ts` — five-case AGENT-08 dataset
- [ ] `tests/fixtures/sub-agent-stubs.ts` — schema-conformant + malformed sub-agent outputs
- [ ] `.planning/eval/phase2-reference-dataset.{md,json}` — 15 user-labeled exemplars (AI-SPEC §"Reference Dataset"); JSON includes `gate_relevant: true|false` per scenario
- [ ] `.planning/eval/pushback-rubric.md` — LLM-judge rubric for CRIT-01

### Config additions
- [ ] `vitest.config.ts` — add `ui` project (jsdom env) and `agents` project (node env, integration, `fileParallelism: false`)
- [ ] Install `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (or `happy-dom`) as dev deps

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coordinator pushback substance (full rubric) | CRIT-01 | LLM-judge required; Phase 2 mechanizes only the regex pre-gate. Full rubric is hand-graded against a 15-example reference dataset; mechanized in Phase 4 as Promptfoo EVAL-02 | Open `.planning/eval/phase2-reference-dataset.md`; for each gate-relevant exemplar (the 13 scenarios with `gate_relevant: true`), run the coordinator, score reply against `pushback-rubric.md`; record PASS/FAIL in the dataset; **canonical gate: ≥12 of 13 grading slots PASS to clear Phase 2**. Scenarios 11+12 are locked-FAIL anti-examples (`gate_relevant: false`) excluded from this count. **CRIT-01 fail-loud verifier hook (added per plan 02-09 revision):** if the user defers labeling at the 02-09 checkpoint via `approved-deferred`, ALL 12 open user-labeled scenarios MUST be labeled (each with `labeled_outcome: PASS \| FAIL`, never null) before /gsd-verify-work for Phase 2 can pass. The verifier MUST fail-loud if `phase2-reference-dataset.json` contains any `labeled_outcome: null` for scenarios marked `gate_relevant: true`. The verifier reads the JSON, scans gate-relevant scenarios, and exits non-zero with a list of unlabeled scenario IDs if any are still null. This turns "approved-deferred" into named labeling debt rather than a silent skip. |
| Open-in-Obsidian button actually opens Obsidian | UI-04 | Browser-launches-app behavior cannot be asserted from jsdom | After dev server up, click "Open in Obsidian" on a wiki-citation chip; confirm Obsidian focuses the correct vault page |
| Streaming feels smooth (no jank) end-to-end with real Anthropic API | UI-02 | Performance/UX judgment | After dev server + `ANTHROPIC_API_KEY` set, ask a research question; observe text appears chunk-by-chunk with no >500ms gap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (24 probe files + 4 fixtures + 2 eval artifacts + vitest config)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s per wave
- [ ] CRIT-01 fail-loud verifier hook implemented (gates `approved-deferred` against null `labeled_outcome` for `gate_relevant: true` scenarios)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
