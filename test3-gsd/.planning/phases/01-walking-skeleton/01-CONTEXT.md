# Phase 1: Walking Skeleton - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A CLI ingests one source, writes append-only OneBrain rows with embeddings, and the deterministic renderer compiles those rows into one Obsidian page with provenance — round-trip works end-to-end **without any agent or chat surface**. Phase 1 establishes the schema, append-only repo layer, deterministic renderer, content hash, contradiction-callout handling, and CLI driver. No agents, no Hono server, no chat, no Tavily — those start in Phase 2.

The architectural rationale: 11 of the 20 known pitfalls (provenance breaks, idempotency bugs, schema drift, premature LLM extraction quality issues) are prevented by getting schema and write-discipline right *before* any agents enter the picture.

</domain>

<decisions>
## Implementation Decisions

### CLI design & lifecycle

- **D-01:** Single binary `bsp` at `src/cli/index.ts`, exposed via `package.json` `bin` field. Subcommand-based architecture using `commander`.
- **D-02:** Phase 1 subcommands: `bsp ingest <url|file|--fixture <name>>`, `bsp compile`, `bsp db migrate`, `bsp db reset --confirm`.
- **D-03:** CLI persists across all phases as a thin wrapper over shared lib code. Same functions called by HTTP routes (Phase 2+) and agent tools (Phase 4+). CLI continues to exist for dev workflows, bulk import, scripted runs, paired-backup operations (COMP-15, Phase 3), `--full` recompile (Phase 3), and seeding fixtures.
- **D-04:** Re-ingest behavior on duplicate `raw_text_hash`: skip & report. Exit 0, print "already ingested as `<source_id>` on `<date>`", no new row, no Voyage API call. Idempotent by default; safe for scripts/CI.
- **D-05:** Output format defaults: human-readable table by default; `--json` flag for machine output; `-v` / `-vv` for verbosity.
- **D-06:** DB lifecycle: `bsp db migrate` only — no separate seed command. Fixtures invoked via `bsp ingest --fixture <name>` (one mental model: ingest).
- **D-07:** `bsp db reset --confirm` is an explicit dev operation that drops the schema, re-runs migrations, and clears `vault/`. Reframes the architectural tension: append-only invariants govern *live* DB writes, not whether the DB itself can be reset. In Phase 1, COMP-10 (single-writer-to-vault tool enforcement) hasn't materialized yet, so the CLI can clear `vault/` directly without crossing a tool-layer boundary. After reset, system is pristine — ready for real research.

### Source → claims extraction (no agents)

