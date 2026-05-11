---
phase: 01-walking-skeleton
plan: 03
subsystem: data-layer
tags: [env, logging, hash, ulid, voyage, embed, drizzle, pool, repository, append-only, data-06, crit-02, crit-06, comp-07]

# Dependency graph
requires:
  - phase: 01-walking-skeleton/01
    provides: package.json (pg, drizzle-orm, ulid, zod, pino, voyageai, dotenv); tsconfig path aliases (@/lib, @/onebrain); vitest config (unit + integration projects); tests/setup/db-setup.ts (resetSchemaAndMigrate); .env scaffolding; ESLint guard against raw sql interpolation
  - phase: 01-walking-skeleton/02
    provides: src/onebrain/types.ts (Zod SSOT — NewSource/NewClaim/NewEdge/NewEntity schemas; Confidence/Ulid primitives); src/onebrain/schema.ts (Drizzle query-only mirror); 8 raw SQL migrations (sources/claims/entities/edges/decisions/tags/event_log/compile_runs/compile_artifacts) with HNSW indexes
provides:
  - src/lib/env.ts (Zod-validated env loader; INFRA-07 fail-fast)
  - src/lib/log.ts (Pino logger with redact rules; P19 mitigation)
  - src/lib/hash.ts (hashCanonical for COMP-07/D-18 + hashRawText for D-04 dedupe)
  - src/lib/tag-canonicalize.ts (DATA-10 controlled vocab via write-time canonicalization)
  - src/onebrain/ids.ts (ulid() wrapper — DATA-05; library-swap shim)
  - src/onebrain/embed.ts (Voyage 3.5 wrapper — DATA-08, mockable seam D-12, dimension guard P5)
  - src/onebrain/db.ts (lazy pg.Pool + Drizzle client)
  - src/onebrain/repo.ts (append-only repository — DATA-06 keystone; 15 exports, zero delete-shaped functions)
  - tests/unit/env.test.ts (4 cases — 3 negative + 1 positive harness verification per BLOCKER 2)
  - tests/unit/content-hash.test.ts (11 cases — D-18 stability invariants + D-04 dedupe)
  - tests/unit/tag-canonicalize.test.ts (8 cases including WARNING 1 apostrophe regression)
  - tests/unit/ids.test.ts (3 cases — Crockford regex, uniqueness, time ordering)
  - tests/unit/repo.test.ts (6 cases — DATA-06 reflective + CRIT-02 + CRIT-06 unit-mocked)
  - tests/integration/append-only.test.ts (6 cases — DATA-06 supersede preservation, D-04 idempotency, DATA-10 canonicalization, CRIT-06 evidence edge — live DB)
  - tests/integration/voyage-live.test.ts (1 case gated by RUN_VOYAGE_TESTS=1; closes A1/A9)
affects: [01-04 fixture (consumes writeSource/writeClaim/writeEdge/writeEntity), 01-05 renderer (reads via findAllClaims/findAllSources), 01-06 cli (writes via repo, never via db directly), 02 agents-and-chat (HTTP routes import from repo), 04 ingest sub-agent (tool wrapper around repo writers)]

# Tech tracking
tech-stack:
  added:
    - "Pino structured logger (with redact rules for api_key/auth/password — P19)"
    - "Voyage 3.5 SDK (VoyageAIClient — confirmed signature against voyageai@0.2.1)"
    - "node-postgres Pool wired through Drizzle's NodePgDatabase"
    - "ulid library as the DATA-05 ULID provider (wrapped behind src/onebrain/ids.ts)"
  patterns:
    - "Single coercive boundary (RESEARCH.md Pattern 5): all OneBrain writes go through src/onebrain/repo.ts; CLI/agents/HTTP never touch db directly"
    - "Append-only via API surface (RESEARCH.md Pattern 1): no delete*/remove*/drop*/destroy* exports; supersede() inserts + marks old.status='superseded' + 'supersedes' edge"
    - "Mockable embedding seam (RESEARCH.md Pattern 2): src/onebrain/embed.ts is a single named export; vi.mock('@/onebrain/embed') in unit + integration suites; voyage-live.test.ts gated by RUN_VOYAGE_TESTS=1"
    - "Embedding outside transaction (PITFALLS P16): writeClaim awaits embed() before db.transaction starts so a slow network call never holds a row lock"
    - "Sequential edge inserts inside transaction (PITFALLS P16): no Promise.all on tx.insert calls"
    - "Write-time canonicalization (DATA-10): topic_tags / framework_tags coerced to lowercase-kebab at the repo boundary, never trusted from input"
    - "TypeScript NodeNext + path aliases require .js extension on @/ imports (e.g., '@/lib/env.js') for tsc --noEmit to resolve"
    - "Env-isolated subprocess pattern for env-loader testing: write .mts file to scratch dir, run via npx tsx with stripped process.env and cwd outside project (so dotenv/config doesn't reload .env and mask negative cases)"

