---
phase: 01-walking-skeleton
plan: 05
subsystem: cli
tags: [commander, cli, fixture-allowlist, security, voyage-esm-workaround]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: |
      Plan 01 (package.json bin field, npm scripts), Plan 02 (Zod types),
      Plan 03 (repo.write*, embed seam, logger), Plan 04 (runCompile, log-md helpers)
provides:
  - "bsp CLI binary — single commander entry dispatching ingest / compile / db migrate / db reset (D-01, D-02)"
  - "Fixture allowlist registry — Object.freeze + hasOwnProperty.call against static keys; the only safe path-traversal-proof loader for Phase 1+ (D-08, D-10)"
  - "Strategic-positioning fixture — Porter HBR 1996 'What Is Strategy?' with 7 claims, 7 cites_source, 1 contradicts (CRIT-05 keystone), 2 entities, 2 about_entity edges (D-09, D-11)"
  - "Ingest handler — walks fixture in P16 dependency order; D-04 duplicate-source skip with friendly message; D-08 bare-input rejection with Phase 2 hint"
  - "Compile handler — thin wrapper over runCompile with --json flag (D-05)"
  - "DB migrate / reset handlers — spawnSync npm-script delegate; reset drops public schema, re-migrates, clears vault/, calls resetLog (D-06, D-07, D-17)"
affects: [01-06-fixture-shape-and-success-criteria, 01-07-integration-tests, phase-2-agents-and-chat, phase-3-full-compilation]

# Tech tracking
tech-stack:
  added: []  # commander@14.0.3 was installed in Plan 01-01
  patterns:
    - "Lazy-import pattern — index.ts dynamic-imports each handler inside .action() so 'bsp --help' is fast and free of side effects"
    - "Fixture allowlist — frozen registry + hasOwnProperty.call lookup; no fs/path/dynamic-import operations"
    - "createRequire bypass — embed.ts loads voyageai's CJS build to dodge the broken ESM publication"
    - "Defense-in-depth on destructive ops — commander requiredOption('--confirm') + handler-side re-check"

key-files:
  created:
    - "src/cli/index.ts — commander entry with 4 subcommands; lazy-loaded handlers"
    - "src/cli/commands/ingest.ts — fixture loader, D-04 skip, D-08 bare-input rejection"
    - "src/cli/commands/compile.ts — runCompile wrapper with --json"
    - "src/cli/commands/db-migrate.ts — spawnSync 'npm run migrate'"
    - "src/cli/commands/db-reset.ts — DROP SCHEMA + re-migrate + clear vault + resetLog"
    - "src/cli/fixtures/index.ts — frozen FIXTURES allowlist + getFixture + listFixtures"
    - "src/cli/fixtures/strategic-positioning.ts — Porter 1996 fixture (7 claims, 1 contradicts)"
    - "tests/unit/fixture-shape.test.ts — 12 cases (registry + Porter shape)"
    - "tests/unit/cli-fixture-allowlist.test.ts — 4 cases (allowlist, path-traversal, empty)"
    - "tests/unit/cli-ingest-rejects-bare-input.test.ts — 2 cases (URL + file path rejection)"
  modified:
    - "src/onebrain/embed.ts — switched VoyageAIClient import to createRequire (Rule 3 deviation; see below)"

key-decisions:
  - "Lazy-import handlers in commander entry — 'bsp --help' must not trigger Voyage SDK loading. Each .action() now does 'await import(./commands/X)' so help text + arg-validation work without DB connection or embedding client."
  - "Fixture allowlist via Object.freeze + hasOwnProperty.call — defends against path traversal at the type AND runtime level. No dynamic import, no fs, no path. Tested in cli-fixture-allowlist with '../../../etc/passwd' → undefined."
  - "Porter fixture chooses the operational-effectiveness vs kaizen contradiction as CRIT-05 keystone — a real internal-to-source debate Porter discusses, not a synthetic contradiction. Claim A (confidence 0.85) vs Claim G (confidence 0.50) tests both confidence dimension and status preservation in the renderer."

