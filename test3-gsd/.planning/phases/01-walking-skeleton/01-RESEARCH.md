# Phase 1: Walking Skeleton - Research

**Researched:** 2026-04-25
**Domain:** Local Postgres + pgvector + deterministic markdown renderer + CLI driver (no agents, no chat, no HTTP)
**Confidence:** HIGH on stack versions and architecture (verified against npm registry + official docs), HIGH on append-only / hash determinism patterns, MEDIUM on a small number of UX details delegated to planner discretion (commander surface, Drizzle-mirror review process).

---

## Executive Summary

Phase 1 is the **first Slice** in a 5-phase project. It builds an empty repo into a working CLI (`bsp`) that ingests a TypeScript fixture, writes append-only OneBrain rows (sources, claims, edges, entities) with Voyage 3.5 embeddings into Postgres+pgvector, and deterministically renders one Obsidian topic page with full provenance frontmatter — round-trip stable across runs (same content_hash). No agents, no Hono server, no chat, no Tavily.

The phase is heavy on foundational decisions that propagate to every later phase: schema (node-pg-migrate as truth, Drizzle as query-only mirror), append-only repo discipline (no `delete` function exists in the API surface; supersede via edges), embedding seam (`embed()` is mockable for unit tests, real Voyage gated by `RUN_VOYAGE_TESTS=1`), single-binary-with-subcommands CLI (`bsp ingest --fixture <name>`, `bsp compile`, `bsp db migrate`, `bsp db reset --confirm`), shared-types via TS path aliases mirrored in vite.config.ts, and a content-hash that excludes `generated_at` / `compile_run_id` so re-renders produce identical hashes.

**Primary recommendation:** Build the schema first (migrations + Drizzle mirror), then the repo with append-only enforcement at the TypeScript surface (no `delete()` exported), then the renderer (deterministic, stable ULID ordering, contradictions-as-callouts), then the CLI surface as a thin wrapper. Write the fixture last — once types are stable. Add a single `RUN_VOYAGE_TESTS=1` integration test for the live Voyage path; everything else mocks `embed()`. Eleven of the twenty known pitfalls are *prevented* by getting the schema, ID-immutability, and write-discipline right in this phase — verify each prevention with a test.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CLI design & lifecycle:**
- **D-01:** Single binary `bsp` at `src/cli/index.ts`, exposed via `package.json` `bin` field. Subcommand-based via `commander`.
- **D-02:** Phase 1 subcommands: `bsp ingest <url|file|--fixture <name>>`, `bsp compile`, `bsp db migrate`, `bsp db reset --confirm`.
- **D-03:** CLI persists across all phases as a thin wrapper over shared lib code. Same functions called by HTTP routes (Phase 2+) and agent tools (Phase 4+).
- **D-04:** Re-ingest on duplicate `raw_text_hash`: skip & report. Exit 0, print "already ingested as `<source_id>` on `<date>`", no new row, no Voyage API call.
- **D-05:** Output: human-readable table by default; `--json` for machine output; `-v` / `-vv` for verbosity.
- **D-06:** DB lifecycle: `bsp db migrate` only — no separate seed command. Fixtures invoked via `bsp ingest --fixture <name>`.
- **D-07:** `bsp db reset --confirm` drops the schema, re-runs migrations, and clears `vault/` (explicit dev operation).

