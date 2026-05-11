# Five Workflows, One Prompt — Audit & Ranking

Analysis of five sibling projects built from the same idea prompt using different AI-assisted workflows: **BMAD**, **gstack**, **gsd**, **superpowers**, and **Matthew Pollock's workflow** (grill-me → to-prd → to-issues).

Date of analysis: 2026-05-11.

## The original idea prompt

> **Summary**: Guide the user in researching, brainstorming, defining, and documenting a full business plan including comprehensive marketing strategy and financial projections. Also tests AI memory architecture patterns.
>
> **Requirements**:
> - UI with chat interface
> - Agent performs in-depth research
> - Agent recalls previous research
> - Agent assists producing Strategic Framework marketing docs
> - Agent assists producing comprehensive marketing plan
> - Agent assists producing comprehensive business plan
> - Agent performs financial analysis
> - Agent creates financial projections
> - Agent is critical of every finding/decision; treats statements as hypotheses
>
> **AI Architecture** (intent):
> - Claude Opus primary model
> - Coordinator/sub-agent or agent-team structure
> - oneBrain repository for long-term memory/storage
> - Karpathy RAG wiki library for mapping business model, strategic frameworks, research-backed decisions
> - CLAUDE.md = agent identity; wiki = decision framework; oneBrain = knowledge repository
> - Maybe LangChain/LangGraph, or Agent SDK
> - Tavily or similar for web search

## How to read this

The question — **doc quality relative to code completion** — is really two questions:

1. **Did the docs accurately describe what got built?** (coherence — over-promise vs. under-sell)
2. **Was the doc investment justified by the code outcome?** (ROI — useful planning vs. planning theatre)

Each project gets a deep dive, then the rankings appear at the end under both lenses plus a combined verdict.

---

## 1. test2-gstack (gstack workflow)

**Docs** — Reference-grade and minimal. README + [ONEBRAIN-CRITICAL-POSTURE.md](test2-gstack/ONEBRAIN-CRITICAL-POSTURE.md) + [TODOS.md](test2-gstack/TODOS.md) is the whole set, plus an external gstack project folder. Each architectural decision is tagged (A1/A2/A3, CMT2/3/4) and every tag has a corresponding code path or explicit deferral. [CLAUDE.md](test2-gstack/CLAUDE.md) is intentionally a skill-router stub — thin, but honest about its role.

**Code** — 12 source files, 11 MCP tools, ~550 LoC of actual product. The whole product is a Postgres-backed MCP server: `tavily_search`, `store_entry`, `query_entries`, `traverse_provenance` (recursive CTE + cycle detection), `flag_contradiction` (rejects insert without `user_response` — Premise 7 enforced at the schema level), `compile_wiki` (Opus + atomic writes), `fetch_and_archive`. 88/99 tests pass; 1 environmental failure (Testcontainers reaper), 10 explicit `.skip` for Phase 2.

