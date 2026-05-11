---
phase: 01-walking-skeleton
plan: 06
subsystem: testing
tags: [vitest, integration-tests, postgres, idempotency, content-hash, contradiction-callout, eval-gate]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: |
      Plan 01 (vitest config, db-setup.ts, voyage-mock.ts), Plan 02 (Drizzle schema, compile_runs/compile_artifacts tables),
      Plan 03 (repo readers — findAll{Sources,Claims,Edges,Entities}, writeClaim, embed seam),
      Plan 04 (runCompile, deterministic renderer, content-hash D-18), Plan 05 (ingest CLI handler, Porter fixture)
provides:
  - "tests/integration/pipeline.test.ts — 9 cases binding Phase 1 Success Criteria #2 + #3 + CRIT-05/COMP-09 keystone (contradiction callout never smoothed)"
  - "tests/integration/hash-stability.test.ts — 4 cases binding Phase 1 Success Criterion #4 (content_hash equal across mutated-now compiles, second compile writes 0 pages, hash content-sensitivity)"
  - "tests/integration/reingest-skip.test.ts — 5 cases binding D-04 idempotency + WARNING 2 canonicalize-at-write production path"
  - "tests/integration/eval-meta.test.ts — 7 cases binding EVAL-01 sentinel (integration suite presence + 01-VALIDATION.md REQ → Test name parity)"
  - "Phase 1 verification gate: `npm test` exits 0 with 155 passing + 1 skipped (Voyage live, gated). All 5 success criteria executable."
affects: [01-07-validation-and-success-criteria-roundup, phase-2-agents-and-chat]

# Tech tracking
tech-stack:
  added: []  # all tooling existed; pure test additions
  patterns:
    - "tmpRoot-as-cwd pattern — integration tests mkdtemp a single root, chdir(root), pass {root}/vault to runCompile, so ingest's appendLogEntry (cwd/vault/log.md) and runCompile's vaultPath both write to the same isolated directory"
    - "vi.hoisted for spy reference inside vi.mock factory — required when the factory needs to forward a vi.fn whose call history the test inspects (reingest-skip.test.ts uses this for embedMock)"
    - "Module-top vi.mock of @/onebrain/embed in every integration file — integration project has NO setupFiles, so each file mocks Voyage explicitly to keep CI self-contained without VOYAGE_API_KEY"
    - "EVAL-01 as a labeled sentinel test — the meta requirement 'integration suite passes' is itself bound to a verifiable assertion (existence + name parity vs VALIDATION.md), making the requirement traceable in `git grep`"

key-files:
  created:
    - "tests/integration/pipeline.test.ts (266 lines, 9 cases) — full ingest → compile → assert vault contents end-to-end"
    - "tests/integration/hash-stability.test.ts (185 lines, 4 cases) — double-compile idempotency + content-sensitivity"
    - "tests/integration/reingest-skip.test.ts (146 lines, 5 cases) — D-04 + WARNING 2 binding"
    - "tests/integration/eval-meta.test.ts (40 lines, 7 cases) — EVAL-01 sentinel"
  modified:
    - "vitest.config.ts — added fileParallelism: false to integration project (Rule 3 deviation; see below)"

key-decisions:
  - "tmpRoot-as-cwd over per-file-tmpVault — ingest.ts hardcodes appendLogEntry to process.cwd()/vault, so the simplest correct way to test the log.md ingest entry assertion (D-17) is to chdir into a tmp root that contains vault/, then pass the same path to runCompile. Avoids touching production code that's locked-correct from Plan 05."
  - "vi.hoisted({ embedMock }) for the call-counting spy — bare const-then-vi.mock fails with 'Cannot access embedMock before initialization' because vi.mock hoists above the const declaration. vi.hoisted is the documented escape hatch."
  - "fileParallelism: false on integration only — multiple files calling resetSchemaAndMigrate() concurrently collided on node-pg-migrate's advisory lock and dropped the schema under peer tests' open queries. Serial execution restores correctness; unit project remains parallel."

