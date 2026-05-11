# Project Research Summary

**Project:** Business Strategy Planner
**Domain:** Single-user local multi-agent AI app — hybrid Karpathy wiki + OneBrain memory for investor-grade business plans
**Researched:** 2026-04-25
**Confidence:** HIGH

---

## Executive Summary

A personal, local-only AI agent that helps produce investor-grade business plans by combining two patterns that individually fall short: a Karpathy-style Obsidian wiki (great narrative navigation, breaks at scale and with multiple writers) and a structured Postgres research warehouse called OneBrain (durable, queryable, multi-agent safe, but no narrative artifact). The hybrid per Nate B Jones keeps Postgres as the durable source of truth and makes the wiki a compiled view that only one agent (the compilation agent) ever writes. Every strategic claim in the wiki traces back to a specific OneBrain row via a stable ULID. Contradictions are preserved, not smoothed. Every claim starts as a hypothesis and must earn higher confidence through evidence.

The recommended build approach is a hierarchical coordinator + five specialized sub-agents (research, ingest, financial-analysis, devil's-advocate, compilation) on top of the Claude Agent SDK. The coordinator faces the chat; sub-agents write to OneBrain or, in the compilation-agent-only case, to the vault. Write direction is one-way and enforced at the tool level: no agent other than the compilation agent has the `vault_write_atomic` tool. This single-writer constraint is the architectural keystone — without it the whole hybrid degrades back into the same failure modes as pure-wiki.

The three highest-severity risks are: (1) wiki producing confident misinformation from stale or insufficiently-hedged claims — mitigated by rendering confidence inline on every claim and using hedge-preserving prose constraints in the LLM prompt; (2) provenance chain breaks when claim IDs are deleted or mutated rather than superseded — mitigated by an append-only repo layer with no delete path; and (3) compilation agent nondeterminism causing recompile loops or silent skips — mitigated by hashing a canonical normalized form of each page and caching LLM intros keyed to their input hash. These three pitfalls are hybrid-pattern-specific; they cannot occur in pure-DB or pure-wiki systems. Building the hybrid correctly is the entire point.

---

## Stack (one-liner per layer)

- **Runtime:** Node.js 22 LTS + TypeScript 5.6
- **Orchestration:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.2.x) — coordinator + sub-agents via the `agents` parameter; `@anthropic-ai/sdk` 0.90.x for direct calls inside the compilation agent
- **Backend:** Hono 4.x — thinnest TS-first surface, streaming-first
- **Frontend:** React 19 + Vite 6 + `@assistant-ui/react` 0.12.x + Vercel AI SDK 6 transport — headless primitives, render confidence badges and tool-call traces
- **Database:** Postgres 16 + pgvector 0.8.2 (`pgvector/pgvector:pg16` Docker image) — one store for rows + HNSW vector index
- **Schema management:** `node-pg-migrate` is the source of truth; Drizzle ORM is query builder only (never schema owner)
- **Embeddings:** Voyage 3.5 (`voyageai` npm, `output_dimension=1024`) — ~14% retrieval lift over OpenAI text-embedding-3-large
- **Web research:** Tavily (`@tavily/core`) — `search_depth: advanced` + extract + crawl
- **Wiki retrieval:** `index.md` scan through Slice 4; `@tobilu/qmd` MCP server promoted in Slice 5 when vault exceeds ~50 pages
- **Markdown:** `gray-matter` + `unified`/`remark` for programmatic page rendering
- **Scheduling:** `node-cron` 4.2.x — in-process, no Redis, single-machine
- **Testing / evals:** Vitest 4.1.x + Promptfoo (Claude Agent SDK provider)
- **Local dev:** Docker Compose for Postgres + pgAdmin only; Node + Vite run on host

> Critical version note: `@anthropic-ai/claude-agent-sdk` is still 0.x — pin exact version, expect breaking changes between minors.

---

## Table-Stakes Features (must ship in v1)

**Memory / wiki layer:**
- Source ingestion (paste / file / URL) into OneBrain
- Atomic claim/finding rows with confidence + status (`hypothesis | tested | validated | refuted | superseded`)
- Stable ULIDs on every row; append-only (`supersede`, never delete)
- Wiki claims trace back to OneBrain rows (provenance edges)
- Compilation agent: read OneBrain → emit/update Obsidian markdown
- Single-writer-to-vault enforced at tool-permission level
- Contradictions preserved as Obsidian callouts, not smoothed away
- Confidence badges rendered inline on every wiki claim
- `index.md` and `log.md` per Karpathy spec

**Agent layer:**
- Chat UI surfaces wiki markdown chunks contextually
- Coordinator pushes back verbally on weak/unsourced claims (CLAUDE.md identity)
- Web research via Tavily, results land in OneBrain rows before any wiki update
- Manual "recompile" command from chat

**Business-planning surface (v1):**
- SWOT, STP, 4Ps, Porter's 5 Forces (classical positioning)
- Brand pyramid, positioning statement, voice/tone, messaging architecture (brand strategy)
- Jobs-to-be-done, customer journey, ICP, persona docs (JTBD/customer)
- Comprehensive marketing plan (composed from above)
- Comprehensive business plan (composed from above)
- Financial *analysis* as research evidence (unit economics, market sizing, comp benchmarks as OneBrain rows)

> Financial *projections* (three-statement model, scenario modeling) are explicitly v2+ toward the investor-grade north star.