**The gap** — Tightest match in the cohort. Chat UI is delegated to Claude Desktop via MCP (a legitimate interpretation of the original prompt — "must have UI with chat interface" doesn't say "must build a web UI"). Phase 4 deliverables (full business plan, financial projections) are explicitly deferred. **~75% of the original requirements delivered.**

**Verdict**: pragmatic re-scoping into something shippable; docs and code in lockstep.

---

## 2. test4-superpowers (superpowers workflow)

**Docs** — Two enormous implementation plans ([2026-04-28-prd1-memory-architecture.md](test4-superpowers/docs/superpowers/plans/2026-04-28-prd1-memory-architecture.md) at 6,305 lines, [2026-04-30-prd2-agent-shell.md](test4-superpowers/docs/superpowers/plans/2026-04-30-prd2-agent-shell.md) at 5,549 lines) plus matching design specs. Checkbox-tracked tasks with paste-ready code snippets, SQL migrations, TS interfaces, endpoint specs. Commits to Postgres+pgvector, Voyage embeddings, Anthropic SDK directly (no LangChain), specific tool signatures (7 read / 4 write).

**Code** — 110 backend TS files, 20 frontend. Working React chat pane streaming over SSE; agent loop with multi-turn tool dispatch; pgvector HNSW semantic search on claims; Compact/New conversation lifecycle; deterministic vault compilation; full CLI for ingest/mutate/compile/lint. 22 backend test files + Playwright happy-path E2E.

**The gap** — Spec says 11 tools, code has exactly 11. Spec says "every claim is a hypothesis until promoted" — that's enforced in the mutation API. The **honest** weakness: scope was split across **6 PRDs**; only PRDs 1–2 (memory + chat shell) actually shipped. The original prompt's "business plan / marketing plan / financial projections" is parked in PRDs 5–6 with no code. Source ingestion has no UI — CLI only. **~65–75% delivered**, but framed as 6-layer cake on layer 2.

**Verdict**: best execution discipline; planning fragmented the product into shippable slabs and then ran out of slabs.

---

## 3. test3-gsd (gsd workflow)

**Docs** — ~2MB of `.planning/` structured artifacts: [PROJECT.md](test3-gsd/.planning/PROJECT.md), [REQUIREMENTS.md](test3-gsd/.planning/REQUIREMENTS.md), [ROADMAP.md](test3-gsd/.planning/ROADMAP.md), research deep-dives, 40+ per-phase plan files with PLAN/SUMMARY/probes/reviews. Phase-gated with explicit exit criteria. [STATE.md](test3-gsd/.planning/STATE.md) tracks 16/17 Phase 2 requirements as SATISFIED. Every requirement tagged (D-03, CRIT-01, STRAT-01..11, FIN-01..04) with decision provenance.

**Code** — ~100 TS files, ~50 test files (~234 tests total). Working: assistant-ui chat with SSE streaming; coordinator + research sub-agent on the Claude Agent SDK; live Tavily integration; OneBrain on Postgres with Voyage 3.5 embeddings + hybrid FTS-vector search; vault compilation with provenance links and contradiction callouts; manual recompile button + slash command; ULID claim chips. Vitest config bug prevents clean local run, but Phase 2 verifier passed.

**The gap** — Phase 2 of 5 closed. Strategic-framework renderers (STRAT-01..11), devil's-advocate agent, ingest agent, financial projections all explicitly Phase 3–5. **~55% delivered**, but the 55% is a working full-stack research-backed wiki engine, not a skeleton. Docs accurately mark what's deferred.

**Verdict**: most planning ceremony among the projects that shipped working agent code; phase-gating absorbs the over-planning critique.

---

## 4. business-planner-bmad (BMAD workflow)

**Docs** — ~13 planning artifacts following BMAD's PRD → architecture → epics → stories pipeline. PRD names Claude Opus 4.7, Tavily, Pinecone, Voyage embeddings, specific token namespacing, SSE transport. Architecture commits to Claude Agent SDK v1 + orchestrator + single-skeptic topology. Epic breakdown maps 43 functional requirements to 5 epics. A deferred-work doc triages 50+ known issues with brutal honesty.

**Code** — ~72 source files split `apps/web` (React 19 + Vite) + `apps/server` (Fastify 5) + `packages/shared`. Working: Fastify server, SSE infrastructure, Claude Agent SDK orchestrator with retry + Opus cost computation, project CRUD with atomic JSONL store, 25+ unit/integration tests with mocked SDK. **Chat input is disabled in the UI** — Story 1.8 onward is backlog. No Tavily, no Pinecone integration (declared in package.json but stub-only), no skeptic agent, no wiki.

**The gap** — Docs cover **all 10** original requirements. Code addresses ~2 of them in working form (chat shell + persistence) and ~3 in scaffolding (SSE, orchestrator, project model). **~18% delivered.** Phase 1 boundary is correctly drawn — the code that exists exactly matches Stories 1.1–1.7. But the docs were written 2 days before the audit cutoff and immediately got blocked on execution.

**Verdict**: BMAD's planning artifacts are pristine; the workflow's failure mode is generating enough ceremony to consume the build budget before the value-adding features start.

---

## 5. test5-sandcastle (Pollock workflow: grill-me → to-prd → to-issues)

**Docs** — 28 ADRs in [docs/adr/](test5-sandcastle/docs/adr/), each with Considered Options + Why X over Y + Consequences. Complete domain vocabulary in [CONTEXT.md](test5-sandcastle/CONTEXT.md) (Source, Claim, Citation, Strategy, Hypothesis, Strategic Framework with fixed-vs-repeating slot discriminators, Critic Attempt, Conversation, Sub-Agent Invocation). 10 principles docs. Decision discipline is the strongest of the five — ADR-0005→0026 shows a documented supersession (Tavily → Anthropic web search), ADR-0028 captures late nullable-semantics decisions. Pollock's "grill before you build" is on display.

**Code** — Strategy aggregate with state machine + 5 CRUD use-cases + Hono REST API + REPL + Postgres+pgvector docker scaffold with admin/app role split enforced via GRANTs. **100% test coverage on the domain layer** (119/119 statements). And… that's it. **Zero lines of**: Researcher sub-agent, Critic sub-agent, Cartographer, Renderer, Hypothesis/Claim/Citation aggregates, OpenBrain domain tables, chat UI message handling, web search wiring, Voyage embeddings, Anthropic SDK. `@anthropic-ai/sdk` is not in any `package.json`.

**The gap** — Docs describe a complete coherent system; code is ~15% of it. **The gap is intentional**: the Sandcastle/Pollock workflow queues remaining slices as GitHub issues (#33, #34, etc.), and the README says exactly that. So the "split-brain" is by design — but the original prompt asked for a working tool, and what shipped is database infrastructure with strategy CRUD.

**Verdict**: most disciplined planning; least working product. Whether this is virtue or theatre depends on whether the issue queue ever gets ground out.

---

## Ranked comparison

Two rankings, because they capture different things.

### A. Coherence ranking (do the docs honestly describe what's built?)

| # | Project | Docs | Code | Coherence | Notes |
|---|---|---|---|---|---|
| 1 | **gstack** | 8/10 | 7.5/10 | **9.5/10** | Decision tags map 1:1 to code or explicit deferrals; only ding is thin CLAUDE.md |
| 2 | **superpowers** | 9.5/10 | 7/10 | **9/10** | Spec→code alignment near-perfect within PRDs 1–2; honest about 3–6 being future |
| 3 | **gsd** | 9/10 | 6.5/10 | **9/10** | Phase 2 verifier-checked; deferred items explicitly named |
| 4 | **sandcastle** | 9.5/10 | 2.5/10 | **8.5/10** | Docs describe a system; code is one slice — but README *says* that |
| 5 | **bmad** | 9/10 | 3/10 | **8/10** | Same pattern as sandcastle but the PRD/architecture promised "Phase 1 MVP" and Phase 1 isn't even minimally usable yet |

### B. ROI ranking (was the doc investment justified by what shipped?)

| # | Project | Doc weight | Code delivered | Doc/Code ratio | Verdict |
|---|---|---|---|---|---|
| 1 | **gstack** | Light (~5 docs) | 75% | **Best ratio** | Minimal ceremony, maximum shipping |
| 2 | **gsd** | Heavy (~2MB) | 55% | Justified | Heavy planning, but Phase 2 actually shipped a working stack |
| 3 | **superpowers** | Heavy (~12K lines plans) | 65–75% | Justified | Plans were paste-into-editor specific; got used |
| 4 | **bmad** | Heavy (~13 artifacts) | 18% | **Over-invested** | Beautiful PRD/epics, then chat input still disabled |
| 5 | **sandcastle** | Heaviest (28 ADRs + ontology) | 15% | **Most over-invested** | ADR discipline is real; product is a DB scaffold |

### C. Combined ranking — best doc quality *relative to* code completion

This is the headline answer. Weighting: docs should justify themselves by either (a) producing working code, or (b) being so structured that they're a usable blueprint for the next person/agent to continue.

1. **🥇 gstack** — Honest scope, honest docs, honest code. Re-scoping "chat UI" to MCP/Claude Desktop was a defensible call that made shipping possible. Best doc-to-delivery ratio.

2. **🥈 superpowers** — Highest absolute code+doc quality. Lost first place because slicing into 6 PRDs and shipping 2 of them mismatches the original prompt's "comprehensive" framing more than gstack's MCP re-scope did.

3. **🥉 gsd** — Most overall planning weight that *still produced* working agent code with real Tavily, real Voyage, real hybrid search, real compilation. 234 tests. The 2MB of planning earned its keep.

4. **bmad** — Planning artifacts are textbook quality. The Phase 1 boundary is honestly drawn. But Phase 1 doesn't include a working chat input, which is the load-bearing requirement #1 of the original prompt. The docs were written to support a project that hasn't been built yet — and given how much planning was generated before execution started, you can see the workflow's failure mode.

5. **sandcastle** — Strongest decision discipline by a clear margin (28 ADRs with rejected alternatives, complete domain ontology, supersession trail). But after all that grilling, what's in the repo is `Strategy.create()` + Postgres roles. If the Pollock workflow is "grill until decisions crystallize, then issue-decompose, then execute" — execution is the missing 85%. Whether this scores #5 or #1 depends entirely on whether the issue queue gets worked.

---

## Cross-cutting observations

- **No project actually built financial projections, marketing plans, or comprehensive business plans** in working code. All five deferred items 4–8 of the original prompt. The variation is in how many other items they delivered.
- **Two interpretations of "chat UI"** emerged: web (bmad, gsd, superpowers, sandcastle-scaffolded) vs. MCP/Claude Desktop (gstack). The MCP route was cheapest and shipped.
- **Karpathy RAG wiki** was implemented by 3 of 5 (gstack `compile_wiki`, gsd vault compilation, superpowers vault). Sandcastle and bmad documented it; didn't build it.
- **The skeptic / critical-posture requirement** was taken seriously by gstack (Premise 7 enforced at schema level), gsd (regex pre-gate + smoke check), and superpowers (hypothesis lifecycle). Bmad and sandcastle documented it without coding it.
- **Honest deferral** is the cohort's strongest shared trait. None of the five fake completeness. Every project either ships what its docs say or explicitly marks the rest as future scope.

---

# Part 2: Code Quality Across the Five Projects

A separate audit — same five projects, this time scored on how well the code that *does* exist holds up against industry standards, SOLID, and clean-code principles.

## Headline scorecard

| Dimension | bmad | gstack | gsd | superpowers | sandcastle |
|---|---|---|---|---|---|
| Type safety | 8 | **9** | 6 | **9** | **9** |
| SOLID adherence | 8 | 8 | 7 | 7 | 8 |
| Clean code | 7 | 8 | 7 | 8 | 8 |
| Error handling | **9** | **9** | 7 | 7 | **9** |
| Testing maturity | 8 | 8 | **3** ⚠ | 8 | **9** |
| Architecture | 8 | **9** | 8 | 8 | **9** |
| Observability | 6 | 7 | 6 | 5 | **4** ⚠ |
| Security/ops | 7 | 8 | 7 | 8 | 8 |
| **Composite** | **7.6** | **8.0** | **6.0** | **7.5** | **8.0** |

## Per-project character

### test2-gstack — composite 8.0 🥇
The **error classification factory** ([src/lib/define-tool.ts:77–108](test2-gstack/src/lib/define-tool.ts)) is the project's spine: every tool inherits TRANSIENT/PERMANENT/INVALID_INPUT routing for free. Stdout-guard ([src/lib/stdout-guard.ts](test2-gstack/src/lib/stdout-guard.ts)) defensively poisons `process.stdout.write` because MCP transport breaks if anything hits stdout. Zero `any` escapes, full strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. 98 tests pass with Testcontainers. Weakness: tool handlers like `tavilySearch` (~70 lines) and `compileWiki` (~160 lines) blend too many concerns, and there's no cost tracking despite calling Opus. **Reading this code feels like reading library-grade infrastructure.**

### test5-sandcastle — composite 8.0 🥇 (tied)
**Genuine DDD, not theatre.** Branded `StrategyId`, private constructors, `Result<T, E>` discriminated unions, factory methods that return errors instead of throwing ([packages/domain/aggregates/strategy/strategy.ts](test5-sandcastle/packages/domain/aggregates/strategy/strategy.ts)). Property-based tests via fast-check actually exercise invariants — 30-action sequences verify the legal-transition matrix, not just smoke. 100% statement coverage on the domain layer. **Postgres role-split is enforced in code**: migration 0001_init.sql REVOKEs UPDATE/DELETE from `openbrain_app`, and a Testcontainers integration test asserts the failure code is `42501` (permission denied). ESLint `boundaries` rules forbid domain→application imports at CI time. Weakness: `if (isErr(x)) return err(x)` repeats 5-6 times per use-case; observability is the worst of the cohort (score 4) — just `console.error` for startup messages. **This is what disciplined TypeScript looks like — the small code volume makes the scaffolding feel earned, not over-engineered.**

### business-planner-bmad — composite 7.6
**Strongest error envelope discipline.** `AppErrorShape` with code+retryable+message is enforced by an ESLint rule ([apps/server/eslint.config.js:62-75](business-planner-bmad/apps/server/eslint.config.js)) so the contract can't drift. SSE handle lifecycle is carefully managed: heartbeat, onAbort-once, double-close guard ([apps/server/src/events/emit.ts:41-99](business-planner-bmad/apps/server/src/events/emit.ts)). Per-key promise serialization on the JSONL store provably prevents concurrent-write corruption — and it's tested. Weakness: `runOrchestrator` is 194 lines and 3 nesting levels, mixing retry/abort/stream/persist — the one piece of the codebase that reads "I built this and it works" rather than "I built this for others to modify." Branded types in production end up cast as `uuidv4() as unknown as ProjectId` — defensive but verbose.

### test4-superpowers — composite 7.5
**Best tool-dispatch architecture** — registry-pattern READER_HANDLERS / WRITER_HANDLERS keep `runtime.ts` open for extension. Deterministic compilation: sort keys explicit (tags ASC, sources DESC, vector results by similarity), atomic writes via tmp+rename, frontmatter hashing skips no-op writes. Type-safe discriminated unions everywhere. **Two real concerns**: silent JSON.parse fallback to `{}` in [runtime.ts:125](test4-superpowers/backend/src/agent/runtime.ts) means malformed model output gets eaten with zero telemetry; and token counting is `text.length / 4` heuristic with a TODO comment — the 400k budget could be off by an order of magnitude. The `claims.ts` module at 249 lines is doing query building + row mapping + transaction semantics together.

### test3-gsd — composite 6.0 ⚠
**The architecture is the strongest of the cohort.** Single-writer vault pattern is *structurally* enforced via two-layer defense (SDK allowlist + PreToolUse hook). Custom error classes carry domain semantics (`QuantitativeClaimRequiresSourceError`, `SourceRowNotFoundError`). Comments cite spec sections, not platitudes. **But the vitest config is fatally broken**: projects "integration" and "ui" share `sequence.groupOrder` so test startup fails outright. The 234 declared tests cannot actually run. ~12 `as unknown as` casts cluster at the Drizzle ORM boundary because Drizzle's `$inferSelect` doesn't preserve precision (confidence stored as string). Without the config bug, this would score 7+; with it, you can't verify anything works.

---

## Cross-cutting observations

### Everyone is bad at observability
Highest score in this column is **gstack at 7**. No project has correlation IDs end-to-end. No project has metrics/tracing hooks wired. Only bmad meaningfully tracks Opus costs. Sandcastle and superpowers don't have structured logging at all — `console.log` is the entire telemetry layer. For projects whose central value prop is "an agent that runs LLM calls," this is the most consistent weakness across all five workflows.

### Type safety is mostly solved
Four of five score 8 or 9. The exception (gsd at 6) is specifically about Drizzle ORM friction, not foundational sloppiness. None of these projects have `any` floating around in domain logic. Strict mode + Zod-at-boundary is now a baseline that all five AI workflows produce without prompting.

### Error handling discipline is real
Three of five score 9. **Every** project defines custom error classes; **none** rely on string-thrown `new Error()`. Three projects classify failures as retryable/permanent at boundaries (bmad, gstack, superpowers). The Result<T, E> monad is now mainstream enough that sandcastle uses it without ceremony.

### Testing is where the spread lives
- sandcastle (9): property-based tests + 100% domain coverage + DB-enforced-invariants integration tests
- bmad/gstack/superpowers (8): real Testcontainers, behavior-focused, no fake-mocks-of-everything
- gsd (3): tests exist on disk; config bug prevents running them

The presence of **property-based testing in only one project** is striking — the rest use example-based tests well, but none go after invariants the way sandcastle does.

### The "big function" antipattern is universal
Every project has 1-2 oversized functions. bmad has `runOrchestrator` (194 lines). gstack has `tavilySearch` (70 lines) and `compileWiki` (160 lines). superpowers has `claims.ts` (249 lines, 5 exports). gsd has 109-line max. Sandcastle is the only one without this — and that's largely because it has so little code in the agent layer. **Agent runtime loops are hard to keep small.**

### SOLID adherence is consistent (7-8 range)
The pattern: SRP and OCP are mostly respected at the module level; DIP is the weak spot. Only sandcastle uses ports/adapters rigorously (ESLint enforces it). The other four import concretes directly because at this scale the abstraction cost exceeds the swap-ability benefit.

---

## Ranked: code quality, ignoring everything else

| # | Project | Score | Headline reason |
|---|---|---|---|
| 🥇 | **gstack** | 8.0 | Library-grade tool factory + error classification + stdout-guard; production-tight on type safety and integrity. |
| 🥇 | **sandcastle** | 8.0 | DDD discipline that's genuine (property tests, branded types, DB-GRANT enforcement). Tied with gstack on a different axis. |
| 3 | **bmad** | 7.6 | Strong error envelope + concurrency safety + 18 real tests; weakened by one 194-line orchestrator. |
| 4 | **superpowers** | 7.5 | Best tool registry + deterministic compilation; weakened by silent error swallows and heuristic token counting. |
| 5 | **gsd** | 6.0 | Architecturally strongest of the cohort, but tests can't run because of a vitest config bug — penalty applied. |

---

## The two-axis picture

Combining this with the earlier completion analysis gives a cleaner read:

| | High completion | Low completion |
|---|---|---|
| **High code quality** | **gstack** (75% built, 8.0 quality) — best Pareto | **sandcastle** (15% built, 8.0 quality) — disciplined skeleton |
| **Medium code quality** | **superpowers** (70% built, 7.5 quality), **bmad** (18% built, 7.6 quality) | — |
| **Lower code quality** | **gsd** (55% built, 6.0 quality with broken tests) | — |

**The strongest signal**: the workflows that produced the most code (superpowers, gsd) are not the ones that produced the highest-quality code. The two best-quality codebases sit at opposite ends of the completion spectrum. Quality is independent of velocity, but inversely correlated with planning weight at the very top (sandcastle's 28 ADRs visibly purchased that 8.0).