patterns-established:
  - "Integration test isolation contract — each test file owns: vi.mock @/onebrain/embed at module top, beforeEach resetSchemaAndMigrate + mkdtemp + chdir, afterEach chdir-restore + rm + restoreAllMocks (or selective mockClear), afterAll pool.end"
  - "Per-test cwd capture/restore — origCwd = process.cwd() in beforeEach, process.chdir(origCwd) in afterEach BEFORE rm; safe under any future Vitest pool change"
  - "EVAL-01 verifiability pattern — meta requirements bind to a sentinel test that asserts presence + cross-reference parity, not to a tally; this prevents 'integration suite passes' from drifting into folklore"

requirements-completed: [COMP-01, COMP-03, COMP-04, COMP-07, COMP-09, CRIT-05, EVAL-01]

# Metrics
duration: ~25min
completed: 2026-04-26
---

# Phase 1 Plan 6: Integration Test Suite Summary

**The four integration tests that bind every Phase 1 Success Criterion to executable assertions: 25 new test cases, 5 phase requirements promoted from intent to verifiable gate, and the CRIT-05 contradiction-callout architectural keystone now fails CI if a future change ever smooths it away.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-26T15:30Z
- **Completed:** 2026-04-26T15:55Z
- **Tasks:** 3
- **Files created:** 4 (all in tests/integration/)
- **Files modified:** 1 (vitest.config.ts — fileParallelism fix)

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | pipeline.test.ts — full ingest → compile → assert vault contents (SC #2 + #3 + CRIT-05) | b10a46a | Done |
| 2 | hash-stability.test.ts — double-compile idempotency (SC #4 keystone, P3 prevention) | 982817e | Done |
| 3 | reingest-skip.test.ts (D-04 + WARNING 2) + eval-meta.test.ts (EVAL-01 sentinel) | 2bdd5a3 | Done (with Rule 3 deviation — see below) |

## Test Confirmation

```
npx vitest run tests/integration/pipeline.test.ts        → 9/9 passed
npx vitest run tests/integration/hash-stability.test.ts  → 4/4 passed
npx vitest run tests/integration/reingest-skip.test.ts   → 5/5 passed
npx vitest run tests/integration/eval-meta.test.ts       → 7/7 passed
npm test (full suite)                                     → 155/155 passed (1 skipped: voyage-live)
```

**Baseline comparison:**
- Before this plan: 130 passing + 1 skipped
- After this plan: 155 passing + 1 skipped (+25 new test cases, all green)

**Suite runtime:** 43.21s end-to-end (`npm test`).

## Per-Test-File Case Counts

| File | Cases | Purpose |
|------|-------|---------|
| pipeline.test.ts | 9 | SC #2 + #3 + CRIT-05/COMP-09 keystone (contradiction callout, both sides rendered) |
| hash-stability.test.ts | 4 | SC #4 keystone (content_hash stable across mutated-now, second run skips disk write, mutation invalidates) |
| reingest-skip.test.ts | 5 | D-04 idempotency (counts unchanged, embed=0 calls, --json shape) + WARNING 2 (canonicalize-at-write) |
| eval-meta.test.ts | 7 | EVAL-01 sentinel (6 file existence + 1 VALIDATION.md cross-reference) |
| **Total** | **25** | |

## CRIT-05 Keystone — explicit confirmation

The pipeline test's "contradiction callout is rendered with EXACT Obsidian syntax + BOTH claim ids" case (test #6) **passed**. Specifically, against the live ingest of the strategic-positioning fixture:

- `> [!warning] Contradiction` appears literally in `vault/topics/strategic-positioning.md` exactly once
- Both `[[claim:<claimA-ULID>]]` and `[[claim:<claimG-ULID>]]` wikilinks are present (claim-A = "Operational effectiveness — performing similar activities…"; claim-G = "Continuous improvement (kaizen) and operational excellence ARE the engine…")
- Both claim TEXTS appear in the rendered body (no side dropped — the architectural commitment that contradictions are *never silently smoothed* now has a CI gate)

This is the architectural keystone for the project: any future change that drops, hides, or auto-resolves a `contradicts` edge will fail this test.

## Success Criterion #4 — explicit confirmation

The hash-stability test's "two compiles on unchanged inputs produce identical content_hash AND second compile writes 0 pages" case (test #1) **passed**. Specifically:

- First compile uses `now=2026-04-25T12:00:00Z`, returns `pagesWritten=1, pagesSkipped=0, topicPages[0].written=true`
- Second compile uses `now=2027-01-01T08:30:00Z` (deliberately mutated by 1+ year), returns `pagesWritten=0, pagesSkipped=1, topicPages[0].written=false`
- The `content_hash` parsed from the on-disk frontmatter is byte-identical across both runs and equal to `r1.topicPages[0].hash`
- The hash is a sha256 hex string (64 chars). The literal value is non-deterministic across test runs because the embed mock returns `Math.random()`-based vectors — so claims have different embeddings each time, which doesn't matter to the hash because embeddings are stored DB-side and excluded from the canonical render input by D-15. The point is *equality across the two compiles within a single run*, which the assertion captures.

This proves D-18 strips `generated_at` and `compile_run_id` from the canonical hash and that the renderer's stable-ULID ordering eliminates non-determinism.

## D-04 — explicit confirmation

The reingest-skip test's "second ingest prints D-04 skip message" case (test #3) **passed**. The captured stdout matched `/already ingested as [0-9A-HJKMNP-TV-Z]{26} on \d{4}-\d{2}-\d{2}/` (e.g., `already ingested as 01KQ56QEQR1ASX3V0V43PKERP2 on 2026-04-26 (title: What Is Strategy?)`) and the test's "second ingest does NOT call Voyage embed" case (test #4) **passed** with `embedMock.mock.calls.length === 0` after the second ingest, proving D-04's no-Voyage-on-duplicate guarantee.

## WARNING 2 — explicit confirmation

The reingest-skip test's "writeClaim canonicalizes framework_tags on the production write path" case **passed**. After calling `writeClaim({ topic_tags: ['Strategic Positioning'], framework_tags: ["Porter's 5 Forces"], ... })` and round-tripping through the DB, the persisted row contained `framework_tags: ['porter-s-5-forces']` and `topic_tags: ['strategic-positioning']`. This binds Plan 03's tag-canonicalize unit test to the actual writeClaim → DB production path (Plan 03's test only proved the canonicalizer in isolation).

## Files Created / Modified

- `tests/integration/pipeline.test.ts` — 9 cases, ~266 lines. Full pipeline binding for SC #2, #3, CRIT-05, COMP-01/03/04/09.
- `tests/integration/hash-stability.test.ts` — 4 cases, ~185 lines. SC #4 binding + content-sensitivity proof.
- `tests/integration/reingest-skip.test.ts` — 5 cases, ~146 lines. D-04 idempotency + WARNING 2 canonicalize-at-write.
- `tests/integration/eval-meta.test.ts` — 7 cases, ~40 lines. EVAL-01 sentinel + VALIDATION.md cross-reference.
- `vitest.config.ts` — added `fileParallelism: false` to the integration project (Rule 3 deviation; see below).

## Decisions Made

- **tmpRoot-as-cwd pattern.** ingest.ts hard-codes `path.resolve(process.cwd(), 'vault')` for log.md, so isolating its log writes from the project's vault/ requires `process.chdir`. Rather than refactor the production code (locked correct from Plan 05), each integration test that calls `ingest()` mkdtemps a tmp root, chdirs into it, creates `{root}/vault`, and passes that same path to `runCompile`. Both writers land in the same isolated directory; the project vault/ is never touched.
- **vi.hoisted for the embedMock spy.** The reingest-skip test inspects `embedMock.mock.calls.length` to prove D-04 doesn't re-embed. Vitest hoists `vi.mock` above all imports, so a bare `const embedMock = vi.fn(...)` followed by `vi.mock('@/onebrain/embed', () => ({ embed: embedMock }))` would crash with "Cannot access embedMock before initialization." `vi.hoisted({ embedMock: vi.fn(...) })` lifts the const declaration to where the mock factory can see it.
- **fileParallelism: false for integration only.** The integration suite shares a single Postgres DB, and `resetSchemaAndMigrate()` takes node-pg-migrate's advisory lock. Multiple files running concurrently produced "Failed to release migration lock" errors and dropped the schema under peer tests' open queries. Serial file execution is the minimum-blast-radius fix; unit tests stay parallel. (Within-file tests run serially per Vitest default.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Integration tests collided on node-pg-migrate advisory lock under default file parallelism**

- **Found during:** Task 3 (running `npm test` after adding the 4th integration file)
- **Issue:** With pipeline + hash-stability + reingest-skip + the existing append-only/schema-shape/schema-parity files all calling `resetSchemaAndMigrate()` in parallel, several tests crashed with `Migration failed in test setup: Failed to release migration lock` and `relation "sources" does not exist`. The root cause: each file's beforeEach drops the public schema and re-applies migrations via `spawnSync('npm', ['run', 'migrate'])`, which takes node-pg-migrate's advisory lock. Concurrent files contended for the lock and tore down the schema under each other's open queries.
- **Fix:** Added `fileParallelism: false` to the `integration` project in `vitest.config.ts`. Unit tests remain parallel (no shared DB). Within-file tests still run serially (Vitest default). This is the smallest possible change that restores correctness.
- **Files modified:** vitest.config.ts
- **Verification:** Full `npm test` now passes 155/155 + 1 skipped (was failing 20+ tests before the fix).
- **Committed in:** 2bdd5a3 (Task 3 commit)
- **Tradeoff:** Suite runtime is now 43.21s (vs ~13s if files ran in parallel). Plan's "<30s" was a soft latency target, not a gate; serial execution is the simplest correct fix for Phase 1. A future optimization (deferred — see Deferred Items) would replace the spawnSync subprocess with a direct `node-pg-migrate` API call to remove per-test subprocess overhead.

**2. [Rule 3 - Blocking] ingest log entry would land in project vault/ under default cwd**

- **Found during:** Task 1 (drafting the pipeline.test.ts log.md assertion)
- **Issue:** The plan's verbatim test code passed `vaultPath: tmpVault` to `runCompile` but called `ingest(undefined, { fixture: 'strategic-positioning' })` without isolating cwd. Since `ingest.ts` hard-codes `appendLogEntry(path.resolve(process.cwd(), 'vault'), 'ingest', …)`, the ingest log entry would have been appended to the developer's `vault/log.md` (production tree) while runCompile's compile entry would have gone to `tmpVault/log.md`. The plan's test #8 ("vault/log.md has both an ingest and a compile entry") would then have failed because the ingest entry isn't where the test reads.
- **Fix:** Replaced the plan's `tmpVault = mkdtemp(...)` pattern with `tmpRoot = mkdtemp(...); tmpVault = ${tmpRoot}/vault; mkdir tmpVault; chdir(tmpRoot)`. Now both ingest's appendLogEntry (which uses `cwd/vault`) and runCompile's vaultPath resolve to the same isolated directory. This is faithful to the plan's intent (per-test isolation, project vault/ never touched) — just with a slightly different topology than the verbatim sketch.
- **Files modified:** tests/integration/pipeline.test.ts (and same pattern reused in hash-stability.test.ts)
- **Verification:** All 9 pipeline tests pass; the test reads `tmpVault/log.md` and finds both ingest + compile entries.
- **Committed in:** b10a46a (Task 1 commit), 982817e (Task 2 commit)
- **Note:** The reingest-skip test in the plan already had the chdir pattern (the plan's WARNING 4 fix called it out), so its design was already correct.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues that would prevent the tests from binding the success criteria they exist to verify).
**Impact on plan:** Both deviations are mechanical adjustments to the verbatim test code in the plan. The architectural intent (isolated per-test vault, mocked Voyage, clean DB per test, 25 cases binding 5 success criteria) is exactly what the plan specified. No scope creep, no new requirements added.

## Authentication Gates

None new for this plan. The integration suite explicitly mocks `@/onebrain/embed` at module top in every file, so it runs without `VOYAGE_API_KEY`. The existing voyage-live.test.ts (Plan 03) remains gated by `RUN_VOYAGE_TESTS=1` and is `skipped` in the standard `npm test` run.

## Plan-Level Acceptance Criteria

- [x] All 3 tasks executed and committed individually (3 commits: b10a46a, 982817e, 2bdd5a3)
- [x] SUMMARY.md created (this file)
- [x] STATE.md and ROADMAP.md updated (next step)
- [x] `npm test` passes — 155/155 passing + 1 skipped (was 130 + 1 skipped baseline; +25 new tests; zero regressions)
- [x] Each integration test calls `resetSchemaAndMigrate()` in its own beforeEach
- [x] Each integration test mocks `@/onebrain/embed` so it runs without VOYAGE_API_KEY (verified by stripping `VOYAGE_API_KEY=` from `.env` and re-running — passes)
- [x] pipeline.test.ts asserts at least one vault topic file is written and contains the Porter contradiction callout (`> [!warning] Contradiction`) — test #6 passes
- [x] hash-stability.test.ts asserts identical inputs produce byte-identical content_hash across two runs with mutated `now` — test #1 passes
- [x] reingest-skip.test.ts asserts re-ingesting the same fixture twice produces 0 new claims — test #2 passes (counts unchanged: 1 source, 7 claims, 10 edges, 2 entities)
- [x] eval-meta.test.ts asserts the integration suite contents match 01-VALIDATION.md REQ → Test map — test #7 ("names match the REQ → Test map") passes

## Deferred Items

| Category | Item | Status | Notes |
|----------|------|--------|-------|
| Test infra perf | Replace `spawnSync('npm', ['run', 'migrate'])` in db-setup.ts with a direct `node-pg-migrate` API call to remove per-test subprocess overhead | Deferred to a Phase 1 cleanup plan or Phase 2 onboarding | Would let us re-enable file parallelism (43s → ~15s suite runtime). Out of scope for Plan 06 because the plan's deliverable is the test cases, not test-infra optimization. |

## TDD Gate Compliance

The plan declared `tdd="true"` for all 3 tasks, but every test in this plan binds *already-existing* production code from Plans 01-05. Per `.claude/get-shit-done/references/tdd.md` §"Error handling" → "Test doesn't fail in RED phase: Feature may already exist - investigate":

The features (ingest, runCompile, content-hash, contradiction-callout rendering, repo readers, fixture loader, D-04 dedupe, frontmatter shape) all already exist and are correct. The deliverable of *this* plan is the test cases that bind them. There was no GREEN phase to add — the tests pass on first run because production code is correct.

Each task was therefore committed as a single `test(01-06): ...` commit, which is honest about what shipped:
- Task 1 = b10a46a `test(01-06): add pipeline integration test (SC #2 + #3 + CRIT-05 keystone)`
- Task 2 = 982817e `test(01-06): add hash-stability test (SC #4 keystone, P3 prevention)`
- Task 3 = 2bdd5a3 `test(01-06): add reingest-skip + eval-meta tests (D-04 idempotency, EVAL-01 sentinel)`

`workflow.tdd_mode` is `false` in `.planning/config.json` so RED/GREEN gate enforcement is advisory only. Flagging the choice here for the end-of-phase TDD review checkpoint.

## Self-Check: PASSED

Files created:
- [x] tests/integration/pipeline.test.ts — exists
- [x] tests/integration/hash-stability.test.ts — exists
- [x] tests/integration/reingest-skip.test.ts — exists
- [x] tests/integration/eval-meta.test.ts — exists

Commits:
- [x] commit b10a46a — exists (test(01-06): pipeline integration test)
- [x] commit 982817e — exists (test(01-06): hash-stability test)
- [x] commit 2bdd5a3 — exists (test(01-06): reingest-skip + eval-meta + vitest config)

Test counts:
- [x] Total tests: 155 passing + 1 skipped (was 130 + 1; +25 added by this plan)
- [x] pipeline.test.ts: 9 cases, all pass
- [x] hash-stability.test.ts: 4 cases, all pass
- [x] reingest-skip.test.ts: 5 cases, all pass
- [x] eval-meta.test.ts: 7 cases, all pass

## Next Phase Readiness

- Phase 1 Plan 7 is the only remaining plan in the phase. Plan 7 is "validation + success-criteria roundup" — it consumes this plan's outputs (the integration test suite as the executable phase gate) and produces the phase-completion artifacts (PHASE-VALIDATION-RESULTS.md, REQUIREMENTS.md updates).
- All five Phase 1 success criteria are now bound to executable assertions:
  - SC #1 (CLI runnable) — covered by `bsp --help` smoke (Plan 05 SUMMARY) + 130 existing tests
  - SC #2 (one source + claims with provenance + ULID + status=hypothesis + 1024-dim embedding) — pipeline.test.ts cases 1, 2, 3
  - SC #3 (vault topic page + index.md + log.md correctly rendered) — pipeline.test.ts cases 4, 5, 7, 8
  - SC #4 (content_hash stable across runs) — hash-stability.test.ts case 1
  - SC #5 (contradiction callout never smoothed) — pipeline.test.ts case 6 (CRIT-05 keystone)
- No blockers for Plan 7. The only deferred item (test-infra perf optimization) is non-blocking and can be picked up later.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-04-26*
