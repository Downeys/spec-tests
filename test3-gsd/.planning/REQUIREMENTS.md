# Requirements: Business Strategy Planner

**Defined:** 2026-04-25
**Core Value:** Every strategic claim in the wiki is connected to research-backed evidence with explicit confidence — the system makes a business plan defensible by construction.

## v1 Requirements

Requirements for the initial release. v1 = wiki + research foundation, with financial *analysis* as research evidence. Investor-grade financial *projections* are deferred to v2.

### Infrastructure (INFRA)

- [ ] **INFRA-01**: Local Postgres 16 + pgvector + pgAdmin run via Docker Compose
- [ ] **INFRA-02**: Node.js 22 + TypeScript 5.6 project structure (backend + frontend)
- [ ] **INFRA-03**: node-pg-migrate is the schema source of truth; Drizzle is query-only (never schema owner)
- [x] **INFRA-04**: Hono backend with health check and streaming `/chat` endpoint _(health half complete in 02-01; SSE `/chat` half complete in 02-06 — chat-sse 4/4 probe green; FULL MCP-prefix matcher + data-claim-id forwarding)_
- [ ] **INFRA-05**: React 19 + Vite 6 frontend skeleton
- [ ] **INFRA-06**: Vitest 4 configured for unit + integration tests
- [x] **INFRA-07**: API-key configuration for Anthropic, Voyage, Tavily via `.env`

### OneBrain (data layer) (DATA)

- [ ] **DATA-01**: `sources` table — ingested raw documents (URL, title, content, retrieved_at, kind)
- [ ] **DATA-02**: `claims` table — atomic findings with confidence (0.00–1.00) and status (`hypothesis | tested | validated | refuted | superseded`)
- [ ] **DATA-03**: `entities` table — companies, products, segments, frameworks
- [x] **DATA-04**: `edges` table — typed relationships (cites_source, supports, contradicts, supersedes, evidence_of)
- [ ] **DATA-05**: ULID stable IDs on every row, immutable for the row's lifetime
- [x] **DATA-06**: Append-only repository pattern — no delete path; supersede-only
- [ ] **DATA-07**: `vector(1024)` embedding column on claims, HNSW index (m=16, ef_construction=64)
- [x] **DATA-08**: Voyage 3.5 embedding integration with constant output dimension
- [x] **DATA-09**: Hybrid search across OneBrain (full-text + vector cosine + tag filter)
- [x] **DATA-10**: Tag/category model with controlled vocabulary

### Compilation Agent + Vault (COMP)

- [x] **COMP-01**: Obsidian vault directory layout (`raw/`, `wiki/`, framework-family subdirectories)
- [x] **COMP-02**: Wiki page frontmatter convention (page_id, generated_at, source_claim_ids, content_hash)
- [x] **COMP-03**: Auto-maintained content catalog (`index.md` per Karpathy convention)
- [x] **COMP-04**: Auto-appended chronological event log (`log.md` per Karpathy convention)
- [x] **COMP-05**: Deterministic TypeScript page renderer (claims → markdown)
- [ ] **COMP-06**: LLM intro/connective generation with input-hash cache for determinism
- [x] **COMP-07**: Canonical content hash (excludes timestamps/run-ids) for diff detection
- [ ] **COMP-08**: Diff-based recompile — only regenerate pages whose source claims changed
- [x] **COMP-09**: Contradictions rendered as Obsidian callouts, never smoothed away
- [x] **COMP-10**: Single-writer-to-vault enforced at tool-permission level (only compilation agent has `vault_write_atomic`)
- [x] **COMP-11**: Manual `/recompile` command from chat _(02-08 — POST /recompile (SSE) invokes compilation sub-agent ONLY (agents map: { compilation: compilationDef }; agents.research === undefined per route-half probe); GET /recompile/status returns JSON dirty-count per D-16; Composer.tsx slash-command interception routes /recompile to POST /recompile not POST /chat; smoke check verified live 2026-04-27 — button click + slash command both fire; vault_write_atomic invoked; compile_run row written; D-18 system message renders inline; status pill updates within 5s poll; idempotency invariant: 1 POST per click+slash via lifted useRecompile)_
- [ ] **COMP-12**: Scheduled recompile via node-cron (configurable interval)
- [ ] **COMP-13**: Source-added debounced auto-recompile (~30s debounce)
- [ ] **COMP-14**: Human-edit guard — lint detects vault edits made outside the compilation agent
- [ ] **COMP-15**: Paired backup of OneBrain DB + vault for restore consistency

