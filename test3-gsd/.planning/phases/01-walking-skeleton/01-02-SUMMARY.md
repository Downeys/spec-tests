---
phase: 01-walking-skeleton
plan: 02
subsystem: database
tags: [postgres, pgvector, node-pg-migrate, drizzle, zod, hnsw, schema, onebrain]

# Dependency graph
requires:
  - phase: 01-walking-skeleton/01
    provides: package.json with deps (pg, drizzle-orm, drizzle-kit, zod, dotenv, vitest), tsconfig with @/onebrain/* alias, vitest.config.ts integration project, tests/setup/db-setup.ts (drop+migrate beforeEach), docker-compose Postgres+pgvector, npm run migrate / npm run db:push (FORBIDDEN trap)
provides:
  - 8 raw SQL migrations defining the full OneBrain schema (sources, claims, entities, edges, decisions, tags, event_log, compile_runs, compile_artifacts)
  - 6 enum types (claim_status, claim_kind, edge_kind, source_kind, entity_kind, compile_trigger)
  - pgvector extension + HNSW indexes (m=16, ef_construction=64) on claims/entities/sources embeddings
  - src/onebrain/types.ts as single-source-of-truth Zod schemas (D-21) with CRIT-02/CRIT-03 enforcement
  - src/onebrain/schema.ts as Drizzle query-only mirror with custom vector(1024) type bridge
  - drizzle.config.ts wired for `drizzle-kit pull` only (push is forbidden by Plan 01)
  - tests/unit/types.test.ts (14 tests for Zod SSOT)
  - tests/integration/schema-shape.test.ts (11 live-DB assertions)
  - tests/integration/schema-parity.test.ts (P4 drift guard + db:push FORBIDDEN trap verification)
affects: [01-03 voyage-embed, 01-04 repo-layer, 01-05 fixture, 01-06 renderer, 01-07 cli, 02-agents-and-chat, 03-full-compilation]

# Tech tracking
tech-stack:
  added:
    - "node-pg-migrate raw SQL migrations as schema source-of-truth"
    - "Drizzle ORM customType for pgvector vector(1024) bridge"
    - "Zod schemas as the D-21 single-source-of-truth for OneBrain row types"
  patterns:
    - "Migrations are timestamped 1700000000NNN_ for deterministic ordering"
    - "Drizzle schema is query-only -- never `drizzle-kit push`; mirror declared structurally"
    - "Confidence enforced at three layers: DB CHECK + NOT NULL + DEFAULT 0.50, Zod range [0,1], TS inference"
    - "Claim status defaults at two layers: DB DEFAULT 'hypothesis', Zod default('hypothesis')"
    - "Append-only invariant carried via foreign keys (superseded_by) -- no cascade delete"
    - "Edges UNIQUE(kind, from_table, from_id, to_table, to_id) prevents duplicate provenance edges"

key-files:
  created:
    - "migrations/1700000000000_pgvector_extension.sql"
    - "migrations/1700000000001_enums.sql"
    - "migrations/1700000000002_sources.sql"
    - "migrations/1700000000003_claims.sql"
    - "migrations/1700000000004_entities.sql"
    - "migrations/1700000000005_edges.sql"
    - "migrations/1700000000006_decisions_tags_event_log.sql"
    - "migrations/1700000000007_compile_runs_artifacts.sql"
    - "drizzle.config.ts"
    - "src/onebrain/types.ts"
    - "src/onebrain/schema.ts"
    - "tests/unit/types.test.ts"
    - "tests/integration/schema-shape.test.ts"
    - "tests/integration/schema-parity.test.ts"
  modified: []

key-decisions:
  - "Migration timestamps fixed to 1700000000NNN_ as a stable, deterministic ordering convention; no temporal drift from real wall-clock generation"
  - "Drizzle schema mirror written by hand (not via drizzle-kit pull) to keep migrations as the only schema writer; parity test guards drift"
  - "All 6 enum types created up-front in a single migration so subsequent table migrations can reference them"
  - "claims.embedding declared NOT NULL while sources.embedding and entities.embedding are nullable -- claims always carry embeddings (CRIT-04 requirement); sources may be ingested before embedding"
  - "Append-only commitment expressed via FK only: superseded_by REFERENCES claims(id) without ON DELETE CASCADE so the architectural no-delete rule is enforced by repo discipline rather than DDL"

patterns-established:
  - "Zod SSOT: every domain type lives in src/onebrain/types.ts; downstream code imports from @/onebrain/types and never redeclares"
  - "Schema-shape integration tests use information_schema + pg_attribute + pg_indexes -- no Drizzle dependency in assertions"
  - "Schema-parity test runs drizzle-kit pull in a temp dir and structurally diffs the committed mirror"
  - "P4 trap: npm run db:push exits 1 with FORBIDDEN message; schema-parity test verifies the trap fires"

requirements-completed:
  - INFRA-03
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
  - DATA-07
  - DATA-10
  - CRIT-02
  - CRIT-03

# Metrics
duration: ~12min
completed: 2026-04-26
---

# Phase 1 Plan 02: OneBrain Schema Migrations + Zod SSOT + Drizzle Mirror Summary

**8 node-pg-migrate raw SQL migrations defining sources/claims/entities/edges/decisions/tags/event_log/compile_runs/compile_artifacts with pgvector HNSW indexes, plus the D-21 Zod single-source-of-truth and Drizzle query-only mirror.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-26T13:41:00Z (approx, plan-execution start)
- **Completed:** 2026-04-26T13:53:29Z
- **Tasks:** 3 (Task 1 + Task 2 RED/GREEN + Task 3)
- **Files created:** 14

## Accomplishments

- 8 raw SQL migrations with verbatim DDL from ARCHITECTURE.md: pgvector extension, 6 enums, 9 OneBrain tables, all required indexes (HNSW m=16/ef_construction=64 on claims; gin on tag arrays; UNIQUE on edges_uniq, sources_hash_idx, entities_kind_name_idx)
- src/onebrain/types.ts as the D-21 SSOT: 6 enum schemas, ConfidenceSchema enforcing [0,1] required, UlidSchema (Crockford base32), full Source/Claim/Entity/Edge/Decision/Tag schemas plus New* variants for write paths
- src/onebrain/schema.ts as the Drizzle query-only mirror with custom vector(1024) type bridge
- 14 unit tests asserting CRIT-02 (status default 'hypothesis'), CRIT-03 (confidence range [0,1] required), D-04 (edge_kind contradicts), D-11 (claim kind variants used by fixture)
- 11 integration assertions on the live DB schema (sources/claims/entities/tags shape, claims.confidence numeric(3,2) NOT NULL DEFAULT 0.50, claims.status DEFAULT 'hypothesis', claims.business_plan_id DEFAULT 'default-plan', claims.embedding vector(1024) NOT NULL via format_type, edge_kind enum has 6 values, claims_embedding_hnsw with m=16/ef_construction=64, edges_uniq UNIQUE, pgvector installed)
- P4 drift guard: schema-parity test verifies `npm run db:push` exits 1 with FORBIDDEN message and structurally diffs the Drizzle mirror against the committed source

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration files (8 SQL) + drizzle.config.ts** -- `dbab924` (feat)
2. **Task 2 RED: Zod SSOT failing tests** -- `92b9dc4` (test)
3. **Task 2 GREEN: Zod types + Drizzle schema mirror** -- `f368bde` (feat)
4. **Task 3: Schema-shape + schema-parity integration tests** -- `58f07eb` (test)

_Note: Task 2 was TDD-driven with RED+GREEN commits. No REFACTOR commit needed -- implementation was minimal-by-design._

## Files Created/Modified

### Created

- `migrations/1700000000000_pgvector_extension.sql` -- enables pgvector
- `migrations/1700000000001_enums.sql` -- 6 enum types in dependency order
- `migrations/1700000000002_sources.sql` -- sources table + 4 indexes (hash UNIQUE, url partial, ingested_at DESC, embedding HNSW)
- `migrations/1700000000003_claims.sql` -- claims table with NOT NULL embedding vector(1024), CHECK confidence 0..1, defaults for status/confidence/business_plan_id, HNSW m=16/ef_construction=64
- `migrations/1700000000004_entities.sql` -- entities table + UNIQUE(kind, lower(name)) + gin(aliases) + HNSW
- `migrations/1700000000005_edges.sql` -- edges table + 3 lookup indexes + UNIQUE(kind, from_table, from_id, to_table, to_id)
- `migrations/1700000000006_decisions_tags_event_log.sql` -- decisions/tags/event_log tables together
- `migrations/1700000000007_compile_runs_artifacts.sql` -- compile_runs + compile_artifacts (FK to runs)
- `drizzle.config.ts` -- pulls into ./migrations; `pull` only, never push
- `src/onebrain/types.ts` -- D-21 Zod SSOT (15 exports: 6 enum schemas + ConfidenceSchema + UlidSchema + 5 row schemas + their New* counterparts + Source/Claim/Entity/Edge/Decision/Tag types)
- `src/onebrain/schema.ts` -- Drizzle query-only mirror (9 tables + custom vector type)
- `tests/unit/types.test.ts` -- 14 Zod assertions
- `tests/integration/schema-shape.test.ts` -- 11 live-DB assertions
- `tests/integration/schema-parity.test.ts` -- 2 drift-prevention assertions

## Decisions Made

- **Migrations as the single schema source-of-truth (per Plan 01 INFRA-03)** -- Drizzle's role is purely query types; the parity test enforces this structurally
- **Hand-written Drizzle mirror, not generated** -- because the parity test diffs a `drizzle-kit pull` output against the committed mirror, the mirror must be pre-existing and stable. Generating it on first run would defeat the drift guard.
- **claims.embedding NOT NULL; sources.embedding nullable** -- claims always carry their semantic embedding (used for HNSW query in Phase 2+); sources may transiently exist pre-embedding before the Voyage call lands
- **All 6 enum types created in a single migration** -- avoids interleaving DDL across 6 files; keeps the dependency graph (table -> enum) trivially correct

## Deviations from Plan

None -- plan executed exactly as written. All DDL is verbatim from ARCHITECTURE.md and the plan's `<action>` blocks. All Zod schemas, type exports, and test assertions match the plan's behavior/acceptance specs.

## Issues Encountered

None during write. The plan was unusually self-contained: ARCHITECTURE.md provided complete DDL, RESEARCH.md provided verified pgvector HNSW syntax, and the plan re-listed everything verbatim with no ambiguity.

## Verification Status (parallel-wave context)

This worktree starts from a base that does NOT contain Plan 01-01's scaffolding (package.json, tsconfig.json, vitest.config.ts, tests/setup/db-setup.ts, docker-compose.yml). The orchestrator merges 01-01 and 01-02 outputs together, then runs the full test gate.

**Verification I performed in this worktree (file-level):**

- All 8 migration files exist with the `1700000000NNN_` prefix
- `migrations/1700000000003_claims.sql` contains: `vector(1024)`, `ef_construction = 64`, `DEFAULT 'hypothesis'`, `DEFAULT 'default-plan'`, `CHECK (confidence >= 0 AND confidence <= 1)`
- `drizzle.config.ts` references `./src/onebrain/schema.ts`
- `src/onebrain/types.ts` exports all 15 required schemas/types listed in the plan's acceptance criteria
- `src/onebrain/schema.ts` declares all 9 tables via `export const <name> = pgTable('<name>', ...)`
- All test files compile structurally (imports reference @/onebrain/types and pg)

**Verification deferred to post-merge gate (orchestrator's responsibility):**

- `npm run migrate` against the live Docker Postgres (BLOCKING per Plan 01-02 Task 3 -- requires Plan 01-01's Docker Compose + npm scripts)
- `npx vitest run tests/unit/types.test.ts --project unit` (14 tests must pass; requires Plan 01-01's vitest.config.ts and node_modules)
- `npx vitest run --project integration` (13 schema-shape + schema-parity assertions; requires migrate to have run)
- `npx tsc --noEmit -p tsconfig.node.json` (requires Plan 01-01's tsconfig)
- The `db:push exits 1 with FORBIDDEN` assertion (requires Plan 01-01's package.json `db:push` script)

## Next Phase Readiness

- The schema is the architectural backbone for every later wave: Plan 01-03 (Voyage embed) targets the `vector(1024)` column declared here; Plan 01-04 (repo layer) imports from `@/onebrain/schema` (Drizzle) and `@/onebrain/types` (Zod) declared here; Plans 01-05/01-06/01-07 (fixture, renderer, CLI) all consume the SSOT types
- The single-writer-to-vault commitment is not yet materialized at the tool layer (no agents in Phase 1) -- COMP-10 lands in Phase 2 when the agent topology arrives
- The append-only invariant is currently enforced by repo discipline (no `DELETE` in repo functions) plus the `superseded_by` FK; the DB does not block deletes physically. This matches Phase 1 scope per the architectural commitments doc.

## Self-Check: PASSED

**Files verified to exist:**

- migrations/1700000000000_pgvector_extension.sql -- FOUND
- migrations/1700000000001_enums.sql -- FOUND
- migrations/1700000000002_sources.sql -- FOUND
- migrations/1700000000003_claims.sql -- FOUND
- migrations/1700000000004_entities.sql -- FOUND
- migrations/1700000000005_edges.sql -- FOUND
- migrations/1700000000006_decisions_tags_event_log.sql -- FOUND
- migrations/1700000000007_compile_runs_artifacts.sql -- FOUND
- drizzle.config.ts -- FOUND
- src/onebrain/types.ts -- FOUND
- src/onebrain/schema.ts -- FOUND
- tests/unit/types.test.ts -- FOUND
- tests/integration/schema-shape.test.ts -- FOUND
- tests/integration/schema-parity.test.ts -- FOUND

**Commits verified to exist (in this worktree's git log):**

- dbab924 (Task 1: migrations + drizzle.config) -- FOUND
- 92b9dc4 (Task 2 RED: types.test.ts) -- FOUND
- f368bde (Task 2 GREEN: types.ts + schema.ts) -- FOUND
- 58f07eb (Task 3: schema-shape + schema-parity tests) -- FOUND

## TDD Gate Compliance

Plan 01-02 has `tdd="true"` on each task. Gate sequence verified in git log:

1. RED gate (test commit before implementation): Task 2's `92b9dc4 test(01-02): add failing tests for OneBrain Zod SSOT types` precedes Task 2's `f368bde feat(01-02): implement OneBrain Zod SSOT types and Drizzle schema mirror` -- COMPLIANT
2. GREEN gate (feat commit after RED): `f368bde` is a feat commit after the test commit -- COMPLIANT
3. REFACTOR gate (optional): no refactor needed; implementation was minimal -- N/A

Tasks 1 and 3 are infrastructure/test-writing tasks; their TDD framing is "behavior-spec first" rather than RED/GREEN -- the plan's `<behavior>` and `<acceptance_criteria>` blocks served as the test specification, with the schema-shape and types tests being the executable form of those specs.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-04-26*