**Source → claims extraction (no agents):**
- **D-08:** Phase 1 extraction strategy: **test-fixture only**. Bare URL/file paths reject with a helpful error pointing to Phase 2.
- **D-09:** Fixture content sourced from a real-world business strategy article (Claude's discretion to choose).
- **D-10:** Fixture file format: TypeScript module at `src/cli/fixtures/<slug>.ts` exporting a typed object.
- **D-11:** Fixture content shape (locked): 1 source + 6–8 claims (varied kind/confidence) + 6–8 cites_source edges + 1 contradicts edge + 2–3 entities + about_entity edges + real topic_tags + framework_tags.
- **D-12:** Voyage embedding handling: live Voyage API call at ingest time. Mockable seam — `embed()` exposed as a function that `vi.mock()` replaces in unit suites; one integration test runs against real Voyage gated by `RUN_VOYAGE_TESTS=1`.

**Renderer / vault output:**
- **D-13:** Demo page kind: generic topic page at `vault/topics/<demo-slug>.md`.
- **D-14:** Phase 1 renderer scope: **demo topic page + `index.md` + `log.md` only**. Other vault page kinds are placeholders / `NotImplementedError` stubs.
- **D-15:** Page rendering shape: full ARCHITECTURE.md frontmatter spec; body = claims grouped by `topic_tag`, stable ULID order; each claim as a quote block; contradicting pairs as inline `> [!warning] Contradiction` callouts; **no LLM intros** (that's Phase 3 / COMP-06).
- **D-16:** `index.md` rebuilt from scratch every compile; Phase 1 populates Topics + Sources sections.
- **D-17:** `log.md` is append-only with `## [YYYY-MM-DD HH:MM] <kind> | <summary>` prefix; logs `ingest`, `compile`, `reset` events.
- **D-18:** Content hash = canonical sha256 over rendered body **excluding** `generated_at`, `compile_run_id`, and other run-time timestamps. Deterministic claim ordering by ULID.

**Project structure & dev workflow:**
- **D-19:** Frontend skeleton minimal: `src/ui/main.tsx` mounts React 19; `src/ui/App.tsx` renders `<h1>Business Strategy Planner</h1>` + placeholder div. Vite 6 wired.
- **D-20:** Project structure: **single root `package.json`** (not pnpm workspaces). Source layout: `src/{cli,server,agents,onebrain,compilation,ui,lib,eval}/`, `migrations/`, `vault/` at repo root.
- **D-21:** **Shared-types discipline**: all Zod schemas and TS types live in `src/onebrain/types.ts` as the single source of truth.
- **D-22:** TS path aliases (`@/onebrain/*`, `@/lib/*`, etc.) configured in `tsconfig.json` and mirrored in `vite.config.ts` `resolve.alias`.
- **D-23:** TS configuration: base `tsconfig.json` + `tsconfig.node.json` (CLI/server, ES2024, NodeNext) + `tsconfig.web.json` (UI, browser, JSX react-jsx).
- **D-24:** npm scripts in Phase 1: `npm test` (Vitest), `npm run migrate` (`node-pg-migrate up`), `npm run dev` (Vite, optional). The `bsp` binary is invoked directly.
- **D-25:** Lint/format: **ESLint + Prettier**.

### Claude's Discretion
- The specific real-world article for the fixture (must satisfy D-09's criteria)
- Exact `commander` command/option layout
- Exact ESLint config (preset choice — `recommended-type-checked` likely + plugins for React) and Prettier config
- Exact tsconfig paths shape
- Postgres connection pooling strategy (likely `pg.Pool` via Drizzle's `node-postgres` adapter)
- Drizzle schema-mirror file shape (must mirror migrations 1:1)
- ULID generation library choice (`ulid` npm package is the obvious pick)
- Vault page rendering nuances (callout spacing, exact `>` quote formatting, optional status-legend footer)

### Deferred Ideas (OUT OF SCOPE)
- Plan/workspace separation (multi-plan via `claims.business_plan_id`) — column exists nullable from Phase 1, UX deferred to v2+
- Direct Anthropic SDK extraction in CLI — replaced by research/ingest sub-agents in Phase 2/4
- Deterministic chunking → claims — non-starter for Phase 1
- Framework-shaped page renderers (SWOT/STP/4Ps/Porter/etc.) — Phase 5
- Source / entity / decision page renderers — Phase 2/3 as data accumulates
- LLM intros / connective prose (COMP-06) — Phase 3
- Diff-based recompile (COMP-08), node-cron (COMP-12), source-added debounce (COMP-13), human-edit guard (COMP-14), paired backup (COMP-15) — Phase 3
- Hono server, chat UI, agents — Phase 2
- Promptfoo evals — Phase 4
- pnpm workspaces — reversible later; not Phase 1
- Headless Obsidian visual regression — v2+
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Local Postgres 16 + pgvector + pgAdmin via Docker Compose | §"Postgres + pgvector + Docker Compose" — `pgvector/pgvector:pg16` image (HIGH), `dpage/pgadmin4` with env-var auth |
| INFRA-02 | Node.js 22 + TypeScript 5.6 project structure | §"Stack" — Node 22.20.0 verified locally, TS 5.6+ per stack pins |
| INFRA-03 | node-pg-migrate is schema source of truth; Drizzle query-only | §"node-pg-migrate" — supports both .sql and .ts migrations; Drizzle as query mirror via `drizzle-kit pull` after migrate |
| INFRA-05 | React 19 + Vite 6 frontend skeleton | §"Vite 6 + React 19 minimal scaffold" — minimal `<h1>` per D-19 |
| INFRA-06 | Vitest 4 configured for unit + integration tests | §"Vitest 4.1.x setup" — projects/tags split for unit vs integration; `RUN_VOYAGE_TESTS=1` gating |
| INFRA-07 | API-key configuration via `.env` | §"Security Domain" — dotenv + zod-validated env loader; .env.example committed |
| DATA-01 | `sources` table | §"OneBrain schema in migrations" — DDL from ARCHITECTURE.md |
| DATA-02 | `claims` table with confidence + status | §"OneBrain schema" — DDL with `numeric(3,2)` confidence, `claim_status` enum |
| DATA-03 | `entities` table | §"OneBrain schema" — DDL with kind enum |
| DATA-04 | `edges` table (cites_source, supports, contradicts, supersedes, evidence_of) | §"OneBrain schema" — polymorphic edges with `kind` enum |
| DATA-05 | ULID stable IDs, immutable | §"ULID generation" — `ulid` npm 3.0.2; app-side generation; no `updateClaimId()` exists in repo |
| DATA-06 | Append-only repository pattern (no delete; supersede-only) | §"Append-only enforcement" — repo exports no `delete*()`; only `supersede(oldId, newClaim)` |
| DATA-07 | `vector(1024)` column on claims, HNSW index (m=16, ef_construction=64) | §"pgvector HNSW" — verified syntax; iterative_scan available in 0.8+ |
| DATA-08 | Voyage 3.5 embedding integration with constant output_dimension | §"Voyage 3.5 client" — voyageai 0.2.1 SDK; `output_dimension=1024` |
| DATA-10 | Tag/category model with controlled vocabulary | §"OneBrain schema" — `tags` table as soft registry; canonicalize at write time |
| COMP-01 | Obsidian vault directory layout | §"Vault layout" — `vault/{topics,frameworks,entities,decisions,sources}/` + `index.md` + `log.md` (Phase 1 creates dirs as needed) |
| COMP-02 | Wiki page frontmatter convention | §"Frontmatter spec" — full ARCHITECTURE.md spec via gray-matter |
| COMP-03 | Auto-maintained content catalog (`index.md`) | §"index.md renderer" — rebuilt from scratch each compile (D-16) |
| COMP-04 | Auto-appended chronological event log (`log.md`) | §"log.md renderer" — append-only with Karpathy prefix (D-17) |
| COMP-05 | Deterministic TS page renderer (claims → markdown) | §"Deterministic markdown renderer" — gray-matter + unified/remark; stable ULID ordering |
| COMP-07 | Canonical content hash (excludes timestamps/run-ids) | §"Content hash strategy" — sha256 over normalized body; explicit exclusion list |
| COMP-09 | Contradictions as Obsidian callouts, never smoothed | §"Contradiction rendering" — inline `> [!warning] Contradiction` at first contradicting claim |
| CRIT-02 | Every claim defaults to `status = hypothesis` on creation | §"Append-only enforcement" — DB column default + repo validation; impossible to omit |
| CRIT-03 | Confidence (0.00–1.00) required on every claim row | §"Schema constraints" — `numeric(3,2) NOT NULL`; Zod range `[0,1]` |
| CRIT-04 | Compilation surfaces low-confidence and stale claims with banners | §"Renderer freshness/confidence display" — frontmatter `confidence_avg/min`, `stale: bool`; inline confidence per claim |
| CRIT-05 | Contradictions preserved as callouts; never auto-resolved | §"Contradiction rendering" — same as COMP-09 |
| CRIT-06 | Hypothesis promotion requires explicit evidence edge | §"Status promotion guard" — repo's `promoteClaimStatus()` requires edge ID parameter |
| EVAL-01 | Vitest unit + integration tests (db, repos, renderer) | §"Validation Architecture" — full per-requirement test plan |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition | Migrations (`migrations/*.sql`) | — | node-pg-migrate is the SOURCE OF TRUTH per INFRA-03 / project constraint. Drizzle mirror is a typed read of this. |
| Schema query types | TypeScript layer (`src/onebrain/schema.ts` Drizzle mirror) | — | Drizzle is query-only; types must mirror migrations 1:1 (regenerable via `drizzle-kit pull`). |
| Domain validation (confidence range, claim text shape) | TypeScript layer (`src/onebrain/types.ts` Zod) | DB layer (CHECK constraints) | Belt + suspenders: Zod fails fast at the API boundary; CHECK is the absolute backstop. |
| Embedding generation | TypeScript layer (`src/onebrain/embed.ts`) | — | Synchronous on write; `embed()` is the single mockable seam (D-12). |
| Repository operations (writeClaim, supersede) | TypeScript layer (`src/onebrain/repo.ts`) | DB transaction | Single coercive boundary; transactions enforce atomicity of claim+edge+event_log writes. |
| Append-only enforcement | TypeScript surface (no `delete*` exported) | — | The discipline is at the API surface, not in the DB. The DB *can* DELETE; the repo simply does not expose it. |
| ULID generation | TypeScript layer (`src/onebrain/ids.ts`, wrapping `ulid` npm) | — | App-side generation per ARCHITECTURE.md — no DB round-trip; sortable; URL-safe. |
| Page rendering (markdown emit) | TypeScript layer (`src/compilation/render/page.ts`) | — | Pure function: claims+edges → markdown string. Deterministic. No LLM in Phase 1. |
| Frontmatter emit | TypeScript layer (`gray-matter` + custom YAML emit) | — | Stable key order; YAML serialization deterministic per gray-matter spec. |
| Atomic vault file writes | TypeScript layer (`src/compilation/vault-writer.ts`) | OS atomic rename | Write to temp file + `fs.rename` for atomicity. Single function. |
| Content hashing | TypeScript layer (`src/lib/hash.ts`) | — | sha256 over normalized markdown (frontmatter sans `generated_at`/`compile_run_id` + body). |
| CLI parsing & dispatch | TypeScript layer (`src/cli/index.ts` via commander) | — | Thin wrapper; all logic delegates to lib code (D-03). |
| Frontend bundle | Browser (Vite 6 + React 19) | — | Phase 1 = empty `<h1>` only (D-19). |

---

## Standard Stack

### Core (Phase 1 must install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node` | 22.20.0 LTS | Runtime | [VERIFIED: locally] — required by INFRA-02; LTS through 2027; native ESM/fetch/test runner. |
| `typescript` | 5.6.x | Type system | [CITED: STACK.md] — required by INFRA-02; matches Vite 6 / tsx 4 / Drizzle. |
| `pg` | 8.20.0 | Postgres driver | [VERIFIED: npm view pg version → 8.20.0] — used by both node-pg-migrate and Drizzle's node-postgres adapter. |
| `node-pg-migrate` | 8.0.4 | Schema migrations (source of truth) | [VERIFIED: npm view node-pg-migrate version → 8.0.4] — INFRA-03 hard requirement. |
| `drizzle-orm` | 0.45.2 | Type-safe query builder (query-only mirror) | [VERIFIED: npm view drizzle-orm version → 0.45.2] — types over node-pg-migrate-managed schema. |
| `drizzle-kit` | latest (devDep) | Used ONLY for `drizzle-kit pull` to regenerate schema mirror after migrations | [CITED: PITFALLS.md P4] — `drizzle-kit push` is FORBIDDEN. |
| `voyageai` | 0.2.1 | Voyage 3.5 embedding SDK | [VERIFIED: npm view voyageai version → 0.2.1, MIT, dep: node-fetch ^2.7.0] — Voyage 3.5 default `output_dimension=1024`. |
| `ulid` | 3.0.2 | ULID generator | [VERIFIED: npm view ulid version → 3.0.2, MIT, no deps] — D-CD chooses this; lexicographically sortable. |
| `commander` | 14.0.3 | CLI subcommand router | [VERIFIED: npm view commander version → 14.0.3] — D-01.2; mature, well-typed. |
| `gray-matter` | 4.0.3 | YAML frontmatter parse/emit | [VERIFIED: npm view gray-matter version → 4.0.3] — for COMP-02 frontmatter. |
| `unified` | 11.0.5 | Markdown processor pipeline | [VERIFIED: npm view unified version → 11.0.5] — composes remark plugins. |
| `remark-parse` | 11.0.0 | Parse markdown → mdast | [VERIFIED: npm view remark-parse version → 11.0.0] — pair with stringify if roundtripping. |
| `remark-stringify` | 11.0.0 | Serialize mdast → markdown | [VERIFIED: npm view remark-stringify version → 11.0.0] — for clean emit. |
| `zod` | 4.3.6 | Schema validation | [VERIFIED: npm view zod version → 4.3.6] — D-21 single source of truth for types. |
| `dotenv` | 16.x | Env var loading | [CITED: STACK.md] — INFRA-07. |
| `pino` | 9.x | Structured logging | [CITED: STACK.md] — used by repo writes; verbose under `-vv`. |

### Dev Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `tsx` | 4.21.0 | TS execution for `bsp` binary in dev | [VERIFIED: npm view tsx version → 4.21.0] |
| `vitest` | 4.1.5 | Unit + integration tests | [VERIFIED: npm view vitest version → 4.1.5] |
| `@vitest/ui` | 4.1.x | Watch mode UI (optional) | [CITED: STACK.md] |
| `vite` | 6.x | Frontend bundler | [CITED: STACK.md] |
| `@vitejs/plugin-react` | latest | React 19 plugin | [CITED: STACK.md] |
| `@types/node` | latest | Node type defs | [CITED: STACK.md] |
| `@types/pg` | latest | pg type defs | [CITED: STACK.md] |
| `@types/react`, `@types/react-dom` | 19.x | React 19 type defs | [CITED: STACK.md] |
| `eslint` + `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` + `eslint-plugin-react` | latest | Lint stack | [CITED: D-25] — `recommended-type-checked` preset suggested by Claude's Discretion. |
| `prettier` | latest | Format | [CITED: D-25] |

### Frontend (Phase 1 minimal)

| Library | Version | Purpose |
|---------|---------|---------|
| `react`, `react-dom` | 19.x | UI runtime | [CITED: STACK.md, D-19] |

> Phase 2+ adds `@assistant-ui/react`, `ai`, `@ai-sdk/anthropic`, `hono`, `@hono/node-server`, Tavily, Claude Agent SDK. **Do not install in Phase 1.**

### Installation (verified versions)

```bash
npm install \
  pg@8.20.0 \
  node-pg-migrate@8.0.4 \
  drizzle-orm@0.45.2 \
  voyageai@0.2.1 \
  ulid@3.0.2 \
  commander@14.0.3 \
  gray-matter@4.0.3 \
  unified@11.0.5 remark-parse@11.0.0 remark-stringify@11.0.0 \
  zod@4.3.6 \
  dotenv \
  pino \
  react@19 react-dom@19

npm install -D \
  typescript@5.6 \
  tsx@4.21.0 \
  vitest@4.1.5 @vitest/ui@4.1.5 \
  vite@6 @vitejs/plugin-react \
  drizzle-kit \
  @types/node @types/pg @types/react @types/react-dom \
  eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react \
  prettier
```

### Alternatives Considered

| Standard Choice | Alternative | Why Standard Wins for Phase 1 |
|-----------------|-------------|-------------------------------|
| Raw `.sql` migrations | JS/TS migrations with `pgm.createTable()` helpers | [VERIFIED: WebSearch] — node-pg-migrate supports BOTH via `--migration-file-language sql\|js\|ts`. ARCHITECTURE.md uses `.sql` style; recommended for Phase 1 because: pgvector extension setup needs raw SQL, custom types (enums) are clearer in raw SQL, and the schema is fixed. **Caveat:** raw SQL files lack JS-helper-generated `down()`. For Phase 1 we accept this — `bsp db reset --confirm` exists for dev rollback. If a later migration needs reversibility, switch THAT migration to .ts. |
| `commander` | `cac` | [CITED: D-01.2] — locked. |
| `ulid` | `nanoid`, `cuid2`, `uuidv7` | [CITED: D-CD] — `ulid` chosen because lexicographically sortable AND short enough for `[[claim:01J9XABC]]` markdown links. UUIDv7 is a credible alternative but ULID has more mindshare in the JS ecosystem. |
| `voyageai` | OpenAI text-embedding-3-large | [CITED: STACK.md] — Voyage tops 2026 RTEB; ~14% retrieval lift. Locked by stack research. |
| `gray-matter` + `unified`/`remark` | string concatenation | [CITED: PITFALLS.md P14] — string-cat invites Obsidian markdown corruption (callouts, wikilinks). gray-matter handles YAML frontmatter; remark handles markdown body emit safely. |
| Single root `package.json` | pnpm workspaces | [CITED: D-20] — locked after pushback discussion in DISCUSSION-LOG.md D2. |

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────┐
                    │  USER (terminal)                      │
                    │  $ bsp ingest --fixture acme-pricing  │
                    │  $ bsp compile                        │
                    │  $ bsp db migrate                     │
                    │  $ bsp db reset --confirm             │
                    └─────────────────┬────────────────────┘
                                      │ commander dispatch
                                      ▼
              ┌───────────────────────────────────────────┐
              │  src/cli/index.ts (commander router)      │
              │   - thin wrapper; ALL logic in lib code   │
              └────────┬──────────┬───────────┬───────────┘
                       │          │           │
        ┌──────────────┘          │           └──────────────┐
        ▼                          ▼                          ▼
 ┌─────────────┐         ┌──────────────┐           ┌─────────────────┐
 │ ingest path │         │ compile path │           │ db path         │
 │  resolve    │         │  read repo   │           │  npm-pg-migrate │
 │  fixture    │         │  render page │           │  spawn / API    │
 └──────┬──────┘         └──────┬───────┘           └────────┬────────┘
        │                       │                            │
        │ writes via repo       │ reads via repo             │ reset:
        ▼                       │                            │   drop schema
 ┌──────────────────────────────┼────────────────┐           │   rerun migrate
 │ src/onebrain/repo.ts (TX-wrapped)              │          │   clear vault/
 │  - writeSource(s) → embed → INSERT             │          ▼
 │  - writeClaim(c) → embed → INSERT + edges      │  postgres (Docker)
 │  - writeEdge(e) → INSERT                       │
 │  - writeEntity(e) → embed → INSERT             │
 │  - supersede(oldId, newClaim) → INSERT new +   │
 │    UPDATE old.status='superseded'+edge         │
 │  - find* (read functions)                      │
 │  ┌─────────────────────────────────────────┐  │
 │  │ NO delete*() functions exported         │  │  ◄── append-only enforced at API surface
 │  └─────────────────────────────────────────┘  │
 └─────────────┬─────────────────┬───────────────┘
               │ embed()         │ Drizzle queries
               ▼                 ▼
       ┌──────────────┐    ┌─────────────────────────────────┐
       │ src/onebrain │    │  postgres (Docker compose)      │
       │ /embed.ts    │    │  pgvector/pgvector:pg16         │
       │ MOCKABLE in  │    │  - sources, claims, entities    │
       │ vi.mock()    │    │  - edges, decisions, tags       │
       └──────┬───────┘    │  - event_log, compile_runs,     │
              │            │    compile_artifacts             │
              ▼            │  - HNSW index on claims.emb     │
       ┌──────────────┐    └─────────────────────────────────┘
       │ Voyage API   │
       │ (live; 1024  │
       │  dim default)│
       └──────────────┘

   compile path detail:
        │
        ▼
 ┌──────────────────────────────────────────────────────┐
 │ src/compilation/runner.ts                            │
 │   1. read all claims/edges/entities/sources          │
 │   2. group claims by topic_tag                       │
 │   3. for each topic group → renderTopicPage()        │
 │   4. compute hash, write atomically (only if diff)   │
 │   5. rebuild index.md from page list                 │
 │   6. append entry to log.md                          │
 │   7. INSERT compile_runs + compile_artifacts rows    │
 └────────────┬─────────────────────────────────────────┘
              │
              ▼
 ┌──────────────────────────────────────────────────────┐
 │ vault/ (Obsidian-readable filesystem)                │
 │  vault/topics/<demo-slug>.md                         │
 │  vault/index.md                                      │
 │  vault/log.md                                        │
 └──────────────────────────────────────────────────────┘
```

### Recommended Project Structure (Phase 1 scope)

```
.
├── CLAUDE.md                        # already exists
├── README.md                        # NEW — minimal "how to run Phase 1"
├── docker-compose.yml               # postgres + pgadmin only
├── .env.example                     # NEW — VOYAGE_API_KEY=, DATABASE_URL=, PGADMIN_DEFAULT_*=
├── .env                             # gitignored
├── .gitignore                       # add .env, node_modules, dist, vault/.obsidian
├── package.json                     # bin: { bsp: "./dist/cli/index.js" }; scripts: test, migrate, dev
├── package-lock.json                # NEW commit after npm install
│
├── tsconfig.json                    # base — paths, strict, target ES2024
├── tsconfig.node.json               # extends base; module NodeNext (CLI/migrations)
├── tsconfig.web.json                # extends base; module ESNext, jsx react-jsx (Vite UI)
├── vite.config.ts                   # NEW — resolve.alias mirrors tsconfig paths
├── vitest.config.ts                 # NEW — projects: unit + integration; setup file
├── .eslintrc.cjs / eslint.config.js # NEW — TS + React preset
├── .prettierrc                      # NEW
│
├── migrations/                      # node-pg-migrate (SOURCE OF TRUTH)
│   ├── 1700000000000_pgvector_extension.sql
│   ├── 1700000000001_enums.sql                  # claim_status, claim_kind, edge_kind, source_kind, entity_kind
│   ├── 1700000000002_sources.sql
│   ├── 1700000000003_claims.sql
│   ├── 1700000000004_entities.sql
│   ├── 1700000000005_edges.sql
│   ├── 1700000000006_decisions_tags_event_log.sql
│   └── 1700000000007_compile_runs_artifacts.sql
│
├── src/
│   ├── cli/
│   │   ├── index.ts                 # commander entry; dispatches subcommands
│   │   ├── commands/
│   │   │   ├── ingest.ts            # bsp ingest subcommand
│   │   │   ├── compile.ts           # bsp compile subcommand
│   │   │   ├── db-migrate.ts        # bsp db migrate subcommand
│   │   │   └── db-reset.ts          # bsp db reset subcommand
│   │   └── fixtures/
│   │       ├── index.ts             # fixture registry: { 'acme-pricing': fixture }
│   │       └── <slug>.ts            # the actual fixture (D-09 chosen during planning)
│   │
│   ├── onebrain/
│   │   ├── types.ts                 # Zod schemas + inferred TS types (D-21 SSOT)
│   │   ├── schema.ts                # Drizzle table definitions (mirror; regen via drizzle-kit pull)
│   │   ├── ids.ts                   # ulid() wrapper; never modifies existing IDs
│   │   ├── embed.ts                 # Voyage 3.5 wrapper; export { embed }; MOCKABLE
│   │   ├── repo.ts                  # CRUD; transactional; NO delete*() exports
│   │   └── db.ts                    # pg.Pool + Drizzle client; lazy-init
│   │
│   ├── compilation/
│   │   ├── runner.ts                # bsp compile entry point
│   │   ├── render/
│   │   │   ├── topic-page.ts        # the demo topic renderer (D-13/D-15)
│   │   │   ├── frontmatter.ts       # build YAML frontmatter (D-15 spec)
│   │   │   ├── claim-block.ts       # render one claim quote-block
│   │   │   ├── contradiction.ts     # render contradiction callout (D-15, COMP-09)
│   │   │   ├── index-md.ts          # rebuild vault/index.md (D-16)
│   │   │   └── log-md.ts            # append vault/log.md (D-17)
│   │   └── vault-writer.ts          # atomic temp+rename; content_hash compare
│   │
│   ├── ui/
│   │   ├── main.tsx                 # mounts React 19 (D-19)
│   │   ├── App.tsx                  # <h1>Business Strategy Planner</h1> placeholder
│   │   └── index.html               # Vite entry
│   │
│   ├── lib/
│   │   ├── env.ts                   # zod-validated env loader (.env)
│   │   ├── log.ts                   # pino logger
│   │   └── hash.ts                  # canonical sha256 (COMP-07)
│   │
│   └── server/, agents/, eval/      # PLACEHOLDER directories with .gitkeep — Phase 2+
│
├── tests/
│   ├── unit/
│   │   ├── repo.test.ts             # mock embed; test write/supersede/no-delete
│   │   ├── render-topic-page.test.ts
│   │   ├── render-contradiction.test.ts
│   │   ├── content-hash.test.ts     # determinism (COMP-07)
│   │   ├── frontmatter.test.ts
│   │   └── ids.test.ts              # ULID immutability
│   ├── integration/
│   │   ├── pipeline.test.ts         # ingest fixture → render page → assert content
│   │   ├── reingest-skip.test.ts    # D-04 idempotency
│   │   ├── append-only.test.ts      # cannot delete; supersede works
│   │   ├── hash-stability.test.ts   # double-render → same hash (success criterion #4)
│   │   └── voyage-live.test.ts      # gated by RUN_VOYAGE_TESTS=1
│   └── setup/
│       ├── db-setup.ts              # before each integration test: reset schema
│       └── voyage-mock.ts           # mockable embed seam
│
└── vault/
    ├── .gitkeep                     # initially empty; created by `bsp compile`
    └── (after compile: index.md, log.md, topics/<demo-slug>.md)
```

### Pattern 1: Append-Only Enforcement at the TS Surface

**What:** No `delete*()` function is exported from `src/onebrain/repo.ts`. The DB *can* DELETE; the API simply does not expose it. Supersede is the only mutation path.

**When to use:** Whenever the data model has an architectural "no delete" invariant.

**Example:**

```typescript
// src/onebrain/repo.ts — APPEND-ONLY API SURFACE
// Source: ARCHITECTURE.md §"Stable ID strategy" + PITFALLS.md P2

import { db } from './db';
import { claims, edges } from './schema';
import { embed } from './embed';
import { ulid } from './ids';
import type { NewClaim, Claim } from './types';

export async function writeClaim(input: NewClaim): Promise<Claim> {
  const embedding = await embed(`${input.text}${input.rationale ? ' — ' + input.rationale : ''}`);
  return db.transaction(async (tx) => {
    const id = ulid();
    const [claim] = await tx.insert(claims).values({
      id,
      ...input,
      status: input.status ?? 'hypothesis',  // CRIT-02
      embedding,
    }).returning();
    // any cites_source / about_entity edges from input
    if (input.cites_source_ids) {
      for (const sourceId of input.cites_source_ids) {
        await tx.insert(edges).values({
          id: ulid(),
          kind: 'cites_source',
          from_table: 'claims', from_id: id,
          to_table: 'sources', to_id: sourceId,
        });
      }
    }
    return claim;
  });
}

export async function supersede(oldClaimId: string, newClaim: NewClaim): Promise<Claim> {
  return db.transaction(async (tx) => {
    const replacement = await writeClaim(newClaim);  // re-uses transaction via passed tx (refactor as needed)
    await tx.update(claims).set({ status: 'superseded', superseded_by: replacement.id }).where(eq(claims.id, oldClaimId));
    await tx.insert(edges).values({
      id: ulid(), kind: 'supersedes',
      from_table: 'claims', from_id: replacement.id,
      to_table: 'claims', to_id: oldClaimId,
    });
    return replacement;
  });
}

export async function promoteClaimStatus(
  claimId: string,
  newStatus: 'tested' | 'validated' | 'refuted',
  evidenceEdgeId: string,  // CRIT-06: required parameter
): Promise<void> {
  // Verifies the edge exists and points to/from this claim before allowing promotion
  // ...
}

// NO export named `deleteClaim`, `removeClaim`, `dropClaim`, etc.
// NO export named `updateClaimText`, `mutateClaim`, etc.
// The ONLY mutation surface is supersede() + promoteClaimStatus().
```

**Test that proves the invariant:**

```typescript
// tests/integration/append-only.test.ts
import * as repo from '@/onebrain/repo';

test('repo exports no delete functions', () => {
  const exportNames = Object.keys(repo);
  for (const name of exportNames) {
    expect(name.toLowerCase()).not.toMatch(/delete|remove|drop|destroy/);
  }
});

test('supersede preserves the original claim row', async () => {
  const original = await repo.writeClaim({ text: 'old', kind: 'fact', confidence: 0.5, ... });
  const replacement = await repo.supersede(original.id, { text: 'new', kind: 'fact', confidence: 0.6, ... });
  const found = await repo.findClaim(original.id);
  expect(found).toBeDefined();
  expect(found.status).toBe('superseded');
  expect(found.superseded_by).toBe(replacement.id);
});
```

### Pattern 2: Mockable Embedding Seam

**What:** `embed()` is a single named export that unit tests replace via `vi.mock()`. Integration tests gate the live call behind `RUN_VOYAGE_TESTS=1`.

```typescript
// src/onebrain/embed.ts
// Source: D-12; voyageai npm 0.2.1 docs

import { VoyageAIClient } from 'voyageai';

const EMBEDDING_DIM = 1024 as const;
const MODEL = 'voyage-3.5' as const;

let _client: VoyageAIClient | undefined;
function client() {
  if (!_client) _client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
  return _client;
}

export async function embed(text: string): Promise<number[]> {
  const truncated = text.slice(0, 4000);  // PITFALLS P5 + P23: cap input to avoid cost surprise
  const response = await client().embed({
    input: truncated,
    model: MODEL,
    outputDimension: EMBEDDING_DIM,
  });
  const vector = response.data?.[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIM) {
    throw new Error(`Voyage embed mismatch: expected ${EMBEDDING_DIM}d, got ${vector?.length ?? 'none'}`);
  }
  return vector;
}

export const EMBEDDING_DIMENSION = EMBEDDING_DIM;  // exported so migrations / Drizzle can reference
```

```typescript
// tests/setup/voyage-mock.ts (used by unit suite)
import { vi } from 'vitest';
vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));
```

```typescript
// tests/integration/voyage-live.test.ts
import { describe, it, expect } from 'vitest';
const RUN = process.env.RUN_VOYAGE_TESTS === '1';
describe.skipIf(!RUN)('Voyage live API', () => {
  it('returns a 1024-dim vector for valid input', async () => {
    const { embed } = await import('@/onebrain/embed');
    const v = await embed('A test claim about pricing strategy.');
    expect(v).toHaveLength(1024);
    expect(v.every((x) => typeof x === 'number')).toBe(true);
  });
});
```

### Pattern 3: Deterministic Markdown Renderer

**What:** Pure function `renderTopicPage(claims, edges, entities, sources): { markdown, hash }`. Stable ULID ordering. No LLM. Frontmatter via gray-matter. Body via simple template literals (remark/unified used for any internal markdown manipulation; for emit a deterministic template literal is sufficient and easier to reason about — use remark only if a future operation needs AST manipulation).

```typescript
// src/compilation/render/topic-page.ts
// Source: D-15 + ARCHITECTURE.md §"Frontmatter convention"

import matter from 'gray-matter';
import { hashCanonical } from '@/lib/hash';
import { renderClaimBlock } from './claim-block';
import { renderContradictionCallout } from './contradiction';
import type { Claim, Edge, Entity, Source } from '@/onebrain/types';

interface PageContext {
  pageId: string;             // ULID for the page (stable across renames)
  topicSlug: string;
  topicTitle: string;
  generatedAt: Date;          // for frontmatter only
  compileRunId: string;       // for frontmatter only
  claims: Claim[];
  edges: Edge[];
  entities: Entity[];
  sources: Source[];
}

export function renderTopicPage(ctx: PageContext): { markdown: string; hash: string } {
  // 1. Group claims by topic_tag (deterministic)
  const grouped = groupByTopicTag(ctx.claims);  // Map<string, Claim[]> with sorted keys

  // 2. Within each group, sort by ULID ascending (D-18 stability)
  for (const [_, group] of grouped) {
    group.sort((a, b) => a.id.localeCompare(b.id));
  }

  // 3. Find contradiction pairs from edges
  const contradictionEdges = ctx.edges.filter((e) => e.kind === 'contradicts');

  // 4. Render body
  const sections: string[] = [];
  for (const [tag, group] of grouped) {
    sections.push(`## ${tag}\n`);
    for (const claim of group) {
      sections.push(renderClaimBlock(claim, ctx.sources));
      // If this claim is on either side of a contradiction edge AND the partner is in the same group,
      // render the callout immediately after the FIRST claim of the pair (in ULID order).
      const partnerId = findContradictionPartner(claim, contradictionEdges);
      if (partnerId && isFirstInPair(claim.id, partnerId, group)) {
        const partner = group.find((c) => c.id === partnerId);
        if (partner) sections.push(renderContradictionCallout(claim, partner, ctx.sources));
      }
    }
  }
  const body = sections.join('\n');

  // 5. Frontmatter (full ARCHITECTURE.md spec, D-15)
  const claimIds = ctx.claims.map((c) => c.id).sort();
  const entityIds = ctx.entities.map((e) => e.id).sort();
  const topicTags = uniqSort(ctx.claims.flatMap((c) => c.topic_tags));
  const frameworkTags = uniqSort(ctx.claims.flatMap((c) => c.framework_tags));
  const confidences = ctx.claims.map((c) => Number(c.confidence));
  const lastEvidenceAt = maxDate(ctx.claims.map((c) => c.updated_at));
  const statusBreakdown = countBy(ctx.claims, (c) => c.status);

  const frontmatter = {
    id: ctx.pageId,
    kind: 'topic',
    title: ctx.topicTitle,
    slug: `topics/${ctx.topicSlug}`,
    generated_at: ctx.generatedAt.toISOString(),       // EXCLUDED FROM HASH
    generated_by: 'compilation-agent',                  // forward-compat (D-15)
    compile_run_id: ctx.compileRunId,                   // EXCLUDED FROM HASH
    content_hash: 'PLACEHOLDER',                        // computed below; EXCLUDED FROM ITSELF
    claim_ids: claimIds,
    entity_ids: entityIds,
    topic_tags: topicTags,
    framework_tags: frameworkTags,
    confidence_avg: avg(confidences),
    confidence_min: Math.min(...confidences),
    contradictions: contradictionEdges.length,
    last_evidence_at: lastEvidenceAt.toISOString(),
    stale: daysSince(lastEvidenceAt) > 90,
    status_breakdown: statusBreakdown,
  };

  // 6. Compute hash over canonical form (excludes the volatile fields)
  const hash = hashCanonical(frontmatter, body);
  frontmatter.content_hash = hash;

  // 7. Emit markdown via gray-matter
  const markdown = matter.stringify(body, frontmatter);
  return { markdown, hash };
}
```

```typescript
// src/lib/hash.ts
import { createHash } from 'node:crypto';

const VOLATILE_FIELDS = new Set(['generated_at', 'compile_run_id', 'content_hash']);

export function hashCanonical(frontmatter: Record<string, unknown>, body: string): string {
  // Strip volatile fields from frontmatter before hashing
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(frontmatter).sort()) {  // sort for key-order stability
    if (!VOLATILE_FIELDS.has(key)) stable[key] = frontmatter[key];
  }
  // Canonical JSON serialization (sorted keys, no whitespace variance)
  const canonical = JSON.stringify(stable) + '\n---\n' + body.trimEnd();
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}
```

### Pattern 4: Atomic Vault Write with Hash Compare

```typescript
// src/compilation/vault-writer.ts
// Source: PITFALLS.md P14 (don't roundtrip; write fresh) + Pattern 4 in ARCHITECTURE.md

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import matter from 'gray-matter';

export async function writeIfChanged(filePath: string, markdown: string, expectedHash: string): Promise<{ written: boolean }> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  // If the file exists, parse its frontmatter to compare content_hash
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(existing);
    if (parsed.data.content_hash === expectedHash) {
      return { written: false };
    }
  } catch (e) {
    // File doesn't exist; will write
  }
  // Atomic: write to .tmp then rename
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, markdown, 'utf-8');
  await fs.rename(tmpPath, filePath);
  return { written: true };
}
```

### Pattern 5: Repository as Coercive Boundary

[CITED: ARCHITECTURE.md Pattern 3] — Already mandated: every code path that touches Postgres goes through `src/onebrain/repo.ts`. CLI commands import `repo`, never `db` directly.

### Anti-Patterns to Avoid in Phase 1

- **Smoothing contradictions** (PITFALLS.md P1, Anti-Pattern 3) — the renderer MUST emit both claims of a contradicting pair with their respective confidences. A unit test should fail if either side is omitted.
- **Confidence as free-text** (Anti-Pattern 4) — `numeric(3,2)` only; Zod range `[0,1]`.
- **Mega-tool that does everything** (Anti-Pattern 6) — distinct repo functions per operation, not a `repo.do(op, args)` switch.
- **`drizzle-kit push`** (PITFALLS.md P4) — add an explicit `db:push` script that exits with an error message: `"FORBIDDEN — schema is owned by node-pg-migrate; use 'npm run migrate up'"`.
- **Roundtripping vault pages** (PITFALLS.md P14) — `vault-writer.ts` does NOT modify-in-place. It reads existing file ONLY to extract `content_hash` for the diff check; full overwrite on write.
- **String-concat markdown** — use gray-matter for frontmatter, template literals for body composition. Never hand-build YAML.
- **Promise.all over write operations** at the repo layer (PITFALLS.md P16) — writes are sequential within the transaction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ULID generation | Custom random+timestamp ID | `ulid` npm 3.0.2 | Battle-tested, monotonic, no collisions, lex-sortable. |
| YAML frontmatter parse/emit | Manual string concat or `js-yaml` direct | `gray-matter` 4.0.3 | Handles `---` delimiter edge cases, key ordering, indentation. |
| SQL migration runner | `psql` script orchestration | `node-pg-migrate` 8.0.4 | Atomic-per-migration, history table, lock to prevent concurrent runs, rollback. |
| Type-safe SQL | Hand-written queries with manual row-shape casting | Drizzle ORM 0.45.2 (queries only) | Type inference from schema, parameterized queries (SQLi prevention), no string-concat. |
| Embedding API client | `fetch()` to `https://api.voyageai.com/v1/embeddings` | `voyageai` npm 0.2.1 | Auth, retries, types, future model swaps. |
| CLI argument parsing | `process.argv.slice(2)` regex | `commander` 14.0.3 | Subcommands, options, help text, error formatting. |
| Markdown body construction (when complex) | String concat | `unified`/`remark-stringify` | AST-level manipulation (less critical for Phase 1 since the body is straightforward; reserve for Phase 3's contradiction-callout rendering edge cases). |
| Postgres connection management | Manual `pg.Client.connect()` per query | `pg.Pool` (built into pg 8.20.0) | Pool sizing, idle timeout, no connection leaks. |
| sha256 hashing | external lib | `node:crypto` | Built-in. Don't add a dep for what Node provides. |
| .env loading | `process.env` direct read | `dotenv` 16.x + Zod-validated env loader | Single load, validation, fail-fast on missing keys. |
| Test framework | bare `node:test` | `vitest` 4.1.5 | Native TS/ESM, snapshot, mocks, parallelism, watch UI. |

**Key insight:** Phase 1's stack is established and prescriptive. The temptation to "just write a small ULID function" or "just hand-build YAML" must be resisted — these are exactly the seemingly-trivial choices that bake in subtle bugs (ULID collisions on rapid generation, YAML edge cases on multi-line strings) that surface only in production.

---

## Common Pitfalls (Phase 1 specific)

The full PITFALLS.md catalogues 25 pitfalls; Phase 1 must *prevent* 11 of them by construction. The rest are addressed in later phases.

### Pitfall A (PITFALLS P2): Provenance chain breaks
**What goes wrong:** Wiki cites `[[claim:01J9XABC]]` but the ULID no longer exists in `claims`.
**Why it happens:** Someone calls `delete` on a row, ULIDs get regenerated during a migration, etc.
**How to prevent in Phase 1:**
1. Repo exports NO `delete*()` functions (Pattern 1 above).
2. ULID generation is in `src/onebrain/ids.ts` and is called only from inside repo write functions — IDs are never re-derived.
3. Schema uses `text PRIMARY KEY` with the ULID inserted at write time; no `DEFAULT gen_random_uuid()` that would let an INSERT silently regenerate.
**Warning signs:** A test that lists all `claims.id` values, runs the renderer, then verifies every `[[claim:...]]` reference in the output exists in the list.
**Verification test:** `tests/integration/append-only.test.ts` — see Pattern 1 example above.

### Pitfall B (PITFALLS P3): Compilation idempotency bugs (recompile loops or silent skips)
**What goes wrong:** Re-running `bsp compile` with no DB changes produces a different content_hash → false positive "changed."
**Why it happens:** `generated_at` in the hash; unsorted claim ordering; key order drift in frontmatter YAML emit.
**How to prevent in Phase 1:**
1. `hashCanonical()` strips `generated_at`, `compile_run_id`, `content_hash` before hashing (Pattern 3 example).
2. Sort claim_ids and other arrays in frontmatter before hash.
3. Sort claims by ULID within each topic group before rendering.
4. Sort frontmatter keys alphabetically in the canonical-JSON step (Pattern 3 example).
**Warning signs:** `git diff vault/` shows changes after a no-op recompile.
**Verification test:** `tests/integration/hash-stability.test.ts` — ingest fixture, compile twice, assert second compile's `compile_artifacts.written = false` AND both runs' content_hash match. **This is success criterion #4.**

### Pitfall C (PITFALLS P4): Drizzle / migration drift
**What goes wrong:** `src/onebrain/schema.ts` lags behind migrations; queries return objects with missing columns.
**Why it happens:** Two sources of truth.
**How to prevent in Phase 1:**
1. After every migration, run `npx drizzle-kit pull` to regenerate `src/onebrain/schema.ts`.
2. Add a `db:push` script to package.json that exits with `FORBIDDEN`.
3. CI / pre-commit script: boot clean DB, apply migrations, drizzle-kit pull to a temp file, diff against committed schema.ts. Fail if different.
**Verification test:** `tests/integration/schema-parity.test.ts` (or pre-commit hook).

### Pitfall D (PITFALLS P5): pgvector dimension mismatch / index-not-used
**What goes wrong:** Voyage returns 1024-dim, column is 768-dim → INSERT fails. Or query doesn't use HNSW index → slow.
**How to prevent in Phase 1:**
1. `EMBEDDING_DIMENSION = 1024` exported from `src/onebrain/embed.ts`.
2. Migration `1700000000003_claims.sql` declares `embedding vector(1024)`.
3. Optional: a build-time check (test) that asserts `EMBEDDING_DIMENSION === 1024` matches the column declaration parsed from the migration file.
4. `embed()` asserts the returned vector length matches `EMBEDDING_DIMENSION`.
5. HNSW index syntax (verified): `CREATE INDEX claims_embedding_hnsw ON claims USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
6. Phase 1 doesn't run filtered vector queries (no search yet); leave `hnsw.ef_search` and `iterative_scan` as-default. Phase 2 (DATA-09) addresses search.

### Pitfall E (PITFALLS P14): Obsidian markdown vs CommonMark divergence
**What goes wrong:** `> [!warning] Contradiction` doesn't render as a callout in Obsidian; `[[wikilink]]` syntax garbled.
**How to prevent in Phase 1:**
1. Don't roundtrip — generate fresh every compile (already enforced by `vault-writer.ts`).
2. Use template literals for the callout block exactly per Obsidian syntax (verified syntax: `> [!warning] Title\n> body line 1\n> body line 2`).
3. Wikilinks `[[claim:01J9XABC]]` and `[[source:01J9XSRC1]]` are emitted as raw text (Obsidian shows them as plain text since they don't resolve to vault pages in Phase 1 — that's fine; they're audit hooks).
4. Manually open the rendered file in Obsidian once during phase verification (success criterion #3).
**Verification test:** Snapshot-based test on the rendered markdown for the fixture; manual visual check post-execute.

### Pitfall F (PITFALLS P16): Async/await write ordering bugs
**What goes wrong:** `Promise.all([writeClaim(a), writeClaim(b), writeEdge(a→b)])` races; FK violation.
**How to prevent in Phase 1:**
1. `repo.writeClaim()` wraps INSERT + edges INSERT + event_log INSERT in `db.transaction(async tx => ...)`.
2. Embedding is awaited *outside* the transaction (slow network call; don't hold a row lock for it).
3. NO `Promise.all` over writes — sequential within the transaction.
4. The fixture loader `bsp ingest --fixture` writes source first, then claims (each with its embedding), then edges — explicit sequence.
**Verification test:** `tests/integration/fixture-load.test.ts` — load fixture, then `SELECT count(*) FROM claims` matches expected; no FK violations in pg logs.

### Pitfall G (PITFALLS P18): Single-user assumptions baked in
**How to prevent in Phase 1:**
1. `claims.business_plan_id text` column exists from migration #1, defaulting to a hard-coded `'default-plan'` ULID.
2. `claims.created_by text NOT NULL` (already in ARCHITECTURE.md schema; populate with `'cli-fixture'` for fixture loads).
3. No auth, no sessions, no user table — but the columns are there for v2.

### Pitfall H (PITFALLS P19): API key leakage
**How to prevent in Phase 1:**
1. `.env` in `.gitignore` from commit zero; `.env.example` committed.
2. `docker-compose.yml` reads `${POSTGRES_PASSWORD}` and `${PGADMIN_DEFAULT_PASSWORD}` from .env — never literal.
3. Pino logger redacts `*.api_key`, `*.headers.authorization`, `password`.
4. `src/lib/env.ts` validates required keys; fails fast with a clear error if `VOYAGE_API_KEY` is missing for an ingest call.

### Pitfall I (PITFALLS P21): pgAdmin auth confusion
**How to prevent in Phase 1:**
1. `docker-compose.yml` sets `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` env vars.
2. Persist `/var/lib/pgadmin` to a named volume.

### Pitfall J (PITFALLS P25): Obsidian reserved filenames break slug generation
**How to prevent in Phase 1:**
1. Slug generator regex: `/[^a-z0-9-]/g → '-'`, lowercase, collapse double dashes.
2. Frontmatter `title` preserves the human form; filename is the slug.
3. Test cases with characters: `&`, `:`, spaces, accents.

### Pitfall K (PITFALLS P12): Embedding drift across re-embedding runs
**How to prevent in Phase 1:**
1. Add `embedding_model text` column to `claims`, `sources`, `entities` (default `'voyage-3.5-1024'`). [CITED: PITFALLS.md P12 §"How to avoid" #1]
2. The embedding wrapper records the model name; the column populated at insert.
3. No regeneration tooling needed in Phase 1 — just the column for forward-compat.

---

## Runtime State Inventory

> Phase 1 is greenfield (empty repo). No existing runtime state. **None — verified by `ls` of repo root showing only `.git`, `.planning`, `.claude`, `CLAUDE.md`, `package-lock.json`.**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB exists yet; first migration creates the schema | None |
| Live service config | None — no Docker containers running | None |
| OS-registered state | None — no scheduled tasks, no installed binaries | None |
| Secrets/env vars | None existing — `.env` to be created from `.env.example` | Create `.env`, populate `VOYAGE_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `PGADMIN_DEFAULT_PASSWORD` |
| Build artifacts | None — no `dist/`, no `node_modules/`, no compiled binaries | None |

---

## Code Examples

### Migration: enable pgvector extension

```sql
-- migrations/1700000000000_pgvector_extension.sql
-- Source: pgvector official docs; verified at https://github.com/pgvector/pgvector

-- Up Migration
CREATE EXTENSION IF NOT EXISTS vector;

-- Down Migration
DROP EXTENSION IF EXISTS vector;
```

### Migration: claims table with HNSW index

```sql
-- migrations/1700000000003_claims.sql
-- Source: ARCHITECTURE.md §"OneBrain Schema"; pgvector HNSW syntax verified

-- Up Migration
CREATE TABLE claims (
  id              text PRIMARY KEY,
  kind            claim_kind NOT NULL,
  status          claim_status NOT NULL DEFAULT 'hypothesis',
  confidence      numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  text            text NOT NULL,
  rationale       text,
  topic_tags      text[] NOT NULL DEFAULT '{}',
  framework_tags  text[] NOT NULL DEFAULT '{}',
  business_plan_id text NOT NULL DEFAULT 'default-plan',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  superseded_by   text REFERENCES claims(id),
  embedding       vector(1024) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'voyage-3.5-1024',
  supporting_count integer NOT NULL DEFAULT 0,
  contradicting_count integer NOT NULL DEFAULT 0
);

CREATE INDEX claims_status_idx     ON claims (status);
CREATE INDEX claims_kind_idx       ON claims (kind);
CREATE INDEX claims_topic_gin      ON claims USING gin (topic_tags);
CREATE INDEX claims_framework_gin  ON claims USING gin (framework_tags);
CREATE INDEX claims_updated_at_idx ON claims (updated_at DESC);
CREATE INDEX claims_embedding_hnsw ON claims USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Down Migration
DROP TABLE claims;
```

### Docker Compose

```yaml
# docker-compose.yml
# Source: STACK.md + PITFALLS.md P5 (maintenance_work_mem) + P21 (pgAdmin auth)

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: bsp-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: businessplanner
      POSTGRES_USER: bsp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    command: >
      postgres
      -c maintenance_work_mem=512MB
      -c shared_buffers=512MB
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bsp -d businessplanner"]
      interval: 5s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: bsp-pgadmin
    restart: unless-stopped
    ports:
      - "5050:80"
    volumes:
      - pgadmin-data:/var/lib/pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  pgadmin-data:
```

### .env.example

```bash
# .env.example
# Copy to .env and fill in real values. .env is gitignored.

# Postgres (consumed by docker-compose.yml AND the app)
POSTGRES_PASSWORD=changeme-local-dev-only
DATABASE_URL=postgres://bsp:changeme-local-dev-only@localhost:5432/businessplanner

# pgAdmin (web UI on http://localhost:5050)
PGADMIN_DEFAULT_EMAIL=admin@local
PGADMIN_DEFAULT_PASSWORD=changeme-local-dev-only

# Voyage AI (embeddings)
VOYAGE_API_KEY=

# Optional: gate the live Voyage integration test
# RUN_VOYAGE_TESTS=1
```

### package.json scripts

```json
{
  "name": "business-strategy-planner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "bsp": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.node.json",
    "dev": "vite",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --project integration",
    "test:voyage": "RUN_VOYAGE_TESTS=1 vitest run tests/integration/voyage-live.test.ts",
    "migrate": "node-pg-migrate up --migration-file-language sql --tsconfig tsconfig.node.json",
    "migrate:down": "node-pg-migrate down --migration-file-language sql --tsconfig tsconfig.node.json",
    "db:push": "echo 'FORBIDDEN — schema is owned by node-pg-migrate. Use: npm run migrate' && exit 1",
    "drizzle:pull": "drizzle-kit pull",
    "lint": "eslint src tests",
    "format": "prettier --write 'src/**/*.{ts,tsx,md,json,yaml}'",
    "bsp": "tsx src/cli/index.ts"
  }
}
```

### commander CLI skeleton

```typescript
// src/cli/index.ts
// Source: commander 14.0.3 docs; D-01 to D-07

#!/usr/bin/env node
import { Command } from 'commander';
import { ingest } from './commands/ingest';
import { compile } from './commands/compile';
import { dbMigrate, dbReset } from './commands/db-migrate';

const program = new Command();
program
  .name('bsp')
  .description('Business Strategy Planner CLI')
  .version('0.1.0');

program
  .command('ingest')
  .description('Ingest a source into OneBrain')
  .argument('[input]', 'URL or file path (rejected in Phase 1; use --fixture)')
  .option('--fixture <name>', 'Load a built-in test fixture')
  .option('--json', 'Output JSON instead of human-readable table')
  .option('-v, --verbose', 'Verbose output (pino info+)')
  .option('-vv, --very-verbose', 'Very verbose output (pino debug+)')
  .action(ingest);

program
  .command('compile')
  .description('Render OneBrain rows into the Obsidian vault')
  .option('--json', 'Output JSON')
  .option('-v, --verbose', 'Verbose')
  .action(compile);

const db = program.command('db').description('Database operations');
db.command('migrate').description('Apply pending migrations').action(dbMigrate);
db.command('reset').description('Drop schema, re-migrate, clear vault/').requiredOption('--confirm', 'Required acknowledgement').action(dbReset);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Contradiction callout rendering

```typescript
// src/compilation/render/contradiction.ts
// Source: D-15 + ARCHITECTURE.md §"How contradictions are preserved"

import type { Claim, Source } from '@/onebrain/types';

export function renderContradictionCallout(a: Claim, b: Claim, sources: Source[]): string {
  const aStatus = `confidence ${a.confidence}, ${a.status}`;
  const bStatus = `confidence ${b.confidence}, ${b.status}`;
  const aSources = a.cites_source_ids?.map((id) => `[[source:${id}]]`).join(', ') ?? '';
  const bSources = b.cites_source_ids?.map((id) => `[[source:${id}]]`).join(', ') ?? '';
  return [
    '> [!warning] Contradiction',
    '> Two sources disagree on this point.',
    `> - **Claim A** (${aStatus}): "${a.text}"`,
    `>   *— [[claim:${a.id}]], cites ${aSources}*`,
    `> - **Claim B** (${bStatus}): "${b.text}"`,
    `>   *— [[claim:${b.id}]], cites ${bSources}*`,
    '',
  ].join('\n');
}
```

### Single claim block

```typescript
// src/compilation/render/claim-block.ts
// Source: D-15 + ARCHITECTURE.md §"Link conventions"

import type { Claim, Source } from '@/onebrain/types';

export function renderClaimBlock(claim: Claim, sources: Source[]): string {
  const sourcesLine = (claim.cites_source_ids ?? [])
    .map((id) => `[[source:${id}]]`)
    .join(', ');
  return [
    `> ${claim.text}`,
    `> — [[claim:${claim.id}]] confidence=${claim.confidence} status=${claim.status}`,
    sourcesLine ? `> — sources: ${sourcesLine}` : null,
    '',
  ].filter(Boolean).join('\n');
}
```

---

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `npm install pgvector-cli` to manage extension | `pgvector/pgvector:pg16` Docker image (preinstalled) | pgvector 0.6+ | Simpler local-dev. Use this image, not vanilla `postgres:16`. |
| HNSW filtered queries fall back to seq-scan | `SET hnsw.iterative_scan = relaxed_order` (pgvector 0.8+) | pgvector 0.8.0 (Sep 2024) | Phase 1 doesn't filter+search yet (Phase 2 / DATA-09). Note for Phase 2. |
| `drizzle-kit push` to apply Drizzle schema directly | Migration tool owns schema; `drizzle-kit pull` for type-mirror | node-pg-migrate as constraint | Drift prevention. Set the discipline now. |
| Vitest 1.x / 2.x | Vitest 4.1.5 | 2026 release | Native TS/ESM, projects (formerly workspaces), `test.skipIf()`. |
| Voyage 2 / 3.0 (`output_dimension` not configurable) | Voyage 3.5 with `outputDimension: 1024` parameter | Voyage 3.5 release | Allows future re-embed at different dim WITHOUT vector-space break (Voyage 3.x/4.x share space). |
| commander 9-12 (callback-style) | commander 14 (TS-first, async-friendly) | Spring 2026 | Use `parseAsync` for top-level await of subcommand actions. |

**Deprecated/outdated:**
- `dotenv-safe` — superseded by zod-validated env in `src/lib/env.ts`.
- `nodemon` for TS — use `tsx watch` instead (per STACK.md).
- pgvector IVFFlat default — HNSW is now the default for new indexes (better recall at the scale we'll see in v1).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Voyage 3.5 SDK exposes `client.embed({ input, model, outputDimension })` with that exact parameter name | "Pattern 2: Mockable Embedding Seam" | Wrong parameter name (could be `output_dimension`) means embed call fails at runtime. **Mitigation:** during Wave 0 / setup, run a smoke `npx tsx -e "..."` against the SDK to confirm the actual parameter name; adjust before writing the wrapper. |
| A2 | `npm view voyageai` returning 0.2.1 has the embedding API stable | "Standard Stack" | If 0.2.x has breaking API changes mid-phase, the embed wrapper might need to update. Low-risk for Phase 1's narrow surface. |
| A3 | `node-pg-migrate` raw `.sql` file format with `-- Up Migration` / `-- Down Migration` comments works as documented in the WebSearch result | "Migration: enable pgvector extension" | If the comment markers differ in current version, migrations won't parse. **Mitigation:** verify by running first migration and confirming `pgmigrations` table updates; switch to .ts migrations if .sql proves fragile. |
| A4 | `gray-matter` produces deterministic key ordering when given a sorted-keys input object | "Pattern 3: Deterministic Markdown Renderer" | If gray-matter re-orders YAML keys non-deterministically, content_hash will be unstable across runs. **Mitigation:** the canonical hash function pre-sorts keys in JSON before hashing (Pattern 3), so YAML emit order doesn't affect the hash. The visible YAML may still vary but the hash is stable. |
| A5 | Obsidian renders `> [!warning] Contradiction` as a callout natively (no plugin required) | "Pattern E: Obsidian markdown" | If Obsidian needs a plugin for callouts, the user's UX degrades. Callouts have been native to Obsidian since v0.14 (2022); high confidence, marked ASSUMED only because not freshly verified. |
| A6 | Pino redaction syntax `pino({ redact: ['...'] })` matches Pino 9.x | "Security Domain" | Wrong syntax means API keys could leak to logs. **Mitigation:** verify against current Pino docs during executor wave. |
| A7 | The fixture article D-09 will be chooseable to satisfy: real, publicly-accessible, naturally-contradicting positions, mappable to topic_tags / framework_tags | "Open Questions" | If no suitable article exists, the fixture devolves to synthetic and weakens the round-trip realism. **Mitigation:** see Open Questions #2 — list 3–5 candidate articles in the planning step; reject Phase 1 plan if none qualify. |
| A8 | A `pg.Pool` created at module-load time is acceptable for the CLI lifecycle (CLI invocations are short-lived; pool tears down at process exit) | "Architectural Responsibility Map" | If pool teardown is buggy and leaves connections open, dev DB max_connections could exhaust over many CLI runs. Low-risk; verify by running 50 sequential `bsp ingest --fixture` then `psql -c "SELECT count(*) FROM pg_stat_activity"`. |
| A9 | The exact Voyage SDK class name is `VoyageAIClient` (per Fern-generated SDK convention) | "Pattern 2: Mockable Embedding Seam" | If the actual class name differs (e.g., `Voyage`, `VoyageClient`), the import line is wrong. **Mitigation:** verify with `npx tsx -e "import { ... } from 'voyageai'; console.log(Object.keys(require('voyageai')))"` before writing the wrapper. |

**If any A1–A9 prove wrong:** the impact is implementation-detail-level, not architectural. Phase 1 plan should include a "wave 0 smoke checks" task that verifies A1, A6, A9 against actual installed SDKs before writing dependent code.

---

## Open Questions

1. **Fixture article choice (D-09)** — *Not blocking.* Planner picks during planning step.
   - What we know: Must be (a) real, (b) publicly accessible URL, (c) contains naturally-contradicting positions on at least one point, (d) maps to common business `topic_tags` (pricing, market segmentation, competitive positioning) and `framework_tags` (swot, stp, porter).
   - What's unclear: Specific article. Need 3–5 candidates from sources like Stratechery, HBR, First Round Review, Mckinsey Insights, A16Z, NfX.
   - Recommendation: Planner generates candidate list, picks one, captures URL + retrieval-date as part of `01-PLAN.md`. Acceptable for the first pick to be revised after ingest if the contradicting-claim shape doesn't materialize naturally.

2. **node-pg-migrate `.sql` vs `.ts` migrations** — *Not blocking.*
   - What we know: Both are supported via `--migration-file-language sql|js|ts`.
   - What's unclear: Whether `.sql` is sufficient for ALL Phase 1 migrations (in particular: does the pgvector extension setup work cleanly in raw SQL? Do enum types? Does HNSW index syntax parse?). All three should — they're standard SQL DDL.
   - Recommendation: Default to `.sql` per ARCHITECTURE.md style. If a migration needs JS-helper logic (unlikely in Phase 1), switch THAT one file to `.ts`.

3. **Drizzle mirror review process** — *Not blocking but a planner concern (D-NOTES).*
   - What we know: After every migration, `drizzle-kit pull` regenerates `src/onebrain/schema.ts`.
   - What's unclear: How to ensure the regenerated file is committed alongside the migration (vs forgotten). Pre-commit hook? Required CI check?
   - Recommendation: Phase 1 plan should include a `verify-drizzle-mirror.ts` script run as a Vitest integration test that performs the diff. If diff non-empty, test fails. This catches drift in dev BEFORE PR.

4. **Re-ingest reporting payload (D-04)** — *Minor.*
   - What we know: Skip & report on duplicate `raw_text_hash`. Print "already ingested as `<source_id>` on `<date>`".
   - What's unclear: Should the human output include the title? The fixture name? Recommendation: include title for human-readability; include source_id and ingested_at always.

5. **Behavior of `bsp compile` when no claims exist** — *Minor.*
   - Recommendation: Print a friendly "no rows in OneBrain — run `bsp ingest --fixture <name>` first" message and exit 0. Do NOT emit empty pages.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 1 | ✓ | 22.20.0 | — |
| npm | Package install + scripts | ✓ | 11.6.2 | — |
| Docker | Postgres + pgAdmin via docker-compose | ✓ | 27.5.1 | — |
| docker-compose CLI | Bringing up Postgres | ✓ (bundled with Docker 27) | — | `docker compose` (newer subcommand) syntax should be used, NOT `docker-compose` legacy command. |
| TypeScript compiler | Build / tests | ✗ globally (✓ as devDep after install) | — (will install 5.6.x) | None needed; `tsx` and `tsc` will be installed via `npm install -D` |
| Voyage API key | Live `embed()` calls and `RUN_VOYAGE_TESTS=1` | ✗ (must be obtained by user) | — | Unit tests mock embed; integration tests gated by `RUN_VOYAGE_TESTS=1`; Phase 1 ingest can run without VOYAGE_API_KEY set ONLY if the user mocks at the CLI level (not recommended — the live call is part of D-12). **Planner action:** add a wave-0 task "verify VOYAGE_API_KEY in .env before integration tests." |
| Postgres CLI tools (`psql`, `pg_dump`) | Optional debugging | unknown | — | Not strictly required for Phase 1; pgAdmin web UI on :5050 is sufficient. |
| Obsidian | Manual visual verification of vault output | unknown (user's choice) | — | The user needs Obsidian installed to visually confirm success criterion #3. The plan should include a manual "open vault/topics/<demo-slug>.md in Obsidian and verify the contradiction callout renders" step. |

**Missing dependencies with no fallback:**
- VOYAGE_API_KEY — user must obtain from voyageai.com (free tier sufficient for Phase 1's small fixture).

**Missing dependencies with fallback:**
- TypeScript globally — installed as devDep; not a blocker.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 [VERIFIED: npm view] |
| Config file | `vitest.config.ts` (NEW — Wave 0) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test && RUN_VOYAGE_TESTS=1 npm run test:voyage` |
| Test directory | `tests/{unit,integration}/` |
| Test file pattern | `*.test.ts` |
| Mocking strategy | `vi.mock('@/onebrain/embed')` for unit suite; live for integration suite (gated env var) |

### Phase Requirements → Test Map

| REQ ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INFRA-01 | Postgres + pgvector + pgAdmin start via docker compose | CLI smoke | `docker compose up -d && docker compose ps \| grep healthy` | ❌ Wave 0 |
| INFRA-02 | Node 22 + TS 5.6 project compiles | unit (build check) | `npm run build` | ❌ Wave 0 |
| INFRA-03 | node-pg-migrate is schema source; `drizzle-kit push` is forbidden | unit + script | `npm run db:push` should exit 1; `tests/integration/schema-parity.test.ts` | ❌ Wave 0 |
| INFRA-05 | Vite dev server boots; `<h1>` renders | CLI smoke | `npm run dev &` + `curl http://localhost:5173 \| grep "Business Strategy Planner"` | ❌ Wave 0 |
| INFRA-06 | Vitest configured with unit + integration projects | unit | `vitest --reporter=verbose --listTests` | ❌ Wave 0 |
| INFRA-07 | `.env.example` committed; env loader fails fast on missing keys | unit | `tests/unit/env.test.ts` | ❌ Wave 0 |
| DATA-01 | `sources` table exists with all columns + indexes | integration | `tests/integration/schema-shape.test.ts::sources` (queries `information_schema.columns`) | ❌ Wave 0 |
| DATA-02 | `claims` table with status, confidence, defaults | integration | `tests/integration/schema-shape.test.ts::claims` | ❌ Wave 0 |
| DATA-03 | `entities` table | integration | `tests/integration/schema-shape.test.ts::entities` | ❌ Wave 0 |
| DATA-04 | `edges` table with all kinds (cites_source, supports, contradicts, supersedes, evidence_of, derived_from, about_entity) | integration | `tests/integration/schema-shape.test.ts::edges_enum_values` | ❌ Wave 0 |
| DATA-05 | ULID stable IDs; immutable | unit | `tests/unit/ids.test.ts` (ULID format regex; no updateId() in repo exports) | ❌ Wave 0 |
| DATA-06 | Append-only repo (no delete path; supersede works) | integration | `tests/integration/append-only.test.ts` (see Pattern 1 example) | ❌ Wave 0 |
| DATA-07 | `vector(1024)` column + HNSW index exists | integration | `tests/integration/schema-shape.test.ts::hnsw_index` (queries `pg_indexes` for `claims_embedding_hnsw`) | ❌ Wave 0 |
| DATA-08 | Voyage 3.5 returns 1024-dim embedding | integration (gated) | `RUN_VOYAGE_TESTS=1 vitest run tests/integration/voyage-live.test.ts` | ❌ Wave 0 |
| DATA-10 | Tags table exists; canonicalize at write | integration + unit | `tests/integration/schema-shape.test.ts::tags`; `tests/unit/tag-canonicalize.test.ts` | ❌ Wave 0 |
| COMP-01 | vault/ dirs created on first compile | CLI smoke + integration | `tests/integration/pipeline.test.ts` asserts `fs.stat('vault/topics')` succeeds | ❌ Wave 0 |
| COMP-02 | Page frontmatter has all required fields | unit | `tests/unit/frontmatter.test.ts` (parses output of renderTopicPage; asserts every key) | ❌ Wave 0 |
| COMP-03 | `index.md` rebuilt with Topics + Sources sections | unit + integration | `tests/unit/render-index-md.test.ts`; `tests/integration/pipeline.test.ts` | ❌ Wave 0 |
| COMP-04 | `log.md` appends a `## [date] kind \| summary` entry per ingest/compile/reset | integration | `tests/integration/pipeline.test.ts::log_entry_appended` | ❌ Wave 0 |
| COMP-05 | Renderer is deterministic; same input → same output | unit | `tests/unit/render-topic-page.test.ts` (calls renderer twice with same input, asserts equal markdown excluding generated_at frontmatter field) | ❌ Wave 0 |
| COMP-07 | content_hash stable across runs (excludes timestamps) | integration | `tests/integration/hash-stability.test.ts` (load fixture, compile twice, assert content_hash equal AND second-run `compile_artifacts.written = false`). **THIS IS SUCCESS CRITERION #4.** | ❌ Wave 0 |
| COMP-09 | Contradictions render as `> [!warning] Contradiction` callouts | unit + integration | `tests/unit/render-contradiction.test.ts`; `tests/integration/pipeline.test.ts::contradiction_callout_present` (greps the rendered markdown for the exact callout syntax) | ❌ Wave 0 |
| CRIT-02 | Claims default to `status='hypothesis'` | unit | `tests/unit/repo.test.ts::default_status_is_hypothesis` (writeClaim without explicit status) | ❌ Wave 0 |
| CRIT-03 | Confidence required, range [0,1] | unit | `tests/unit/types.test.ts::confidence_zod_validates_range` (passes 0.5; rejects 1.5; rejects null) | ❌ Wave 0 |
| CRIT-04 | Renderer surfaces confidence on each claim + frontmatter `confidence_avg/min`, `stale` flag | unit | `tests/unit/render-topic-page.test.ts::confidence_visible_per_claim`; `tests/unit/render-topic-page.test.ts::frontmatter_confidence_aggregates` | ❌ Wave 0 |
| CRIT-05 | Contradictions never auto-resolved | unit | `tests/unit/render-contradiction.test.ts::both_sides_present` (asserts both claim IDs appear in rendered output) | ❌ Wave 0 |
| CRIT-06 | Status promotion requires evidence edge | unit | `tests/unit/repo.test.ts::promote_requires_edge_id` (calling promoteClaimStatus without edge_id throws) | ❌ Wave 0 |
| EVAL-01 | Vitest passes for db, repos, renderer | meta — entire suite passes | `npm test` exits 0; `npm test -- --reporter=verbose` shows ≥ X passing tests | ❌ Wave 0 (all the above) |

### Sampling Rate

- **Per task commit:** `npm test` (full unit + integration suite, ~10–30s once suite exists)
- **Per wave merge:** `npm test && npm run lint`
- **Phase gate:** `npm test && RUN_VOYAGE_TESTS=1 npm run test:voyage && docker compose ps` all green; manual Obsidian visual check of `vault/topics/<demo-slug>.md`

### Wave 0 Gaps

All of these need to be created in Wave 0 (test infrastructure setup before implementation). Phase 1 starts from zero.

- [ ] `vitest.config.ts` — projects: `unit` + `integration`, alias resolution mirroring tsconfig
- [ ] `tests/setup/db-setup.ts` — beforeEach: connect, reset schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`), apply migrations, populate enums
- [ ] `tests/setup/voyage-mock.ts` — vi.mock for `@/onebrain/embed`
- [ ] `tests/unit/repo.test.ts` — append-only enforcement, default status, write transactions
- [ ] `tests/unit/render-topic-page.test.ts` — determinism, confidence display
- [ ] `tests/unit/render-contradiction.test.ts` — both sides present, exact callout syntax
- [ ] `tests/unit/render-index-md.test.ts` — Topics + Sources sections
- [ ] `tests/unit/render-log-md.test.ts` — append behavior, prefix format
- [ ] `tests/unit/content-hash.test.ts` — excludes generated_at/compile_run_id, stable across calls
- [ ] `tests/unit/frontmatter.test.ts` — every required key present (per D-15)
- [ ] `tests/unit/ids.test.ts` — ULID format, no updateId in repo exports
- [ ] `tests/unit/types.test.ts` — Zod confidence range, status enum
- [ ] `tests/unit/env.test.ts` — env loader rejects missing required keys
- [ ] `tests/unit/tag-canonicalize.test.ts` — lowercase, kebab-case
- [ ] `tests/integration/pipeline.test.ts` — full ingest fixture → compile → assert vault page contents (THIS IS THE SUCCESS-CRITERIA TEST)
- [ ] `tests/integration/reingest-skip.test.ts` — D-04 idempotency
- [ ] `tests/integration/append-only.test.ts` — supersede works, no delete path exists
- [ ] `tests/integration/hash-stability.test.ts` — double-compile produces identical hashes, second compile writes 0 files (success criterion #4)
- [ ] `tests/integration/schema-shape.test.ts` — every table/column/index per migrations
- [ ] `tests/integration/schema-parity.test.ts` — drizzle-kit pull diff against committed schema.ts
- [ ] `tests/integration/voyage-live.test.ts` — gated by `RUN_VOYAGE_TESTS=1`
- [ ] Framework install: `npm install -D vitest@4.1.5 @vitest/ui@4.1.5` (per Standard Stack)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local app; out of scope per PROJECT.md |
| V3 Session Management | no | No sessions in Phase 1 (no HTTP server) |
| V4 Access Control | no | Single-user local; no users to control |
| V5 Input Validation | yes | **Zod schemas at every boundary** (`src/onebrain/types.ts`); CLI args validated via commander |
| V6 Cryptography | partial | sha256 via `node:crypto` for content_hash (NOT a security primitive — integrity check only). API keys stored in `.env` (gitignored). |
| V7 Error Handling & Logging | yes | **Pino with redaction** for `*.api_key`, `*.headers.authorization`, `password`. Errors do not leak sensitive payloads. |
| V8 Data Protection | yes | `.env` gitignored; `.env.example` template committed; `docker-compose.yml` reads from env, not literal. |
| V14 Configuration | yes | env loader (`src/lib/env.ts`) validates required keys at process start; fails fast with clear error. |

### Known Threat Patterns for Node + Postgres + CLI Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection in repo queries | Tampering | **Drizzle parameterized queries** (never string concat); ESLint rule against `sql`-template raw interpolation in repo layer |
| Postgres credentials in source | Information Disclosure | Credentials in `.env` (gitignored); read by docker-compose AND app via `DATABASE_URL` |
| Voyage API key leakage to logs | Information Disclosure | Pino redact rules; never log full request objects |
| Voyage API key leakage to git | Information Disclosure | `.env` in `.gitignore` from commit zero; `.env.example` with placeholders only; (optional) `git-secrets` precommit hook |
| Path traversal in `bsp ingest <file>` (Phase 2 risk; D-08 makes Phase 1 safe by rejecting file paths) | Tampering | Phase 1: file paths are rejected, so no risk. Phase 2: `path.resolve()` + check inside project; planner note for Phase 2. |
| Markdown injection in fixture content (e.g., a fixture with `<script>` in claim text) | Tampering | Markdown is rendered for Obsidian (which doesn't execute scripts in markdown); risk is low. Don't sanitize aggressively — Obsidian handles its own rendering safety. |
| pgAdmin default-credentials exposure on host network | Spoofing | `PGADMIN_DEFAULT_PASSWORD` from .env (not literal); pgAdmin only listens on localhost (docker compose default port mapping `127.0.0.1:5050:80` recommended for Phase 1) |
| Migration runs concurrently against the same DB | Tampering | node-pg-migrate uses an advisory lock by default — concurrent invocations queue. |

**Phase 1 security posture:** This is a single-user local CLI app; the security surface is minimal. The two real concerns are (1) preventing API-key leakage via .env-in-git, and (2) preventing SQL injection via Drizzle's parameterized queries. Both are addressed by the standard patterns above.

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` — schema, vault layout, frontmatter spec, build order, patterns, anti-patterns
- `.planning/research/STACK.md` — verified version pins, decisions, alternatives
- `.planning/research/PITFALLS.md` — 25 pitfalls; phase mapping
- `.planning/research/SUMMARY.md` — exec summary, build order rationale
- `.planning/inputs/karpathy-llm-wiki-gist.md` — index.md / log.md conventions
- `npm view` for: voyageai 0.2.1, ulid 3.0.2, node-pg-migrate 8.0.4, drizzle-orm 0.45.2, commander 14.0.3, vitest 4.1.5, hono 4.12.15, gray-matter 4.0.3, unified 11.0.5, remark-parse/stringify 11.0.0, zod 4.3.6, pg 8.20.0, tsx 4.21.0
- [pgvector official repo](https://github.com/pgvector/pgvector) — version 0.8.2, Docker tags `pgX-bookworm/-trixie`, HNSW syntax, iterative scan modes
- Node 22.20.0 verified locally; Docker 27.5.1 verified locally

### Secondary (MEDIUM confidence — verified via WebSearch with cross-reference)
- node-pg-migrate raw SQL file format support — [WebSearch confirmed via GitHub issue #242 + official Defining Migrations doc](https://github.com/salsita/node-pg-migrate/issues/242); raw SQL needs `--migration-file-language sql`; lacks generated `down()` helpers but accepts hand-written `-- Down Migration` sections
- pgvector iterative_scan modes — [Crunchy Data + AWS blog confirmed](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector); `relaxed_order` recommended for filtered + ordered queries (Phase 2 concern)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Voyage TypeScript SDK exact method signature — docs confirm Python `output_dimension`; TS SDK is Fern-generated (typically camelCase the parameter name to `outputDimension`); confirm at executor wave-0 smoke check (Assumption A1)
- Pino redact syntax for v9.x — assumed stable from v8.x (Assumption A6)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against npm registry on 2026-04-25
- Architecture / patterns: HIGH — directly inherited from ARCHITECTURE.md (the master architecture doc); locked decisions in CONTEXT.md
- Pitfalls (Phase 1 prevention): HIGH — PITFALLS.md is detailed and explicit on what each phase must verify
- Validation Architecture: HIGH — every requirement mapped to a concrete automated test
- Voyage SDK call shape: MEDIUM — see Assumption A1; verifiable in 5 minutes during executor wave 0

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (~30 days; stack is mature, but voyageai 0.2.x is in active development — re-verify SDK signature if executor wave starts > 30 days from now)

---

## RESEARCH COMPLETE

**Phase:** 1 — Walking Skeleton
**Confidence:** HIGH

### Key Findings
- Stack versions all verified against npm registry on 2026-04-25 (voyageai 0.2.1, ulid 3.0.2, node-pg-migrate 8.0.4, drizzle-orm 0.45.2, commander 14.0.3, vitest 4.1.5, gray-matter 4.0.3, unified 11.0.5, zod 4.3.6, pg 8.20.0, tsx 4.21.0); local env has Node 22.20.0, npm 11.6.2, Docker 27.5.1
- Append-only discipline is enforced at the **TypeScript API surface** (no `delete*()` exports from repo), not at the DB level — the DB *can* DELETE, the API doesn't expose it. Test verifies via reflective check on repo exports.
- Content hash determinism (success criterion #4 / COMP-07) requires: (1) sort claim arrays by ULID, (2) strip `generated_at`/`compile_run_id`/`content_hash` from frontmatter before hashing, (3) sort frontmatter keys alphabetically in canonical-JSON form. Implementing all three is mandatory.
- node-pg-migrate supports BOTH `.sql` and `.ts` migrations via `--migration-file-language` flag; ARCHITECTURE.md style is `.sql`, which is sufficient for Phase 1 (caveat: lacks JS-helper down() — `bsp db reset --confirm` covers dev rollback per D-07).
- Voyage 3.5 SDK call signature has one MEDIUM-confidence assumption (parameter name `outputDimension` vs `output_dimension`) — flag for executor wave-0 smoke check; cheap to verify (Assumption A1).
- All 28 Phase 1 requirements have a concrete automated test path identified in the Validation Architecture section.
- 11 of the 25 known pitfalls are *prevented* by Phase 1's no-agents constraint; each prevention has an explicit verification test (P2/P3/P4/P5/P14/P16/P18/P19/P21/P25/P12).

### File Created
`C:\Users\downe\spec-tests\test3-gsd\.planning\phases\01-walking-skeleton\01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions npm-verified on research date |
| Architecture | HIGH | Inherited from ARCHITECTURE.md + CONTEXT.md locked decisions |
| Pitfalls (Phase 1 prevention) | HIGH | Direct mapping from PITFALLS.md with verifiable tests |
| Validation Architecture | HIGH | Per-requirement test mapping; framework + commands concrete |
| Security Domain | HIGH | Single-user local CLI with minimal attack surface; standard mitigations |
| Voyage SDK call shape | MEDIUM | Documented assumption A1; verifiable in <5 min by executor |

### Open Questions
1. Fixture article choice (D-09) — non-blocking; planner picks during planning step from 3–5 candidate articles
2. node-pg-migrate `.sql` vs `.ts` choice — recommend `.sql` per ARCHITECTURE.md style; reversible per-migration if needed
3. Drizzle mirror review process — recommend `tests/integration/schema-parity.test.ts` to catch drift in dev
4. Re-ingest reporting payload (D-04) — minor UX detail
5. `bsp compile` with no claims — recommend friendly message + exit 0

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommend ~5–7 waves: (Wave 0) project scaffold + Docker + .env + tsconfigs + Vitest + ESLint; (Wave 1) migrations + schema mirror + types; (Wave 2) embed + repo + ULID + content-hash; (Wave 3) deterministic renderer + frontmatter + contradiction callout + vault writer; (Wave 4) CLI commands (commander wiring) + fixture file + index.md / log.md renderers; (Wave 5) integration test for full pipeline + hash-stability + append-only enforcement; (Wave 6) UI scaffold (`<h1>`) + final smoke; manual Obsidian verification.