patterns-established:
  - "CLI lazy-imports — index.ts is deliberately kept side-effect-free; only handler code touches DB/network"
  - "Fixture allowlist as the only ingestion path in Phase 1 — D-08 bare-input rejection is mechanical, not aspirational"
  - "createRequire for packages with broken ESM publishes — surgical fix without forcing the whole project to CJS"

requirements-completed: [DATA-04, DATA-08, DATA-10, COMP-01]

# Metrics
duration: ~16min
completed: 2026-04-26
---

# Phase 1 Plan 5: bsp CLI binary Summary

**Wires the `bsp` commander entry that the Plans 02-04 library functions sit behind — 4 subcommands (ingest/compile/db migrate/db reset), 1 fixture registry with security allowlist, 1 real-world Porter fixture (HBR 1996) with the CRIT-05 contradicts edge, 18 unit-test cases, 5 commits.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-04-26T15:01Z
- **Completed:** 2026-04-26T15:17Z
- **Tasks:** 3
- **Files created:** 10 (7 source + 3 test)
- **Files modified:** 1 (src/onebrain/embed.ts — voyageai ESM workaround)

## Tasks

| # | Task | Commits | Status |
|---|------|---------|--------|
| 1 | Fixture registry + Porter strategic-positioning fixture (D-09/D-10/D-11) | c31d4ee (RED), 2bb5ca6 (GREEN) | Done |
| 2 | Subcommand handlers — ingest/compile/db-migrate/db-reset (D-02 to D-08) | a7fe08e (RED), 24e7e73 (GREEN) | Done |
| 3 | Commander entry — src/cli/index.ts wiring all four subcommands (D-01/D-02/D-24) | 26625bf | Done (with Rule 1 + Rule 3 fixes) |

## Test Confirmation

```
npx vitest run tests/unit/fixture-shape.test.ts                       → 12/12 passed
npx vitest run tests/unit/cli-fixture-allowlist.test.ts               →  4/4 passed
npx vitest run tests/unit/cli-ingest-rejects-bare-input.test.ts       →  2/2 passed
npm test (full suite)                                                  → 130/130 passed (1 skipped: Voyage live)
npm run test:integration                                               → 19/19 passed (1 skipped)
npx tsc --noEmit -p tsconfig.node.json                                 → 0 errors
```

## Fixture Statistics (D-11 verification)

| Element | Count | Detail |
|---------|-------|--------|
| Sources | 1 | Porter "What Is Strategy?" — https://hbr.org/1996/11/what-is-strategy |
| Entities | 2 | Michael E. Porter (person), Japanese manufacturers 1980s (segment) |
| Claims | 7 | Kinds: 3 inference, 2 fact, 2 hypothesis. Confidences: 0.45, 0.50, 0.55, 0.65, 0.70, 0.75, 0.85 |
| `cites_source` edges | 7 | One per claim → source |
| `about_entity` edges | 2 | claim-A → Porter, claim-G → Japanese mfg |
| `contradicts` edges | 1 | **CRIT-05 keystone**: claim-A ↔ claim-G (operational-effectiveness-not-strategy vs kaizen-IS-the-engine) |

## Contradicting-pair rationale (D-09)