---

## Differentiators (what makes this system specifically valuable)

1. **Defensibility-by-construction.** Every plan claim is wired to evidence in the schema, not added on top. Competitors (LivePlan, Bizplan, Plannit) generate plausible prose; this generates traceable prose.
2. **Contradictions preserved.** Most AI tools smooth disagreements into a single confident answer. This system surfaces "engineering says 12 weeks, sales promised 8" as a callout — that misalignment is the strategic signal.
3. **Hypothesis-first epistemics.** Every claim defaults to `hypothesis`; agent (and compilation) treat it as such until evidence promotes it.
4. **Devil's-advocate sub-agent (Slice 3+)** that uses `onebrain_search` before writing counter-claims — no pushback theater.
5. **Confidence-weighted synthesis.** Compilation can filter by confidence/freshness, exclude superseded items, surface stale claims.

---

## Top Pitfalls (highest severity)

| # | Pitfall | Mitigation | Phase |
|---|---------|-----------|-------|
| 1 | Wiki produces confident misinformation from stale claims | Hedge-preserving prose, mandatory inline confidence, contradiction blocks, stale banners | Slice 0 + Slice 2 |
| 2 | Provenance chain breaks (deleted/mutated claim IDs) | Append-only repo layer, no delete path, supersede-only, lint detects orphans | Slice 0 |
| 3 | Compilation idempotency bugs (recompile loops, silent skips) | Canonical content hash excluding `generated_at`, pinned LLM-intro temperature with input-hash cache, deterministic claim ordering | Slice 2 |
| 4 | Hallucinated quantitative claims without sourcing | Schema-level rule: numbers ≥ $1M / TAM-shaped patterns require `cites_source` edge before claim accepted | Slice 1 |
| 5 | Pushback theater (devil's-advocate writes strawmen) | Devil's-advocate must use `onebrain_search` before counter-claim; Promptfoo eval checks substantiation | Slice 3 |

Twenty pitfalls total in PITFALLS.md, all phase-mapped.

---

## Build Order (Slices 0–5)

Phase ordering is constrained: every later slice depends on artifacts the earlier slice produced.

| Slice | Goal | Key deliverables |
|-------|------|------------------|
| **0 — Walking Skeleton** | Prove ingest → OneBrain → compile → vault round-trip *without any agents*. Establish ID immutability, embedding dimension constant, schema-truth single source. | DB up, `sources` + `claims` + `compile_artifacts` tables, Voyage embeddings, deterministic page renderer, CLI driving one source → one page |
| **1 — Agents and Chat** | Smallest agentic slice with user value. | Coordinator + research sub-agent, Tavily search, assistant-ui chat, manual recompile command |
| **2 — Full Compilation** | Compilation hardening (this is where the hybrid pattern's IP lives). | Diff-based recompile, content-hash artifacts, node-cron schedule, source-added debounced auto-recompile, human-edit guard, paired backup of DB+vault |
| **3 — Multi-Agent Maturity** | Add ingest, financial, devil's-advocate sub-agents. **Promptfoo evals written before sub-agents ship.** | All five sub-agents, decisions table, contradiction edges, full eval suite |
| **4 — Wiki Maturity** | All framework renderers, lint pass. | Renderers for SWOT/STP/4Ps/Porter/brand/JTBD/persona/journey, lint detects orphans/stale/missing-evidence, UI confidence badges |
| **5 — Scale Tooling** | Trigger: vault > ~50 pages or felt slowness. | qmd MCP server attached to coordinator, optional Exa, observability |

> Slice 0 is non-obvious but critical. Eleven of the twenty pitfalls are prevented by getting the schema and write-discipline right *before* any agents enter the picture.

---

## Open Architectural Questions (defer to spike or phase research)

| Question | Why deferred | Resolve by |
|----------|--------------|-----------|
| LLM-intro caching strategy for compilation determinism | Needs experimentation with input-hash key shape | Slice 2 spike |
| Reconcile-script UX (turning hand-edits back into OneBrain rows) | User-flow design needed | Slice 2 phase research |
| Independent-source detection algorithm (for evidence weighting) | Heuristic ("same publisher / shared upstream report") sound, implementation needs spike | Slice 3 phase research |
| Visual regression testing for Obsidian markdown rendering | No headless Obsidian harness exists yet | Slice 4 phase research |
| qmd + Agent SDK 0.2.x MCP attachment | Promotion trigger only fires at scale | Slice 5 |
| Voyage vs OpenAI embeddings final call | Recommendation is Voyage; reversible (re-embed cheap) | Slice 0 if user prefers single API key |

---

## Confidence Assessment

| Dimension | Level | Reason |
|-----------|-------|--------|
| Stack | HIGH | Constraint analysis decisive; versions verified against official docs |
| Features | MEDIUM-HIGH | HIGH on competitor + Karpathy/Nate primary sources; MEDIUM on critical-agent patterns (emerging in 2026 literature) |
| Architecture | HIGH | Schema grounded in pgvector + Voyage docs; topology grounded in Agent SDK constraints + Anthropic "Building Effective Agents" |
| Pitfalls | HIGH | Hybrid + provenance + idempotency pitfalls are direct from primary sources; stack pitfalls verified against 2026 community reports |

**Overall: HIGH.** Ready for requirements definition and roadmap creation.
