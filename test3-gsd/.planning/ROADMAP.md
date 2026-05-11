# Roadmap: Business Strategy Planner

## Overview

Five phases take the project from empty repo to a working hybrid Karpathy + OneBrain system that produces investor-grade business plans with traceable, confidence-tagged claims. Phase 1 establishes the schema, append-only repo, deterministic renderer, and compile pipeline as a CLI round-trip — no agents, no chat — preventing 11 of the 20 known pitfalls before they can occur. Phase 2 introduces the coordinator + research sub-agent and the chat UI on top of the proven skeleton. Phase 3 hardens compilation (diff-based, scheduled, debounced, backed up) — the IP of the hybrid pattern. Phase 4 brings the remaining sub-agents (ingest, financial, devil's-advocate) plus the Promptfoo eval suite. Phase 5 builds out every strategic-framework renderer, the composed plans, financial assumptions page, lint, and UI confidence badges — at which point the v1 milestone is shipped. Slice 5 (Scale Tooling) is deferred to v2 since no v1 requirements remain after Phase 5.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Walking Skeleton** - DB + schema + deterministic renderer + CLI round-trip; no agents, no chat
- [x] **Phase 2: Agents and Chat** - Coordinator + research sub-agent + Tavily + assistant-ui + manual recompile — completed 2026-04-28 (verifier passed; CRIT-01 partial — 12 user labels deferred to /gsd-verify-work 02)
- [ ] **Phase 3: Full Compilation** - Diff-based recompile, content-hash artifacts, schedule, debounce, edit-guard, backup
- [ ] **Phase 4: Multi-Agent Maturity** - Ingest, financial, devil's-advocate sub-agents + Promptfoo eval suite
- [ ] **Phase 5: Wiki Maturity** - All STRAT renderers, composed plans, financial assumptions, lint, UI confidence badges

## Phase Details

### Phase 1: Walking Skeleton
**Goal**: A CLI ingests one source, writes append-only OneBrain rows with embeddings, and the deterministic renderer compiles those rows into one Obsidian page with provenance — round-trip works end-to-end without any agent or chat surface.
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-05, INFRA-06, INFRA-07, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-10, COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-07, COMP-09, CRIT-02, CRIT-03, CRIT-04, CRIT-05, CRIT-06, EVAL-01
**Success Criteria** (what must be TRUE):
  1. User runs `docker compose up` and Postgres + pgvector + pgAdmin start; `node-pg-migrate up` applies the schema and Drizzle queries return rows.
  2. User runs the CLI with a source URL/file and sees one new `sources` row, ≥1 `claims` row (each with ULID, confidence ∈ [0,1], status=`hypothesis`, 1024-dim embedding), and `cites_source` edges connecting them.
  3. User opens the Obsidian vault and sees a deterministically rendered markdown page (with frontmatter: page_id, generated_at, source_claim_ids, content_hash) plus an updated `index.md` and an appended entry in `log.md`.
  4. User runs the renderer twice on unchanged inputs and the canonical content hash is identical (no `generated_at` drift); a contradictory pair of claims renders as an Obsidian callout, never silently smoothed.
  5. User runs `vitest` and unit + integration tests pass for db, repos, and the renderer (including append-only / supersede-only enforcement).
**Plans**: TBD

### Phase 2: Agents and Chat
**Goal**: A coordinator agent in a chat UI uses a research sub-agent to search the web via Tavily, lands findings in OneBrain as `sources` and `claims` rows, and the user can trigger a manual recompile that updates the wiki — with the compilation agent as the sole holder of `vault_write_atomic`.
**Depends on**: Phase 1 (schema, repo layer, renderer, vault layout, content hash, append-only enforcement)
**Requirements**: INFRA-04, DATA-09, AGENT-01, AGENT-02, AGENT-06, AGENT-07, AGENT-08, UI-01, UI-02, UI-03, UI-04, UI-06, RES-01, RES-02, COMP-10, COMP-11, CRIT-01
**Success Criteria** (what must be TRUE):
  1. User opens the React app, types a research question into the assistant-ui chat, sees streamed responses, and the tool-call trace shows the research sub-agent invoking Tavily.
  2. After a research turn the user can query OneBrain (or pgAdmin) and confirm new `sources` rows landed before any wiki write; if the user states a TAM-shaped or ≥$1M quantitative claim with no source, the coordinator pushes back verbally instead of accepting it.
  3. User clicks the "Recompile" button (or types `/recompile`) and the compilation sub-agent — the only agent holding `vault_write_atomic` — updates the vault; any other agent attempting a vault write is rejected at the tool-permission layer.
  4. Chat surfaces wiki markdown chunks inline with deeplinks to Obsidian, and hybrid search (full-text + vector cosine + tag) returns sensible results for queries against existing claims.
**Plans**: 9 plans
Plans:
- [x] 02-01-PLAN.md — Wave 1 infra: deps + Hono server skeleton + health route + bsp serve + vitest projects expansion (INFRA-04 health half) — completed 2026-04-27 (~18min)
- [x] 02-02-PLAN.md — Wave 1: claims_text_fts migration + searchClaims hybrid-search reader (DATA-09) — completed 2026-04-27 (~11min)
- [x] 02-03-PLAN.md — Wave 2: tool-permission boundary (vault/onebrain/tavily MCP wrappers + Layer 2 guards) (COMP-10, RES-01) — completed 2026-04-27 (~27min)
- [x] 02-04-PLAN.md — Wave 3: research + compilation sub-agent definitions + Layer-2 vault hook refactor + 6 Wave 0 probes (AGENT-02, AGENT-06, AGENT-07, RES-02) — completed 2026-04-27 (~14min) — RESOLVED 02-03 BLOCKING agentId-injection decision via option (a) hook-based assertion
- [x] 02-05-PLAN.md — Wave 4: coordinator + repo Layer 1 quant-guard + coordinator-identity.md authoring (NOT CLAUDE.md — see plan Deviations) + output-guard (AGENT-01, AGENT-08, CRIT-01) — completed 2026-04-27 (~12min) — vaultAuditHook PreToolUse registration LIVE; settingSources deviation outcome: inline systemPrompt (SDK SettingSource is enum-only)
- [x] 02-06-PLAN.md — Wave 4: SSE bridge (Hono streamSSE + UIMessageChunk adapter + chat route + data-claim-id forwarding) (INFRA-04 chat half) — completed 2026-04-27 (~6min) — 4/4 chat-sse probe green; FULL MCP-prefix matcher discipline asserted by negative-case test (mcp__legacy__onebrain_write_claim does NOT match)
- [x] 02-07-PLAN.md — Wave 5: assistant-ui surface (App + HeaderBar + RecompileButton/Status + ToolTrace + WikiCitation + ClaimChip) + Vite alias fail-fast for src/agents/definitions (T-02-06) (UI-01..UI-04 + UI-06 visual half) — completed 2026-04-27 (~13min auto + smoke-check approved); 5 UI Wave 0 probes 18 cases green; UI-06 partial (components shipped; button onClick + status polling deferred to 02-08); 3 Rule-3 deviations (assistant-ui CLI sandbox blocker → manual scaffold; jsdom Web Streams polyfill; INFRA-05 test relocation)
- [x] 02-08-PLAN.md — Wave 6: recompile route + UI integration + slash-command parsing (COMP-11, UI-06) — completed 2026-04-27 (~25min auto exec + ~7h wall incl. smoke check pause + 7 in-smoke fix cycles); 14 commits total (5 plan + 2 pre-smoke + 7 in-smoke); 6 deviations (4 Rule 1 bugs incl. CRITICAL vault-audit field-name fix that made vault writable + 2 Rule 2 missing critical: coordinator vault_read + permissionMode bypassPermissions); UI-06 + COMP-11 close; AGENT-06 + RES-02 live-path re-confirmed; smoke check approved 2026-04-27; multi-topic index aggregation deferred to Phase 3 "Full Compilation" (runCompile writes ONE topic + overwrites index.md per Phase 1 plan 01-04 limitation)
- [x] 02-09-PLAN.md — Wave 1: reference dataset + pushback rubric for CRIT-01 hand-grading (CRIT-01) — completed 2026-04-26 (~8min) — **partial: 12 user-labeling slots deferred to /gsd-verify-work 02 (see STATE.md Verification Debt)**
**UI hint**: yes

### Phase 3: Full Compilation
**Goal**: Compilation runs reliably and idempotently — only changed pages recompile, LLM-generated intros are cached by input hash, recompiles run on schedule and after debounced source-add, the system warns when the vault has been hand-edited, and DB + vault can be backed up as a paired snapshot.
**Depends on**: Phase 1 (canonical content hash, deterministic renderer, vault layout) and Phase 2 (compilation sub-agent, manual recompile path)
**Requirements**: COMP-06, COMP-08, COMP-12, COMP-13, COMP-14, COMP-15, EVAL-04
**Success Criteria** (what must be TRUE):
  1. User edits one claim row, runs recompile, and only the affected page(s) regenerate (others' content hash unchanged); identical inputs produce byte-identical output across runs (Promptfoo eval EVAL-04 passes).
  2. User adds a new source via the ingest path, waits ~30s without touching anything, and the compilation agent automatically recompiles (debounce window respected); the configured node-cron schedule also triggers a recompile at the expected interval.
  3. User edits a wiki page by hand in Obsidian, the human-edit guard lint flags the divergence on next compile and surfaces which page(s) were touched outside the compilation agent.
  4. User runs the paired-backup command and gets a single restorable snapshot of OneBrain DB + vault that round-trips back to the same content hashes.
**Plans**: TBD

### Phase 4: Multi-Agent Maturity
**Goal**: The full sub-agent roster works — ingest accepts paste/URL/file, financial-analysis produces unit-economics / market-sizing / comp-benchmark claims, devil's-advocate must search OneBrain before counter-claiming, and Promptfoo evals pin down the critical-agent behaviors before the sub-agents ship.
**Depends on**: Phase 1 (claims schema, edges) and Phase 2 (coordinator, agent topology, tool-permission system)
**Requirements**: AGENT-03, AGENT-04, AGENT-05, FIN-01, FIN-02, FIN-03, CRIT-07, EVAL-02, EVAL-03
**Success Criteria** (what must be TRUE):
  1. User pastes a URL, drops a file, or pastes raw text; the ingest sub-agent creates a `sources` row plus initial `claims` rows with reasonable extraction quality.
  2. User asks for unit economics, TAM/SAM/SOM, or comp benchmarks; the financial-analysis sub-agent produces grounded claim rows (with `cites_source` edges, not hallucinated numbers).
  3. User triggers the devil's-advocate review on a plan composition; tool-call trace shows `onebrain_search` was called before any counter-claim row was written, and the resulting claims include real `contradicts` / `evidence_of` edges to specific OneBrain rows (no strawmen).
  4. Promptfoo evals run green: coordinator pushes back on unsourced claims (EVAL-02), devil's-advocate substantiates with onebrain_search (EVAL-03), and the devil's-advocate review pass blocks plan-composition vault writes that fail review.
**Plans**: TBD

### Phase 5: Wiki Maturity
**Goal**: Every v1 strategic-framework page renders, the comprehensive marketing and business plans compose cleanly from the constituent pages, financial assumptions are a single sourced page, the wiki passes lint (no orphans / broken provenance / silently-stale claims), and the chat UI shows confidence badges on every inline claim — v1 milestone ships at the end of this phase.
**Depends on**: Phase 1 (renderer, vault layout) and Phase 3 (diff-based recompile so partial framework rollouts are tractable) and Phase 4 (financial-analysis sub-agent feeding FIN claims)
**Requirements**: STRAT-01, STRAT-02, STRAT-03, STRAT-04, STRAT-05, STRAT-06, STRAT-07, STRAT-08, STRAT-09, STRAT-10, STRAT-11, STRAT-12, STRAT-13, FIN-04, UI-05, EVAL-05
**Success Criteria** (what must be TRUE):
  1. User asks for any of the 11 strategic-framework pages (SWOT, STP, 4Ps, Porter's 5 Forces, brand pyramid, positioning statement, voice/tone & messaging, JTBD, customer journey, ICP, persona) and gets a rendered Obsidian page wired to OneBrain claims.
  2. User asks for the comprehensive marketing plan and business plan; both compose correctly from the framework pages plus FIN-* claims plus a `financial assumptions` consolidated page (FIN-04).
  3. User opens the chat UI and sees confidence badges rendered on every inline claim chunk; low-confidence and stale-claim banners are visible in the compiled wiki.
  4. User runs the lint pass (EVAL-05) and it surfaces orphan pages, broken provenance edges, and stale claims with actionable output.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Walking Skeleton | 6/7 | In progress | - |
| 2. Agents and Chat | 9/9 | All plans complete; ready for /gsd-verify-work 02 (02-09 partial — 12 user-labeling slots deferred to verify-work; UI-06 + COMP-11 fully closed by 02-08; smoke check approved 2026-04-27) | 2026-04-27 (final plan close-out) |
| 3. Full Compilation | 0/TBD | Not started | - |
| 4. Multi-Agent Maturity | 0/TBD | Not started | - |
| 5. Wiki Maturity | 0/TBD | Not started | - |

## Coverage

- v1 requirements: 77 total (REQUIREMENTS.md states 75; actual count of REQ-IDs across categories is 77)
- Mapped: 77 / 77
- Orphaned: 0

## Deviation from 6-Slice Backbone

The research's recommended Slice 5 (Scale Tooling / Investor Polish) is intentionally **not** materialized as a Phase 6 in v1. After mapping every v1 requirement to Slices 0–4 (renamed Phases 1–5 here), no v1 requirements remain for Slice 5: qmd MCP server is gated to v2 (UI-V2-02), observability is v2 (OBS-V2-*), and FIN-* polish toward investor-grade projections is v2 (FIN-V2-*). Creating a Phase 6 with zero v1 requirements would be empty-phase theater. Slice 5 becomes the v2 milestone gate instead. This is consistent with `granularity: standard` (5–8 phases) — 5 phases is at the lower end of the band but justified by requirement coverage.