The fixture pairs **Claim A** ("operational effectiveness is necessary but NOT sufficient for sustainable advantage", confidence 0.85, Porter's argument) against **Claim G** ("continuous improvement IS the engine of sustainable advantage in manufacturing", confidence 0.50, the Japanese-management counter-position Porter critiques in the very same article). The contradiction is *internal to the source's discourse* — Porter sets up and refutes Claim G in his own text — making it a faithful representation of how strategy literature actually argues, not a synthetic injection. Wave 5's success-criterion-#4 test (rendered topic page MUST contain `> [!warning] Contradiction` callout) is non-trivially passable on this fixture.

## CLI help output verification

```
$ npm run bsp -- --help
Usage: bsp [options] [command]

Business Strategy Planner CLI (Phase 1: walking skeleton)

Options:
  -V, --version             output the version number
  -h, --help                display help for command

Commands:
  ingest [options] [input]  Ingest a source into OneBrain (Phase 1: --fixture
                            only; bare URL/file paths rejected per D-08)
  compile [options]         Render OneBrain rows into the Obsidian vault
                            (D-13/D-14)
  db                        Database lifecycle operations (D-06, D-07)
  help [command]            display help for command
```

`bsp db reset` (no `--confirm`):

```
error: required option '--confirm' not specified
  (exits 1 — commander's requiredOption enforcement)
```

`bsp ingest --fixture does-not-exist`:

```
Unknown fixture 'does-not-exist'. Available: strategic-positioning
  (exits 1 — D-08 allowlist)
```

`bsp ingest https://example.com`:

```
Bare URL/file input is not supported in Phase 1.
Use --fixture <name>. Real source ingestion lands in Phase 2 (research sub-agent).
Available fixtures: strategic-positioning
  (exits 1 — D-08 bare-input rejection)
```

`bsp db reset --confirm` (live run): drops public schema, re-applies migrations, clears vault/, succeeds with `Reset complete: schema dropped + migrated, vault/ cleared.` — verified end-to-end against the live Postgres on port 5432.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] commander 14 rejects `-vv` as a short flag**

- **Found during:** Task 3 (`npm run bsp -- --help` smoke)
- **Issue:** RESEARCH.md §"commander CLI skeleton" line 1020 specified `.option('-vv, --very-verbose', ...)`. commander 14.0.3 raises `Error: option creation failed due to '-vv' in option flags '-vv, --very-verbose' — a short flag is a single dash and a single character`.
- **Fix:** Removed the `-vv` short alias; kept `--very-verbose` long form. Spirit of D-05 verbosity ladder preserved (still has `-v, --verbose` and `--very-verbose`).
- **Files modified:** src/cli/index.ts
- **Commit:** 26625bf

**2. [Rule 3 - Blocking] voyageai@0.2.1 ESM build is broken under tsx + NodeNext**

- **Found during:** Task 3 (running `bsp ingest --fixture strategic-positioning` smoke)
- **Issue:** `tsx src/cli/index.ts ingest` fails with `ERR_MODULE_NOT_FOUND: Cannot find module 'voyageai/dist/esm/api/index.jsx'`. voyageai's ESM build (`dist/esm/extended/index.mjs`) does `export * from "../api"` (extension-less), which violates NodeNext resolution. tsx tries `../api.jsx` and `../api/index.jsx` — neither exist. The CJS build at `dist/cjs/extended/index.js` is correct; only the ESM `import` exports condition is broken.
- **Fix:** Changed `src/onebrain/embed.ts` from `import { VoyageAIClient } from 'voyageai'` to a `createRequire(import.meta.url)('voyageai')` call. This forces NodeNext to take the `require` exports condition (`./dist/cjs/extended/index.js`) which works correctly. Kept a type-only import (`type VoyageAIClientType = import('voyageai').VoyageAIClient`) so the public API of embed.ts is unchanged.
- **Verification:** Full unit test suite still passes (130/130), full integration test suite still passes (19/19) — vi.mock targets `@/onebrain/embed` so the change is transparent to tests. `bsp` now runs end-to-end against the live DB.
- **Files modified:** src/onebrain/embed.ts
- **Commit:** 26625bf

**3. [Rule 1 - Bug] Plan's `entityIdMap.set(localId, …)` referenced un-destructured variable**

- **Found during:** Task 2 (writing the GREEN implementation)
- **Issue:** The plan's reference code in `<action>` for ingest.ts had:
  ```typescript
  for (const e of fixture.entities) {
    const entityInput = { kind: e.kind, name: e.name, ... };
    const written = await writeEntity(entityInput);
    entityIdMap.set(localId, written.id);  // 'localId' is undefined here
  }
  ```
  The `localId` identifier was never destructured from `e`. Would have been a TS error and a runtime crash.