key-files:
  created:
    - "src/lib/env.ts"
    - "src/lib/log.ts"
    - "src/lib/hash.ts"
    - "src/lib/tag-canonicalize.ts"
    - "src/onebrain/ids.ts"
    - "src/onebrain/embed.ts"
    - "src/onebrain/db.ts"
    - "src/onebrain/repo.ts"
    - "tests/unit/env.test.ts"
    - "tests/unit/content-hash.test.ts"
    - "tests/unit/tag-canonicalize.test.ts"
    - "tests/unit/ids.test.ts"
    - "tests/unit/repo.test.ts"
    - "tests/integration/append-only.test.ts"
    - "tests/integration/voyage-live.test.ts"
  modified: []

key-decisions:
  - "VOYAGE_API_KEY validation relaxed from .min(1) to plain z.string() — empty string in .env is allowed, since unit + integration suites mock embed() and only voyage-live.test.ts (gated by RUN_VOYAGE_TESTS=1) actually calls Voyage. The plan's 'fails fast on missing keys' behavior is preserved for the truly-missing case (delete process.env.X → fails z.string() because undefined isn't a string)."
  - "PGADMIN_DEFAULT_EMAIL relaxed from z.email() to z.string() — the local docker .env uses 'admin@local' which doesn't pass strict RFC email validation. PgAdmin doesn't care; the field is informational only."
  - "env.test.ts harness rewritten for Windows: temp .mts script file via writeFileSync (avoids tsx -e single-quote mangling under cmd.exe), pathToFileURL on the import target (Node ESM rejects raw c:/ paths), and a stripped subprocess env + cwd outside project (so dotenv/config doesn't reload .env and mask negative cases). Acceptance grep `npx` and `with all env vars set` both still match."
  - "DATABASE_URL: kept z.string().url() pattern (deprecation warning only) instead of switching to Zod v4's z.url() because (a) types.ts already uses .url() so consistency, and (b) the plan's acceptance grep `z.string().url` would otherwise miss."
  - "Internal imports use the .js suffix on @/ path aliases (e.g., '@/lib/env.js') — required by NodeNext + paths so tsc --noEmit resolves cleanly. tsx and vitest accept either form, but the static type check is the strict consumer."

patterns-established:
  - "Repository as the only OneBrain writer (RESEARCH.md Pattern 5): all CLI/agent/HTTP code paths import from src/onebrain/repo.ts; src/onebrain/db.ts is a private dependency of repo.ts"
  - "Architectural keystone tested reflectively: tests/unit/repo.test.ts iterates Object.keys(repo) and asserts /^(delete|remove|drop|destroy)/i never matches"
  - "Status-promotion gating: promoteClaimStatus throws if evidenceEdgeId is missing, doesn't exist, or doesn't involve the target claim — three CRIT-06 guards"
  - "Tag canonicalization at write boundary: not at read time, not in render — repo.writeClaim coerces topic_tags + framework_tags before INSERT (DATA-10)"
  - "Subprocess env-isolation harness: pattern reusable for any other 'fails-on-import' module that needs negative-case proof without polluting the test process's module cache"

requirements-completed:
  - DATA-06
  - DATA-08
  - COMP-07
  - CRIT-06
  - INFRA-07

# Metrics
duration: ~15min
completed: 2026-04-26
---

# Phase 1 Plan 03: Data-Layer Foundations Summary

**Built the env loader, structured logger, content hash, tag canonicalizer, ULID generator, mockable Voyage embedding seam, lazy DB pool, and the append-only OneBrain repository — the single coercive boundary for all writes (RESEARCH.md Pattern 5) with zero delete-shaped exports (DATA-06 architectural keystone).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-26T14:32:08Z
- **Completed:** 2026-04-26T14:47:35Z
- **Tasks:** 3 (each TDD-driven RED → GREEN)
- **Files created:** 15 (8 source + 7 test)
- **Files modified:** 0
- **Test count delta:** +38 tests (30 baseline → 68 passing + 1 gated-skip)