### Multi-Agent (AGENT)

- [x] **AGENT-01**: Coordinator agent chat-facing, identity defined in CLAUDE.md
- [x] **AGENT-02**: Research sub-agent (Tavily + creates claim rows in OneBrain)
- [ ] **AGENT-03**: Ingest sub-agent (paste/URL/file → sources rows + initial claim extraction)
- [ ] **AGENT-04**: Financial-analysis sub-agent (unit economics, market sizing as claim rows)
- [ ] **AGENT-05**: Devil's-advocate sub-agent — required to call `onebrain_search` before producing counter-claims (anti-pushback-theater)
- [x] **AGENT-06**: Compilation sub-agent — only agent with `vault_write_atomic` tool _(02-04 source-tree level + 02-08 live-path re-confirmed: smoke check 2026-04-27 verified vault_write_atomic succeeds when invoked by compilation sub-agent and is blocked for all other agent_type values per the corrected vault-audit hook in commit 9f4195d)_
- [x] **AGENT-07**: Sub-agents communicate via OneBrain rows, not peer-to-peer messaging
- [x] **AGENT-08**: Coordinator enforces "source row required before claim row" for any quantitative claim ≥ $1M / TAM-shaped pattern

### Chat UI (UI)

- [x] **UI-01**: Chat interface using assistant-ui + Vercel AI SDK 6 _(02-07 — App.tsx replaced with assistant-ui Thread + Composer composition; AssistantChatTransport against /chat; tests/ui/app-shell.spec.tsx 3/3 green)_
- [x] **UI-02**: Streaming message rendering _(02-07 — AssistantChatTransport configured against /chat via the `api` field per ai-package's DefaultChatTransport base; tests/ui/streaming.spec.tsx 2/2 green; full visual smoothness deferred to manual verification per VALIDATION §Manual-Only Verifications)_
- [x] **UI-03**: Tool-call trace visible (sub-agent invocations, search calls) _(02-07 — ToolTrace.tsx collapsed-by-default with D-11 summary line + IC-3 expand; FULL `mcp__<server>__` prefix strip; tests/ui/tool-trace.spec.tsx 3/3 green; inline integration into MessagePrimitive.Content deferred to 02-08 / polish round)_
- [x] **UI-04**: Wiki markdown chunks surfaced inline in chat with deeplink to Obsidian _(02-07 — WikiCitation.tsx with `obsidian://open?vault=...&file=encodeURIComponent(vaultRelPath)` per D-13/D-14; T-02-UI-01 path-traversal mitigation verified; tests/ui/wiki-citation.spec.tsx 3/3 green; inline integration into MessagePrimitive.Content deferred to 02-08 / polish round; end-to-end deeplink launch deferred to 02-08 Task 6)_
- [ ] **UI-05**: Confidence badges rendered on inline claims
- [x] **UI-06**: Manual recompile button + status indicator _(02-07 visual half + 02-08 FULL CLOSURE — RecompileButton consumes lifted useRecompile hook (real fetch + SSE + onCompleted callback); RecompileStatus polls /recompile/status every 5s; HeaderBar accepts state via props; Composer slash-command interception routes /recompile to POST /recompile; D-18 system message renders inline; idempotency invariant: button click + slash share inFlight via lifted hook (1 POST not 2); smoke check verified live 2026-04-27)_

### Web Research (RES)

- [x] **RES-01**: Tavily integration via `@tavily/core` (search depth: advanced + extract + crawl)
- [x] **RES-02**: Research results land in `sources` and `claims` rows before any wiki update _(02-04 source-tree level via research-no-vault-write probe + 02-08 live-path re-confirmed: smoke check 2026-04-27 verified research turn lands findings as sources/claims rows; vault mtime unchanged during research; vault writes only occur via subsequent /recompile invocation of the compilation sub-agent)_

### Strategic Frameworks (STRAT)

- [ ] **STRAT-01**: SWOT page generation
- [ ] **STRAT-02**: STP (Segment / Target / Position) page generation
- [ ] **STRAT-03**: 4Ps (Product / Price / Place / Promotion) page generation
- [ ] **STRAT-04**: Porter's 5 Forces page generation
- [ ] **STRAT-05**: Brand pyramid page generation
- [ ] **STRAT-06**: Positioning statement page generation
- [ ] **STRAT-07**: Voice/tone + messaging architecture page generation
- [ ] **STRAT-08**: Jobs-to-be-Done page generation
- [ ] **STRAT-09**: Customer journey map page generation
- [ ] **STRAT-10**: ICP (Ideal Customer Profile) page generation
- [ ] **STRAT-11**: Persona doc generation
- [ ] **STRAT-12**: Comprehensive marketing plan composed from STRAT-01..STRAT-11
- [ ] **STRAT-13**: Comprehensive business plan composed from STRAT-12 + FIN-* + product/operations docs

### Financial Analysis (FIN — v1 evidence-grade)

- [ ] **FIN-01**: Unit economics analysis as OneBrain claims (cost structure, pricing assumptions)
- [ ] **FIN-02**: Market sizing claims (TAM/SAM/SOM with sourced inputs)
- [ ] **FIN-03**: Comparable-company benchmarks as claims
- [ ] **FIN-04**: Financial assumptions wiki page (consolidated, sourced)

### Critical / Hypothesis Behavior (CRIT)

- [x] **CRIT-01**: Coordinator verbally pushes back on weak / unsourced claims in chat _(02-05 implementation + 02-08 live-path re-confirmed via smoke check 2026-04-27 — coordinator quotes vault content with claim citations now that vault_read was added to coordinatorAllowedTools in fix 0c0e2fa; **PARTIAL** until /gsd-verify-work 02 closes the 12 user-labeling slots from 02-09)_
- [ ] **CRIT-02**: Every claim defaults to `status = hypothesis` on creation
- [ ] **CRIT-03**: Confidence (0.00–1.00) required on every claim row
- [x] **CRIT-04**: Compilation surfaces low-confidence and stale claims with banners
- [x] **CRIT-05**: Contradictions preserved as callouts in compiled wiki pages; never auto-resolved
- [x] **CRIT-06**: Hypothesis-status promotion (e.g., to `validated`) requires an explicit evidence edge
- [ ] **CRIT-07**: Devil's-advocate review pass on plan compositions before vault write

### Evaluation / Quality (EVAL)

- [x] **EVAL-01**: Vitest unit + integration tests (db, repos, renderer)
- [ ] **EVAL-02**: Promptfoo eval — coordinator pushes back on unsourced claims
- [ ] **EVAL-03**: Promptfoo eval — devil's-advocate substantiation (no strawmen, requires `onebrain_search`)
- [ ] **EVAL-04**: Promptfoo eval — compilation determinism (same input → same output hash)
- [ ] **EVAL-05**: Lint pass detects orphan pages, broken provenance, stale claims

## v2 Requirements

Deferred toward the investor-grade north star or scale milestones. Tracked but not in current roadmap.

### Financial Projections (FIN-V2)

- **FIN-V2-01**: Three-statement financial model (P&L, cash flow, balance sheet)
- **FIN-V2-02**: Scenario modeling (best / base / worst case)
- **FIN-V2-03**: Investor-grade projections that survive due-diligence scrutiny

### UI (UI-V2)

- **UI-V2-01**: Confidence / freshness filter controls
- **UI-V2-02**: Wiki search via `qmd` MCP server (trigger: vault > ~50 pages)

### Evaluation (EVAL-V2)

- **EVAL-V2-01**: Visual regression for Obsidian markdown rendering (when headless harness available)

### Observability (OBS-V2)

- **OBS-V2-01**: Agent decision telemetry / runtime logs
- **OBS-V2-02**: Cost tracking per session / per sub-agent

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authentication / multi-user | Personal project, single user |
| Real-time collaboration | Single user, no concurrent editing |
| Production hosting / cloud deployment | Local-only, runs on user's machine |
| Mobile UI | Desktop only |
| Multiple memory architecture patterns | Only Karpathy + OneBrain hybrid is being tested |
| Custom in-app graph visualization | Obsidian renders the graph natively |
| Industry-specific templates | System is generic — works for any business idea |
| Auto-resolved contradictions | Explicitly preserved as strategic signal |
| Direct chat-to-wiki writes | Single-writer-to-vault is architectural keystone |
| Drag-and-drop plan builder UI | Chat-driven; no-code surface is anti-feature for this scope |
| LangChain / LangGraph orchestration | Claude Agent SDK chosen — vendor lock concern moot given Claude Opus is a hard constraint |

## Traceability

Populated during roadmap creation 2026-04-25.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 2 | Complete (02-01 health half + 02-06 SSE chat half — 4/4 chat-sse probe green) |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Complete (01-03) |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Complete (01-05) |
| DATA-05 | Phase 1 | Pending |
| DATA-06 | Phase 1 | Complete (01-03) |
| DATA-07 | Phase 1 | Pending |
| DATA-08 | Phase 1 | Complete (01-03) |
| DATA-09 | Phase 2 | Complete (02-02) |
| DATA-10 | Phase 1 | Complete (01-05) |
| COMP-01 | Phase 1 | Complete (01-04) |
| COMP-02 | Phase 1 | Complete (01-04) |
| COMP-03 | Phase 1 | Complete (01-04) |
| COMP-04 | Phase 1 | Complete (01-04) |
| COMP-05 | Phase 1 | Complete (01-04) |
| COMP-06 | Phase 3 | Pending |
| COMP-07 | Phase 1 | Complete (01-03) |
| COMP-08 | Phase 3 | Pending |
| COMP-09 | Phase 1 | Complete (01-04) |
| COMP-10 | Phase 2 | Complete (02-03) |
| COMP-11 | Phase 2 | Complete (02-08 — POST /recompile + GET /recompile/status + Composer slash-command interception; smoke check approved 2026-04-27) |
| COMP-12 | Phase 3 | Pending |
| COMP-13 | Phase 3 | Pending |
| COMP-14 | Phase 3 | Pending |
| COMP-15 | Phase 3 | Pending |
| AGENT-01 | Phase 2 | Complete (02-05) |
| AGENT-02 | Phase 2 | Complete (02-04) |
| AGENT-03 | Phase 4 | Pending |
| AGENT-04 | Phase 4 | Pending |
| AGENT-05 | Phase 4 | Pending |
| AGENT-06 | Phase 2 | Complete (02-04 source-tree + 02-08 live-path re-confirmed via smoke check) |
| AGENT-07 | Phase 2 | Complete (02-04) |
| AGENT-08 | Phase 2 | Complete (02-05) |
| UI-01 | Phase 2 | Complete (02-07) |
| UI-02 | Phase 2 | Complete (02-07 — config half; visual smoothness deferred to manual verification per VALIDATION §Manual-Only Verifications) |
| UI-03 | Phase 2 | Complete (02-07 — component shipped; inline integration into MessagePrimitive.Content deferred to 02-08 / polish round) |
| UI-04 | Phase 2 | Complete (02-07 — component shipped + T-02-UI-01 path-traversal mitigation verified; inline integration + end-to-end deeplink launch deferred to 02-08 Task 6 / polish round) |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 2 | Complete (02-07 visual half + 02-08 full closure — RecompileButton/Composer/RecompileStatus wired to real endpoints; lifted useRecompile for cross-surface idempotency; D-18 system message; smoke check verified live 2026-04-27) |
| RES-01 | Phase 2 | Complete (02-03) |
| RES-02 | Phase 2 | Complete (02-04 source-tree + 02-08 live-path re-confirmed via smoke check) |
| STRAT-01 | Phase 5 | Pending |
| STRAT-02 | Phase 5 | Pending |
| STRAT-03 | Phase 5 | Pending |
| STRAT-04 | Phase 5 | Pending |
| STRAT-05 | Phase 5 | Pending |
| STRAT-06 | Phase 5 | Pending |
| STRAT-07 | Phase 5 | Pending |
| STRAT-08 | Phase 5 | Pending |
| STRAT-09 | Phase 5 | Pending |
| STRAT-10 | Phase 5 | Pending |
| STRAT-11 | Phase 5 | Pending |
| STRAT-12 | Phase 5 | Pending |
| STRAT-13 | Phase 5 | Pending |
| FIN-01 | Phase 4 | Pending |
| FIN-02 | Phase 4 | Pending |
| FIN-03 | Phase 4 | Pending |
| FIN-04 | Phase 5 | Pending |
| CRIT-01 | Phase 2 | Partial (02-05 implementation + 02-08 live-path re-confirmed; 12 user-labeling slots from 02-09 still pending /gsd-verify-work 02 closure) |
| CRIT-02 | Phase 1 | Pending |
| CRIT-03 | Phase 1 | Pending |
| CRIT-04 | Phase 1 | Complete (01-04) |
| CRIT-05 | Phase 1 | Complete (01-04) |
| CRIT-06 | Phase 1 | Complete (01-03) |
| CRIT-07 | Phase 4 | Pending |
| EVAL-01 | Phase 1 | Complete (01-06) |
| EVAL-02 | Phase 4 | Pending |
| EVAL-03 | Phase 4 | Pending |
| EVAL-04 | Phase 3 | Pending |
| EVAL-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 77 total (the file's earlier "75" estimate is corrected; explicit count of REQ-IDs across categories is 77 — INFRA 7 + DATA 10 + COMP 15 + AGENT 8 + UI 6 + RES 2 + STRAT 13 + FIN 4 + CRIT 7 + EVAL 5)
- Mapped to phases: 77
- Unmapped: 0

**Per-phase distribution:**

| Phase | Requirements | Count |
|-------|--------------|-------|
| Phase 1 — Walking Skeleton | INFRA-01/02/03/05/06/07, DATA-01/02/03/04/05/06/07/08/10, COMP-01/02/03/04/05/07/09, CRIT-02/03/04/05/06, EVAL-01 | 28 |
| Phase 2 — Agents and Chat | INFRA-04, DATA-09, AGENT-01/02/06/07/08, UI-01/02/03/04/06, RES-01/02, COMP-10/11, CRIT-01 | 17 |
| Phase 3 — Full Compilation | COMP-06/08/12/13/14/15, EVAL-04 | 7 |
| Phase 4 — Multi-Agent Maturity | AGENT-03/04/05, FIN-01/02/03, CRIT-07, EVAL-02/03 | 9 |
| Phase 5 — Wiki Maturity | STRAT-01..13, FIN-04, UI-05, EVAL-05 | 16 |

---
*Requirements defined: 2026-04-25*
*Last updated: 2026-04-27 after plan 02-08 completion — COMP-11 marked complete; UI-06 marked FULL (was partial); AGENT-06 + RES-02 + CRIT-01 re-confirmed via 02-08 smoke check live-path; CRIT-01 remains PARTIAL until /gsd-verify-work 02 closes the 12 user-labeling slots from 02-09. ALL 9 Phase 2 plans complete; ready for phase verification.*