- **Fix:** Used `entityIdMap.set(e.localId, written.id)` instead. Mirrors the same pattern used a few lines below for claims (which destructures `{ localId, ...claimInput } = c`).
- **Files modified:** src/cli/commands/ingest.ts
- **Commit:** 24e7e73

## Authentication Gates

**Voyage API key — gates the live ingest end-to-end smoke**

- **Where:** Running `bsp ingest --fixture strategic-positioning` against the live DB
- **Symptom:** Returns `401 Unauthorized` from `https://api.voyageai.com/v1/embeddings`
- **Status:** Expected by design (D-12). The `.env` ships with `VOYAGE_API_KEY=` empty; the test suite mocks Voyage for unit + integration runs; only `RUN_VOYAGE_TESTS=1` and a real key are needed to drive live embeddings.
- **What works without a key:** Everything except the actual `bsp ingest --fixture …` end-to-end against the live DB. Help output, allowlist rejection, bare-input rejection, db migrate, db reset, and the entire 130-case test suite all pass with `VOYAGE_API_KEY=`.
- **Resolution:** User provides a Voyage key in `.env` (Voyage AI dashboard → API keys → create) when they want to drive a live ingest. Phase 2's research sub-agent will need this key anyway, so it'll be acquired no later than Plan 02-01.

This is documented as the planned Phase 1 stance, not a deviation. The plan's task-level `<verify>` blocks (vitest + tsc) all pass without a key. Only the orchestrator-level success-criterion #2 ("`bsp ingest --fixture strategic-positioning` succeeds against the live DB") needs a real key.

## Plan-Level Acceptance Criteria

- [x] All 3 tasks executed and committed individually (5 commits total: 2 RED + 2 GREEN + 1 feat)
- [x] SUMMARY.md created (this file)
- [x] STATE.md and ROADMAP.md updated (next step)
- [x] `npm test` passes — 130/130 (no regressions; +18 tests over Plan 04's baseline)
- [x] `npm run bsp -- --help` shows ingest/compile/db migrate/db reset subcommands
- [-] `npm run bsp -- ingest --fixture strategic-positioning` succeeds against the live DB — **gated by Voyage API key (see Authentication Gates above)**
- [-] `npm run bsp -- compile` runs the renderer against populated DB — **same gate**
- [x] Fixture allowlist test confirms only registered fixtures can be ingested (no bare-input path) — `cli-fixture-allowlist.test.ts` 4/4 pass
- [x] Porter fixture creates at least one `contradicts` edge (CRIT-05 keystone) — `fixture-shape.test.ts` enforces exactly 1

## TDD Gate Compliance

Tasks 1 and 2 followed RED → GREEN cycles:

- Task 1: `c31d4ee test(01-05): add failing tests for fixture registry shape` (RED), `2bb5ca6 feat(01-05): add fixture registry and Porter strategic-positioning fixture` (GREEN)
- Task 2: `a7fe08e test(01-05): add failing tests for CLI fixture allowlist and bare-input rejection` (RED), `24e7e73 feat(01-05): add ingest/compile/db-migrate/db-reset subcommand handlers` (GREEN)
- Task 3: not TDD (per plan; verification is via help-output check + tsc).

## Self-Check: PASSED

- [x] src/cli/index.ts — exists
- [x] src/cli/commands/ingest.ts — exists
- [x] src/cli/commands/compile.ts — exists
- [x] src/cli/commands/db-migrate.ts — exists
- [x] src/cli/commands/db-reset.ts — exists
- [x] src/cli/fixtures/index.ts — exists
- [x] src/cli/fixtures/strategic-positioning.ts — exists
- [x] tests/unit/fixture-shape.test.ts — exists
- [x] tests/unit/cli-fixture-allowlist.test.ts — exists
- [x] tests/unit/cli-ingest-rejects-bare-input.test.ts — exists
- [x] commit c31d4ee — exists
- [x] commit 2bb5ca6 — exists
- [x] commit a7fe08e — exists
- [x] commit 24e7e73 — exists
- [x] commit 26625bf — exists