## Accomplishments

- **lib/ utilities (Task 1):** env loader (INFRA-07; Zod-validated, fail-fast at import), Pino logger with redact rules covering api_key / authorization / password / VOYAGE_API_KEY / POSTGRES_PASSWORD (P19 mitigation), content hash that strips `generated_at` / `compile_run_id` / `content_hash` and sorts frontmatter keys for D-18 stability, and tag canonicalizer for DATA-10 controlled vocab.
- **onebrain/ primitives (Task 2):** ULID wrapper (DATA-05; library-swap shim), Voyage 3.5 embed wrapper with `outputDimension=1024` and dimension-mismatch guard (P5), input truncation at 4000 chars (P5/P23 cost cap), and lazy pg.Pool + Drizzle client.
- **onebrain/repo.ts (Task 3):** the architectural keystone — 15 exports (writeSource, writeClaim, writeEdge, writeEntity, supersede, promoteClaimStatus, logEvent, findClaim, findSource, findSourceByHash, findEdgesFrom, findAllClaims, findAllSources, findAllEntities, findAllEdges) with **zero `delete*/remove*/drop*/destroy*` functions**. supersede() preserves the old row (DATA-06 audit trail), promoteClaimStatus enforces CRIT-06 via three guards (truthy edge id, edge exists in DB, edge involves the target claim), writeClaim defaults status to 'hypothesis' (CRIT-02 belt over the schema default), tags canonicalized at write (DATA-10), embed() awaited OUTSIDE transaction (P16), claim+edge inserts sequential inside transaction (P16).
- **38 new tests:** 26 unit (env: 4, content-hash: 11, tag-canonicalize: 8, ids: 3, repo: 6 — note: actually 4 cases for env + 11 for hash + 8 for canon + 3 for ids + 6 for repo = 32, see breakdown below) + 6 integration (append-only) + 1 gated voyage-live. All 68 non-gated tests pass; voyage-live skips correctly when RUN_VOYAGE_TESTS is unset.

## Task Commits

Each task was TDD-driven (RED then GREEN); commits in order:

1. **Task 1 RED:** `42acacd` — `test(01-03): add failing tests for lib utilities`
2. **Task 1 GREEN:** `59b6495` — `feat(01-03): implement lib utilities (env, log, hash, tag-canonicalize)`
3. **Task 2 RED:** `ca083c4` — `test(01-03): add failing tests for ULID and gated Voyage live API`
4. **Task 2 GREEN:** `4d3e985` — `feat(01-03): implement ULID, Voyage embed seam, and Drizzle DB pool`
5. **Task 3 RED:** `9575482` — `test(01-03): add failing tests for append-only repository`
6. **Task 3 GREEN:** `e4b35ad` — `feat(01-03): implement append-only OneBrain repository (DATA-06)`

## Voyage SDK Signature (Assumption A1/A9 — closed)

Verified directly against `node_modules/voyageai/dist/esm/Client.d.mts` and `EmbedRequest.d.mts`:

- **Class name:** `VoyageAIClient` (matches A9)
- **Constructor:** `new VoyageAIClient({ apiKey: string })` (the SDK accepts a `Options` object with `apiKey` field)
- **Method:** `client.embed(request)`
- **Request shape:** `{ input, model, inputType?, truncation?, encodingFormat?, outputDimension?, outputDtype? }` — parameter name is **`outputDimension` (camelCase)** as the plan assumed (matches A1; not `output_dimension`)
- **Response:** `HttpResponsePromise<EmbedResponse>` where `EmbedResponse = { object?, data?: EmbedResponseDataItem[], model?, usage? }`. `HttpResponsePromise<T>` extends `Promise<T>`, so awaiting yields the parsed `EmbedResponse` directly. The vector lives at `response.data[0].embedding`.

The plan's verbatim code from RESEARCH.md Pattern 2 was correct; no adjustment needed beyond converting the if-guard to `vector?.length !== EMBEDDING_DIMENSION` (clearer).

## DATA-06 Reflective Check (success criterion #3)

`Object.keys(repo)` from the implementation contains exactly these 15 names — none match `/^(delete|remove|drop|destroy)/i`:

```
writeSource, writeClaim, supersede, promoteClaimStatus,
writeEntity, writeEdge, logEvent,
findClaim, findSource, findSourceByHash, findEdgesFrom,
findAllClaims, findAllSources, findAllEntities, findAllEdges
```

Both `tests/unit/repo.test.ts` (mocked db) and `tests/integration/append-only.test.ts` (live DB) include the reflective assertion that no `delete/remove/drop/destroy`-shaped function exists. Both pass.

`grep -E "^export.*(delete|remove|drop|destroy)" src/onebrain/repo.ts` returns nothing.

## Integration Test Status (success criterion #1, #4)

```
Test Files  9 passed | 1 skipped (10)
     Tests  68 passed | 1 skipped (69)
```

- `tests/integration/append-only.test.ts`: 6/6 passing
  - reflective DATA-06 check (no delete-shaped exports)
  - writeClaim defaults status='hypothesis' (CRIT-02)
  - **supersede preserves the original row** (DATA-06 audit trail; success criterion #4 part 1)
  - **writeSource idempotent on raw_text** (D-04; success criterion #4 part 3)
  - **canonicalizeTag at write time** (DATA-10; success criterion #4 part 2; covers Pricing Strategy / SWOT.Weakness / Porter's 5 Forces)
  - promoteClaimStatus rejects nonexistent evidence edge (CRIT-06)

- `tests/integration/voyage-live.test.ts`: 1 case, **skipped** with `describe.skipIf(!RUN)` because `RUN_VOYAGE_TESTS` is unset (per the environment notes — VOYAGE_API_KEY is BLANK in .env). When RUN_VOYAGE_TESTS=1 + a real key, this is success criterion #2.

## env Test Harness — BLOCKER 2 Verification

`tests/unit/env.test.ts` includes 4 cases:
1. `throws if DATABASE_URL missing` — negative
2. `throws if VOYAGE_API_KEY missing` — negative
3. `error message points users to .env.example` — negative
4. **`with all env vars set, the loader returns env.DATABASE_URL`** — positive (BLOCKER 2 fix)

The positive case proves the harness itself works: `npx tsx` is reachable, the .ts file imports cleanly, env loader returns the expected `env.DATABASE_URL` value, and the subprocess exits 0. Without this, a "green" negative test could mean the harness was broken but failing for the wrong reason. All 4 cases pass.

`grep -q "npx" tests/unit/env.test.ts` — matches.
`grep -q "with all env vars set" tests/unit/env.test.ts` — matches.

## Pino Redact Paths (P19 Mitigation)

Configured in `src/lib/log.ts`:

```
'*.api_key', '*.apiKey', 'api_key', 'apiKey',
'*.headers.authorization', 'headers.authorization',
'*.password', 'password',
'*.VOYAGE_API_KEY', 'VOYAGE_API_KEY',
'*.POSTGRES_PASSWORD', 'POSTGRES_PASSWORD'
```

Censor token: `[REDACTED]`. Both flat-key and one-level-nested patterns covered for each sensitive path.

## Decisions Made

- **VOYAGE_API_KEY validation relaxed to plain `z.string()`.** Plan said `min(1)` but the project's actual `.env` has `VOYAGE_API_KEY=` (blank) per the environment notes, and the regular `npm test` is required to keep passing. Empty-string passes `z.string()` while `undefined` (the truly-missing case) still fails — preserving the spirit of "fail fast on missing keys" while accommodating the real .env state. Voyage is mocked in unit + integration; only voyage-live.test.ts (gated) ever calls the real API.
- **PGADMIN_DEFAULT_EMAIL relaxed from `z.email()` to plain `z.string()`.** The local-docker `.env` value `admin@local` doesn't pass RFC email validation but PgAdmin doesn't care.
- **`.js` extension required on `@/` aliased imports for `tsc --noEmit` to resolve.** TypeScript NodeNext + paths treats `@/lib/env` as a substitution candidate that goes through Node's resolution, which expects the explicit extension in ESM mode. Vitest/tsx accept either form; the strict typecheck is the constrained consumer.
- **env.test.ts harness rewritten for Windows compatibility.** The plan's verbatim code used `spawnSync('npx', ['tsx', '-e', script], { shell: true })` which mangles single quotes inside `script` under cmd.exe. Replaced with: write the script to a `.mts` temp file (forces ESM output for top-level await), `pathToFileURL` on the import target (Node ESM rejects raw `c:/` paths on Windows), and a stripped subprocess env + cwd in scratchDir (so `dotenv/config` doesn't reload the project `.env` and mask negative cases by re-setting DATABASE_URL/VOYAGE_API_KEY).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] env.test.ts subprocess harness incompatible with Windows shell**
- **Found during:** Task 1 GREEN run
- **Issue:** Plan's verbatim `spawnSync('npx', ['tsx', '-e', script], { shell: true })` failed on Windows: `cmd.exe` strips/mangles the single quotes in the inlined script, causing `tsx` to fail with `Unterminated string literal` / `Top-level await not supported with cjs output`. The negative tests then passed but for the wrong reason (harness broken, not validation working) — the exact failure mode BLOCKER 2 is meant to detect.
- **Fix:** Write script to a `.mts` temp file via `writeFileSync`, use `pathToFileURL` for the import target (Windows ESM requires `file://` URLs), and run subprocess with a stripped env + cwd outside the project so `dotenv/config` doesn't reload `.env` and mask negative cases.
- **Files modified:** `tests/unit/env.test.ts`
- **Commit:** `59b6495`
- **Acceptance preserved:** uses `npx tsx` (criterion: `grep -q "npx"`), positive case present (criterion: `grep -q "with all env vars set"`), still proves "harness works" via the BLOCKER 2 positive test.

**2. [Rule 1 — Bug] Env validation rules too strict for actual .env values**
- **Found during:** Task 3 GREEN run (integration test)
- **Issue:** `VOYAGE_API_KEY=` (blank) in the project `.env` failed `z.string().min(1)` and `PGADMIN_DEFAULT_EMAIL=admin@local` failed `z.email()`. The integration test imports `@/onebrain/db` → `@/lib/env`, which then threw at module-load time and aborted the test suite. The environment notes explicitly state `npm test` must keep passing with `VOYAGE_API_KEY` blank.
- **Fix:** Changed `VOYAGE_API_KEY: z.string().min(1, ...)` → `z.string({ message: ... })` (allows empty string but still fails on `undefined`, preserving the negative-case behavior). Changed `PGADMIN_DEFAULT_EMAIL: z.string().email().optional()` → `z.string().optional()`.
- **Files modified:** `src/lib/env.ts`
- **Commit:** `e4b35ad` (rolled into Task 3 GREEN)
- **Acceptance preserved:** `grep -q "z.string().url"` still matches (DATABASE_URL kept that form deliberately); env.test.ts negative cases still pass (delete makes the var undefined → fails `z.string()`); positive case still passes; `grep -q "redact"` and other criteria untouched.

**3. [Rule 3 — Blocking] tsc --noEmit fails on `@/lib/env` import without `.js` extension**
- **Found during:** Task 2 GREEN typecheck (per the plan's `<verify>` block)
- **Issue:** TypeScript NodeNext + path aliases requires the explicit `.js` extension on the substituted import for module resolution to find the file. Plan's verbatim code uses `import { env } from '@/lib/env'` which fails `tsc --noEmit -p tsconfig.node.json` with `TS2307: Cannot find module '@/lib/env'`.
- **Fix:** Added `.js` suffix to all internal `@/` imports across `src/onebrain/repo.ts`, `src/onebrain/embed.ts`, `src/onebrain/db.ts`. Also added `.js` to relative imports (`./schema`, `./db`, etc.) in repo.ts to match the same NodeNext rule.
- **Files affected:** `src/onebrain/repo.ts`, `src/onebrain/embed.ts`, `src/onebrain/db.ts`
- **Commits:** `4d3e985`, `e4b35ad`
- **Acceptance preserved:** typecheck `npx tsc --noEmit -p tsconfig.node.json` now passes cleanly.

### Stylistic clean-ups (not deviations from architecture)

- **embed.ts dimension guard:** changed `if (!vector || vector.length !== EMBEDDING_DIMENSION)` to `if (vector?.length !== EMBEDDING_DIMENSION)` per IDE diagnostic suggestion. Functionally identical (both throw when vector is missing or wrong length); the optional-chain form is more concise.
- **DATABASE_URL kept as `z.string().url(...)`** (with deprecation warning) rather than switching to Zod v4's `z.url(...)` — preserves consistency with `src/onebrain/types.ts` which uses the same pattern, and ensures the plan's `grep -q "z.string().url"` acceptance check still matches.

## Issues Encountered

1. **Windows-specific harness bugs (env.test.ts).** Three iterations to converge: shell-quoting → top-level-await CJS detection → ESM file:// URL requirement. Each pivot was a distinct Windows behavior the plan's Linux-shaped sample didn't account for. All resolved per Deviation #1 above.
2. **Env validation strictness collision with real .env state.** Single iteration to identify: `VOYAGE_API_KEY` blank vs missing semantics, plus `admin@local` vs RFC email. Resolved per Deviation #2.
3. **NodeNext + path aliases without `.js`.** Solved once across three files. Now established as a project convention going forward.

## Next Phase Readiness

- **Plan 04 (renderer):** consumes `findAllClaims`, `findAllSources`, `findAllEntities`, `findAllEdges` for read-side; `hashCanonical(frontmatter, body)` for content-hash determinism; `canonicalizeTag` for any tag normalization at compile time. All available from this plan's outputs.
- **Plan 05 (fixture):** consumes `writeSource`, `writeClaim`, `writeEdge`, `writeEntity` from `@/onebrain/repo`. The fixture file imports types from `@/onebrain/types` (Plan 02). The fixture's apostrophe-bearing `framework_tags: ["Porter's 5 Forces"]` will round-trip through `canonicalizeTag` to `porter-s-5-forces` — pinned by the WARNING 1 regression test.
- **Plan 06 (CLI):** `bsp ingest --fixture <name>` is a thin wrapper around `repo.writeSource` + `repo.writeClaim` + `repo.writeEdge` + `repo.writeEntity` from this plan. `bsp compile` reads via `findAllClaims` / `findAllSources` then renders via Plan 04's renderer. `bsp db reset --confirm` calls `pool.query('DROP SCHEMA ...')` then `npm run migrate`.
- **Plan 07 (E2E gate):** runs `RUN_VOYAGE_TESTS=1 npm run test:voyage` against the live API; the test file is in place and gated correctly. Closes success criterion #2.
- **Phase 2 (agents):** HTTP routes import from `repo.ts`, never from `db.ts` directly. The `vault_write_atomic` tool layer (COMP-10) lives outside the repo, materializing in Phase 2's agent topology.

## Self-Check: PASSED

**Files verified to exist:**
- src/lib/env.ts — FOUND
- src/lib/log.ts — FOUND
- src/lib/hash.ts — FOUND
- src/lib/tag-canonicalize.ts — FOUND
- src/onebrain/ids.ts — FOUND
- src/onebrain/embed.ts — FOUND
- src/onebrain/db.ts — FOUND
- src/onebrain/repo.ts — FOUND
- tests/unit/env.test.ts — FOUND
- tests/unit/content-hash.test.ts — FOUND
- tests/unit/tag-canonicalize.test.ts — FOUND
- tests/unit/ids.test.ts — FOUND
- tests/unit/repo.test.ts — FOUND
- tests/integration/append-only.test.ts — FOUND
- tests/integration/voyage-live.test.ts — FOUND

**Commits verified to exist (in main branch git log):**
- 42acacd (Task 1 RED) — FOUND
- 59b6495 (Task 1 GREEN) — FOUND
- ca083c4 (Task 2 RED) — FOUND
- 4d3e985 (Task 2 GREEN) — FOUND
- 9575482 (Task 3 RED) — FOUND
- e4b35ad (Task 3 GREEN) — FOUND

## TDD Gate Compliance

Plan 01-03 has `tdd="true"` on every task. Gate sequence verified in git log:

1. **Task 1 RED → GREEN:** `42acacd test(01-03): add failing tests for lib utilities` precedes `59b6495 feat(01-03): implement lib utilities` — COMPLIANT
2. **Task 2 RED → GREEN:** `ca083c4 test(01-03): add failing tests for ULID and gated Voyage live API` precedes `4d3e985 feat(01-03): implement ULID, Voyage embed seam, and Drizzle DB pool` — COMPLIANT
3. **Task 3 RED → GREEN:** `9575482 test(01-03): add failing tests for append-only repository` precedes `e4b35ad feat(01-03): implement append-only OneBrain repository (DATA-06)` — COMPLIANT
4. **REFACTOR gate (optional):** no separate refactor commits — implementation was minimal-by-design and the IDE-driven optional-chain cleanup (embed.ts dimension guard) was rolled into the GREEN commit for Task 2.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-04-26*