- **D-08:** Phase 1 extraction strategy: **test-fixture only**. Real claim rows are produced exclusively by `bsp ingest --fixture <name>`. Bare URL/file paths to `bsp ingest <input>` reject with a helpful error pointing to Phase 2 (research sub-agent) for real extraction. Rationale: avoids LLM dependency in the "no agents" phase; avoids schema landfill (chunked-as-claims) that would need supersedence in Phase 2; cleanest expression of "Slice 0 proves the pipeline, not extraction quality".
- **D-09:** Fixture content sourced from a real-world business strategy article — claude's discretion to choose the article during planning, optimizing for: contains naturally-contradicting positions on at least one point (so the fixture can include a `contradicts` edge), is publicly accessible (so the URL is durable), and covers a topic that maps cleanly to `topic_tags` and `framework_tags`.
- **D-10:** Fixture file format: TypeScript module at `src/cli/fixtures/<slug>.ts` exporting a typed object. Type-checked against `src/onebrain/types.ts`; IDE autocompletes claim/edge fields; evolves cleanly when schema changes.
- **D-11:** Fixture content shape (locked):
  - 1 `sources` row from a real strategy/business article (URL, title, author, published_at, raw_text)
  - 6–8 `claims` rows with varied `kind` (`fact`, `inference`, `hypothesis`), varied `confidence` (0.4 to 0.85)
  - 6–8 `cites_source` edges (every claim → source)
  - 1 `contradicts` edge between two claims that take opposing positions on the same point (exercises success criterion #4)
  - 2–3 `entities` rows (companies / segments mentioned) + matching `about_entity` edges
  - Real `topic_tags` and `framework_tags` so the renderer's grouping works
- **D-12:** Voyage embedding handling: live Voyage API call at ingest time. Fixture defines claim/source `text` only; embedding generated on insert via Voyage 3.5 `output_dimension=1024`. Matches Phase 2+ flow exactly so the lib code is reused. Vitest unit tests use a mockable seam — `embed()` is exposed as a function that `vi.mock()` replaces in unit suites; one integration test runs against real Voyage gated by `RUN_VOYAGE_TESTS=1` env var.

### Renderer / vault output

- **D-13:** Demo page kind: generic topic page at `vault/topics/<demo-slug>.md`. Avoids pre-empting Phase 5's 11 framework renderers (SWOT/STP/4Ps/Porter/etc.); matches ARCHITECTURE.md `topics/` directory ("cross-cutting topical syntheses"). Slug derived from the fixture's primary `topic_tag`.
- **D-14:** Phase 1 renderer scope: **demo topic page + `index.md` + `log.md` only**. Other vault page kinds (entity, source-stub, decision, framework) are placeholders / `NotImplementedError` stubs until their phases. Smallest Phase 1 blast radius; Phase 5 wires the framework renderers, Phase 4 wires the financial-claim rendering, etc.
- **D-15:** Page rendering shape (deterministic, no LLM):
  - **Frontmatter** follows the full ARCHITECTURE.md spec: `id` (page ULID), `kind`, `title`, `slug`, `generated_at`, `generated_by` (= `compilation-agent` even in Phase 1, for forward compatibility), `compile_run_id`, `content_hash`, `claim_ids[]`, `entity_ids[]`, `topic_tags[]`, `framework_tags[]`, `confidence_avg`, `confidence_min`, `contradictions` (count), `last_evidence_at`, `stale` (bool), `status_breakdown` (per-status counts).
  - **Body:** claims grouped by `topic_tag`; within each group, claims listed in **stable ULID order** (so content hash is stable across re-renders).
  - **Each claim** renders as a quote block per ARCHITECTURE.md pattern:
    ```markdown
    > <claim text>
    > — [[claim:01J9XABC]] confidence=0.85 status=hypothesis
    > — sources: [[source:01J9XSRC1]]
    ```
  - **Contradicting pairs** (per `edges.kind='contradicts'`) render inline as Obsidian `> [!warning] Contradiction` callouts at the position of the first contradicting claim in the topic group. Both claims show their confidence, status, and source citations. **Never silently smoothed.**
  - **No LLM intros / connective prose** in Phase 1 — that's COMP-06 in Phase 3.
- **D-16:** `index.md` is rebuilt from scratch on every compile, organized by page `kind` (Frameworks / Entities / Topics / Decisions / Sources). Phase 1 only populates the Topics section (one entry) plus a Sources section (one stub line per fixture source).
- **D-17:** `log.md` is append-only. Entries prefixed with `## [YYYY-MM-DD HH:MM] <kind> | <summary>` per Karpathy convention. Phase 1 logs three event kinds: `ingest`, `compile`, and `reset` (when `bsp db reset` runs, after which log.md is wiped — but the next `compile` writes a fresh entry).
- **D-18:** Content hash (COMP-07) is canonical sha256 over the rendered body **excluding** `generated_at`, `compile_run_id`, and any other run-time timestamps. Deterministic claim ordering by ULID ensures hash stability across runs with unchanged inputs (success criterion #4).

### Project structure & dev workflow

- **D-19:** Frontend skeleton (INFRA-05) is minimal: `src/ui/main.tsx` mounts React 19; `src/ui/App.tsx` renders `<h1>Business Strategy Planner</h1>` + a placeholder div. Vite 6 config wired (`vite.config.ts`). Phase 2 replaces `App.tsx` with the assistant-ui Thread + Composer. Phase 1 success criteria don't reference the frontend — this is pure scaffolding for Phase 2.
- **D-20:** Project structure: **single root `package.json`** per ARCHITECTURE.md diagram (not pnpm workspaces). Source layout: `src/{cli,server,agents,onebrain,compilation,ui,lib,eval}/`, `migrations/`, `vault/` at repo root. Workspaces are reversible later if/when OneBrain ever needs to be extracted as a published library — that's a v2+ concern.
- **D-21:** **Shared-types discipline** (architectural commitment): all Zod schemas and TypeScript types live in `src/onebrain/types.ts` as the **single source of truth**. No parallel type definitions in `src/ui/`, `src/server/`, `src/cli/`, or anywhere else. Frontend imports types from the same module the backend uses.
- **D-22:** TypeScript path aliases (`@/onebrain/*`, `@/lib/*`, `@/cli/*`, etc.) configured in `tsconfig.json` and mirrored in `vite.config.ts` `resolve.alias`. Both Vite (browser bundling) and `tsx` (Node runtime) resolve the same paths. This is what makes shared-types discipline ergonomic without workspaces.
- **D-23:** TypeScript configuration: a base `tsconfig.json` with shared compiler options + paths, extended by `tsconfig.node.json` (CLI / future server, target ES2024, module NodeNext) and `tsconfig.web.json` (UI, browser target, JSX react-jsx). Both reference the base via `extends`.
- **D-24:** npm scripts in Phase 1: `npm test` runs Vitest; `npm run migrate` aliases the migration runner (`node-pg-migrate up`); `npm run dev` runs Vite for the empty React skeleton (optional in Phase 1; primary in Phase 2). The `bsp` binary itself is invoked directly for ingest / compile / db operations.
- **D-25:** Lint / format toolchain: **ESLint + Prettier**. Sets the precedent for all later phases. Industry-standard rule sets for TS + React; mature tooling.

### Claude's Discretion

These details are within the locked decisions but the specific implementation is the planner/executor's call:

- The specific real-world article chosen for the fixture (must satisfy D-09's criteria)
- Exact `commander` command/option layout within its idioms
- Exact ESLint config (preset choice — recommended-type-checked, plugins for React, etc.) and Prettier config (line width, quotes, etc.)
- Exact tsconfig paths shape and extension keys (consistent with D-22)
- Postgres connection pooling strategy (likely `pg.Pool` via Drizzle's `node-postgres` adapter; not opinionated about size for Phase 1's single-user load)
- Drizzle schema-mirror file shape (must mirror migrations 1:1; review process when migrations change is a planner concern)
- ULID generation library choice (any well-maintained one — `ulid` npm package is the obvious pick)
- Vault page rendering details that don't violate the locked decisions: e.g., spacing between contradiction callouts and surrounding content, exact `>` quote formatting nuances, whether to include a "Status legend" footer on each page

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context (vision, requirements, hard commitments)
- `.planning/PROJECT.md` — Project vision, hard architectural commitments (write directionality, single writer to vault, append-only OneBrain, ULID identity, hypothesis-by-default, contradictions preserved, provenance enforced), key decisions table
- `.planning/REQUIREMENTS.md` §"v1 Requirements" — Phase 1 requirement definitions (INFRA-01/02/03/05/06/07, DATA-01..08/10, COMP-01..05/07/09, CRIT-02..06, EVAL-01)
- `.planning/REQUIREMENTS.md` §"Out of Scope" — explicit non-goals (no auth, no real-time collab, no production hosting, no mobile, no LangChain/LangGraph)
- `.planning/REQUIREMENTS.md` §"Traceability" — per-phase requirement mapping (28 requirements assigned to Phase 1)
- `.planning/ROADMAP.md` §"Phase 1: Walking Skeleton" — phase goal, dependencies (none — first phase), 5 success criteria, mapped requirements
- `.planning/STATE.md` — current project state, accumulated decisions, deferred items
- `CLAUDE.md` — Project instructions (loaded into every session); restates the hard architectural commitments and GSD workflow conventions

### Research (synthesized findings — read before planning)
- `.planning/research/SUMMARY.md` — Executive summary, stack one-liner per layer, table-stakes features, top pitfalls (5 named, 20 total), build order rationale (Slice 0 = Phase 1 prevents 11 pitfalls)
- `.planning/research/ARCHITECTURE.md` — System overview diagram, **recommended project structure** (matches D-20), **OneBrain schema** (sources / claims / entities / edges / decisions / tags / event_log / compile_runs / compile_artifacts with full DDL including ULID PKs, enum types, HNSW `m=16, ef_construction=64`, append-only / supersede-only invariants), **embedding strategy** (claims = `text + " — " + rationale`, sources = first 4k chars), **stable ID strategy** (ULID), **compilation agent design** (triggers, granularity, diff-based recompile, contradiction preservation), **vault structure** (frameworks / entities / topics / decisions / sources subdirs + index.md + log.md), **frontmatter convention** (full spec used by D-15), link conventions, **multi-agent topology** (hierarchical coordinator + 5 sub-agents — Phase 2+ context for understanding why Phase 1 has none), data flow diagrams
- `.planning/research/STACK.md` — Library version pins (Node 22 + TS 5.6, Hono 4.x, React 19 + Vite 6, Postgres 16 + pgvector 0.8.2, Voyage 3.5, Vitest 4.1.x, node-cron 4.2.x, gray-matter / unified / remark for markdown, Promptfoo); critical version notes (Claude Agent SDK 0.x — pin exact)
- `.planning/research/PITFALLS.md` — 20 known pitfalls phase-mapped; 11 are prevented by Phase 1's no-agents constraint (provenance breaks, idempotency bugs, schema drift, premature extraction quality, etc.) — Phase 1 MUST verify it actually prevents them
- `.planning/research/FEATURES.md` — Table-stakes feature analysis informing what later phases will need (useful for not painting Phase 1 into a corner)

### Reference inputs (the source patterns)
- `.planning/inputs/karpathy-llm-wiki-gist.md` — Karpathy's LLM wiki pattern: `index.md` content catalog, `log.md` chronological event log, "you never write the wiki yourself" stance — the pattern Phase 1's renderer implements
- `.planning/inputs/nate-b-jones-hybrid-transcript.md` — Hybrid wiki + warehouse interpretation: write-time vs query-time fork, contradiction preservation, single-writer compilation-agent design — the rationale for the architectural commitments

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1 is the **first phase of code work** in an otherwise empty repo. Directory state at start:
- `.git/`, `.planning/`, `.claude/` — planning + tooling only
- `CLAUDE.md` — project context at root
- `package-lock.json` — npm baseline (dependencies not yet installed; the manifest is empty)
- No `src/`, no `migrations/`, no `vault/`, no `docker-compose.yml`, no `package.json`, no `tsconfig.json`, no `.env`

There are no existing components, hooks, or utilities to reuse. Phase 1 creates the entire baseline.

### Established Patterns

None in code yet. The patterns Phase 1 establishes (and that all later phases inherit):
- Single-source-of-truth Zod schemas in `src/onebrain/types.ts` (D-21)
- TS path aliases mirrored in Vite (D-22)
- `bsp` CLI as thin wrapper over shared lib code (D-03)
- Append-only repository pattern with no delete path (architectural commitment)
- ULID as stable PK (architectural commitment)
- Deterministic content hashing for compile idempotency (D-18)
- ESLint + Prettier for lint/format (D-25)

### Integration Points

Phase 1 produces the integration points that later phases plug into:
- `src/onebrain/repo.ts` — exports CRUD functions consumed by Phase 2's HTTP routes, Phase 4's ingest sub-agent tool wrappers
- `src/onebrain/types.ts` — exports types consumed by all future code (server, agents, UI)
- `src/onebrain/embed.ts` — Voyage embedding wrapper consumed by all writers
- `src/compilation/render/page.ts` (or analog) — page renderer consumed by Phase 2's `bsp compile` and Phase 3's compilation sub-agent
- `src/compilation/runner.ts` — compile entry point invoked by `bsp compile` in Phase 1, by `POST /recompile` in Phase 2, by `node-cron` in Phase 3, by the compilation sub-agent in Phase 2+
- `src/cli/index.ts` — `bsp` binary entry; Phase 2+ adds new subcommands here

</code_context>

<specifics>
## Specific Ideas

- **"Curated from a real-world article for maximum realism."** The fixture isn't synthetic — it's a real strategy/business article the user could plausibly read and want to capture. This grounds Phase 1's verification in the actual feel of the working system.
- **Binary name "bsp"** chosen after checking that "briefcase" is taken on npm. Short, project-coded, easy to type.
- **Shared-types discipline as architectural keystone, not just a convention.** The user pushed for shared types between frontend and backend; the resolution wasn't workspaces — it was a first-class commitment that `src/onebrain/types.ts` is the single source of truth, enforced by tsconfig path aliases mirrored in Vite. This pattern is locked for the whole project, not just Phase 1.
- **The reframing of `bsp db reset`:** "Append-only governs *writes within a live database*, not whether the database itself can be reset. `git reset --hard` doesn't violate 'commits are immutable' — it discards your local copy. Same here." This understanding distinguishes operational invariants from meta-operations and resolves the demo-cleanup tension cleanly.
- **The renderer must NEVER smooth contradictions.** The fixture's `contradicts` edge is the test that the architectural commitment holds in code. If success criterion #4's contradiction callout doesn't render, Phase 1 is not done.

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion but belong in later phases. Captured here so they're not lost.

- **Plan / workspace separation** (multi-plan support via `claims.business_plan_id`) — schema's `business_plan_id` is already nullable, so the column exists from Phase 1. Plan-aware filtering / switching UX is deferred to v2+ if/when multi-plan emerges as a real need (e.g., the user runs the system for multiple business ideas in parallel).
- **Direct Anthropic SDK call for one-shot claim extraction in the CLI** (Area B option 3) — replaced by the research sub-agent in Phase 2 and the ingest sub-agent in Phase 4. The lib seam (`extractClaimsFromText(text)`) can be added when those agents land; Phase 1 has no need.
- **Deterministic chunking → claims** (Area B option 2) — the chunked-claims-as-landfill problem made this a non-starter for Phase 1. If a non-LLM extraction path is ever needed (CI smoke test that doesn't need API keys), it could be added later as `bsp ingest --chunked` for that specific use case.
- **Framework-shaped page renderers** (SWOT, STP, 4Ps, Porter's 5 Forces, brand pyramid, positioning statement, voice/tone, messaging architecture, JTBD, customer journey, ICP, persona) — Phase 5 (STRAT-01..11). Phase 1's generic topic-page renderer establishes the rendering pattern they specialize.
- **Source stub renderer** (`vault/sources/source-<id>.md`) — deferred to Phase 2 when the research sub-agent starts ingesting real sources at volume. Phase 1's `index.md` lists fixture sources without dedicated stub pages.
- **Entity page renderer** (`vault/entities/<entity>.md`) — deferred to Phase 2/3 when entities accumulate from real research.
- **Decision page renderer** (`vault/decisions/<date>-<slug>.md`) — deferred to Phase 2+ when the user starts recording decisions through the chat coordinator.
- **LLM intros / connective prose** (COMP-06) — Phase 3. Phase 1 renders pure deterministic markdown.
- **Diff-based recompile** (COMP-08) — Phase 3. Phase 1's `bsp compile` always rebuilds the demo page (the content_hash check still applies — write skipped if hash unchanged — but the *plan* is whole-vault).
- **Scheduled recompile via node-cron** (COMP-12) — Phase 3.
- **Source-added debounced auto-recompile** (COMP-13) — Phase 3.
- **Human-edit guard** (COMP-14) — Phase 3.
- **Paired backup of OneBrain DB + vault** (COMP-15) — Phase 3. Will be added as `bsp backup` / `bsp restore` subcommands per D-03's persistent-CLI trajectory.
- **Hono server, chat UI, agents** — Phase 2.
- **Promptfoo evaluation suite** (EVAL-02/03) — Phase 4.
- **Confidence badges in UI** (UI-05), **lint pass for orphans / broken provenance / stale claims** (EVAL-05) — Phase 5.
- **pnpm workspaces** — reversible later if OneBrain extracts as a published library; not a Phase 1 concern.
- **Headless Obsidian visual regression testing** — out of scope for v1 (no harness exists yet per ARCHITECTURE.md note); v2 if needed.

</deferred>

---

*Phase: 01-walking-skeleton*
*Context gathered: 2026-04-25*
