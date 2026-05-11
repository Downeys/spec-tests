---
phase: 01-walking-skeleton
plan: 04
subsystem: compilation
tags: [gray-matter, deterministic-rendering, obsidian-callout, sha256, atomic-write, drizzle]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: |
      Plan 02 (schema + migrations), Plan 03 (data-layer foundations: types, repo,
      hashCanonical, ULID, embed seam, db pool, compile_runs/compile_artifacts tables)
provides:
  - "Deterministic topic-page renderer (renderTopicPage) — same input -> byte-identical output, hash-stable across generated_at + compile_run_id changes (D-18)"
  - "Contradiction callout renderer (renderContradictionCallout) — CRIT-05 keystone; both sides always present with full provenance"
  - "Frontmatter builder (buildFrontmatter) — D-15 spec with 18 fields including CRIT-04 staleness + status_breakdown"
  - "Index.md rebuild (renderIndexMd) — D-16 Topics + Sources sections"
  - "Log.md append-only writer (appendLogEntry/resetLog) — D-17 Karpathy convention"
  - "Atomic vault writer (writeIfChanged + writeAtomic) — .tmp + fs.rename, hash-skip when content_hash matches"
  - "runCompile entry point — reads OneBrain (parallel), renders topic page, rebuilds index, appends log, records compile_runs + compile_artifacts audit rows"
affects: [01-05-cli, 01-06-fixture, 01-07-integration, phase-2-agents-and-chat, phase-3-full-compilation]

# Tech tracking
tech-stack:
  added: []  # all libs were installed in Plan 01-01; this plan only consumes gray-matter + drizzle-orm
  patterns:
    - "Deterministic rendering — pure function from (claims, edges, entities, sources) to (markdown, hash)"
    - "Volatile-field exclusion in canonical hash — generated_at, compile_run_id, content_hash, stale all stripped before sha256"
    - "Atomic file writes via .tmp + rename — avoids torn writes; hash-skip prevents redundant churn"
    - "Audit rows on every compile — compile_runs (start/finish counts) + compile_artifacts (per-page hash + written flag)"

key-files:
  created:
    - "src/compilation/render/frontmatter.ts — buildFrontmatter with D-15 spec"
    - "src/compilation/render/claim-block.ts — renderClaimBlock + renderClaimBlockWithSources"
    - "src/compilation/render/contradiction.ts — renderContradictionCallout (CRIT-05 keystone)"
    - "src/compilation/render/topic-page.ts — renderTopicPage (deterministic, ULID-sorted)"
    - "src/compilation/render/index-md.ts — renderIndexMd (D-16 rebuild from scratch)"
    - "src/compilation/render/log-md.ts — appendLogEntry + resetLog (D-17)"
    - "src/compilation/vault-writer.ts — writeIfChanged + writeAtomic"
    - "src/compilation/runner.ts — runCompile entry point"
    - "tests/unit/frontmatter.test.ts — 11 cases"
    - "tests/unit/claim-block.test.ts — 4 cases"
    - "tests/unit/render-contradiction.test.ts — 7 cases"
    - "tests/unit/render-topic-page.test.ts — 10 cases"
    - "tests/unit/render-index-md.test.ts — 7 cases"
    - "tests/unit/render-log-md.test.ts — 5 cases"
  modified:
    - "src/lib/hash.ts — added 'stale' to VOLATILE_FIELDS (Rule 1 deviation; see below)"

key-decisions:
  - "stale field is volatile in the canonical hash — derived from generated_at, so including it would break hash determinism whenever a compile crosses the 90-day staleness boundary. Stale remains in frontmatter for human display per CRIT-04, but is excluded from the hash that gates idempotent re-writes."
  - "writeAtomic (unconditional) used for index.md (rebuilt every compile per D-16); writeIfChanged (hash-gated) used for topic pages (idempotent re-renders per D-15)."
  - "runCompile inserts compile_runs row BEFORE work begins (with started_at default), then UPDATES it on finish — gives a crash-safe audit trail (RESEARCH.md Pattern 4)."

patterns-established:
  - "Pure render functions — Pages are pure functions of OneBrain rows; no side effects in src/compilation/render/"
  - "Volatile-field exclusion — generated_at, compile_run_id, content_hash, stale stripped from canonical hash"
  - "Audit-row-per-compile — compile_runs (run-level) + compile_artifacts (page-level) provide full provenance"
  - "Atomic write via .tmp + fs.rename — applied uniformly across all vault writers"
  - "Internal @/ imports use .js suffix in src/ (NodeNext + paths); tests omit suffix (Vitest resolves via vitest.config aliases)"

requirements-completed: [COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-09, CRIT-04, CRIT-05]

# Metrics
duration: ~14min
completed: 2026-04-26
---

# Phase 1 Plan 4: Deterministic Vault Renderer Summary

**Pure-function topic-page renderer with frontmatter (D-15), Obsidian `> [!warning] Contradiction` callouts (CRIT-05/COMP-09), atomic hash-skip writer, and runCompile entry point — 44 unit tests covering determinism, contradiction preservation, and append-only log convention.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-26T14:48:00Z
- **Completed:** 2026-04-26T15:01:30Z
- **Tasks:** 3
- **Files created:** 14 (8 source + 6 test)
- **Files modified:** 1 (src/lib/hash.ts — VOLATILE_FIELDS)

## Accomplishments

- **CRIT-05 keystone proven in code:** Contradiction callouts always render both sides with full provenance; never silently smoothed. Tested by `tests/unit/render-contradiction.test.ts::both claim ids appear in the output` and `render-topic-page.test.ts::contradiction callout rendered EXACTLY ONCE per pair`.
- **D-18 determinism proven in code:** `renderTopicPage` produces byte-identical output for identical inputs and identical hash across `generated_at` + `compile_run_id` variations. Tested by 4 hash-stability cases in `render-topic-page.test.ts`.
- **D-15 frontmatter spec verified:** All 18 required keys present (`id`, `kind`, `title`, `slug`, `generated_at`, `generated_by`, `compile_run_id`, `content_hash`, `claim_ids`, `entity_ids`, `topic_tags`, `framework_tags`, `confidence_avg`, `confidence_min`, `contradictions`, `last_evidence_at`, `stale`, `status_breakdown`).
- **WARNING 3 fix:** `confidence_avg` rounded to 2 decimals, tested with non-trivial inputs (0.45, 0.85, 0.65 → 0.65 via `toBeCloseTo(0.65, 2)`).
- **BLOCKER 3 fix:** `eq` from `drizzle-orm` imported at top of `runner.ts` alongside other imports; no misleading "late import" pattern at bottom.
- **Test count:** 44 new unit tests; 113 total tests pass (112 + 1 skipped Voyage live test).

## Task Commits

Each task was committed atomically:

1. **Task 1 RED — failing tests for frontmatter, claim-block, contradiction:** `8747626` (test)
2. **Task 1 GREEN — render primitives implementation:** `11b6f8c` (feat)
3. **Task 2 RED — failing tests for topic-page, index-md, log-md:** `837dc30` (test)
4. **Task 2 GREEN — topic-page, index-md, log-md + Rule 1 hash fix:** `b639977` (feat)
5. **Task 3 — vault-writer + runCompile entry point:** `204c970` (feat)

_TDD followed for Tasks 1 and 2 (RED → GREEN). Task 3 had no TDD requirement (per plan frontmatter)._

## Files Created/Modified

### Created — Source (`src/compilation/`)

- `render/frontmatter.ts` — `buildFrontmatter` with 18-key D-15 spec, CRIT-04 staleness, confidence_avg rounded to 2dp.
- `render/claim-block.ts` — `renderClaimBlock` (no sources) + `renderClaimBlockWithSources` (with cited source ids); Obsidian quote-block format.
- `render/contradiction.ts` — `renderContradictionCallout`; CRIT-05 keystone — emits both `Claim A` and `Claim B` blocks with confidence + status + cited sources.
- `render/topic-page.ts` — `renderTopicPage`; groups by primary topic_tag, sorts within group by ULID, renders contradiction callouts inline once-per-pair, computes canonical hash via `hashCanonical`, embeds hash back into frontmatter, returns `{ markdown, hash }`.
- `render/index-md.ts` — `renderIndexMd`; D-16 Topics section + Sources count section, sorted deterministically.
- `render/log-md.ts` — `appendLogEntry` (creates if missing) + `resetLog` (idempotent on missing file); UTC `[YYYY-MM-DD HH:MM] kind | summary` prefix per Karpathy convention.
- `vault-writer.ts` — `writeIfChanged` (parses existing frontmatter, skips if `content_hash` matches; otherwise atomic `.tmp` + `fs.rename`) + `writeAtomic` (unconditional atomic overwrite).
- `runner.ts` — `runCompile`; reads OneBrain in parallel, picks primary topic by max-count tag, renders topic page, rebuilds index.md, appends log entry, inserts compile_runs (start) + compile_artifacts (per page) + updates compile_runs (finish counts), calls `logEvent('compile', 'compilation-agent', ...)`. Friendly empty-claims case exits with `pagesPlanned: 0`.

### Created — Tests (`tests/unit/`)

- `frontmatter.test.ts` — 11 cases (D-15 keys, CRIT-04 stale flip, confidence_avg/min, status_breakdown, dedup+sort, WARNING 3 rounding).
- `claim-block.test.ts` — 4 cases (text + wikilink + confidence + status; deterministic; sources line included/omitted).
- `render-contradiction.test.ts` — 7 cases (exact callout marker, both ids, both texts, both confidences, source citations, `(no source)` placeholder, deterministic).
- `render-topic-page.test.ts` — 10 cases (determinism markdown + hash, hash invariance under generated_at + compile_run_id, hash changes with claim changes, ULID order, confidence display, frontmatter shape, contradiction callout once-per-pair, content_hash matches returned hash).
- `render-index-md.test.ts` — 7 cases (heading, sections, source count, page metadata, source URL/date/id, empty placeholder, determinism).
- `render-log-md.test.ts` — 5 cases (prefix format, append without truncate, all three kinds, resetLog removes file, resetLog no-op on missing).

### Modified

- `src/lib/hash.ts` — Added `'stale'` to `VOLATILE_FIELDS` set with explanatory comment. **See "Deviations" below.**

## Decisions Made

- **`stale` is volatile.** Derived from `generated_at`, not from underlying claim data. Including it in the canonical hash would break determinism every time a compile crosses the 90-day staleness boundary, contradicting D-18. Stale remains in frontmatter for CRIT-04 human display.
- **`writeAtomic` for index.md, `writeIfChanged` for topic pages.** Index is rebuilt every compile by design (D-16 — "rebuilt from scratch"); topic pages benefit from hash-skip idempotency (D-15).
- **runCompile inserts compile_runs row before any rendering.** Started_at defaults to NOW; finished_at is set on success. Crash-safe audit trail per RESEARCH.md Pattern 4.
- **getOrCreatePageId reads existing topic page frontmatter.** Preserves pageId across re-renders so the page's ULID identity is stable across renames (D-15 frontmatter requirement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `stale` field broke hash invariance under generated_at change**

- **Found during:** Task 2 (running `render-topic-page.test.ts::hash invariant under generatedAt change`)
- **Issue:** The plan specifies that `renderTopicPage` must produce identical hashes under different `generatedAt` values (D-18, COMP-07 success criterion). However, the plan's `buildFrontmatter` computes `stale = ageDays > 90`, where `ageDays = (generatedAt - last_evidence_at) / 1day`. With a claim `updated_at` of 2026-04-25, `generatedAt=2026-01-01` produces `stale=false` (negative ageDays), while `generatedAt=2027-12-31` produces `stale=true` (~600 days). Since `stale` was included in the hashed frontmatter, the hashes diverged across the staleness boundary — directly contradicting the test the plan asks for.
- **Fix:** Added `'stale'` to `VOLATILE_FIELDS` in `src/lib/hash.ts`, with an explanatory comment. `stale` is functionally derived from `generated_at` (a volatile field by D-18), so excluding it from the hash is consistent with D-18's rationale: "fields derived from when the compile ran, not from the underlying OneBrain rows, must not affect the canonical hash". Stale remains in frontmatter for CRIT-04 human display.
- **Files modified:** `src/lib/hash.ts`
- **Verification:** All 44 new unit tests pass, including 4 hash-stability cases in `render-topic-page.test.ts`. All 9 pre-existing `content-hash.test.ts` cases still pass (the 'stale' addition is purely additive to the volatile set).
- **Committed in:** `b639977` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in shared lib).
**Impact on plan:** The fix is the minimum-radius change to make the plan's own success criterion #4 (renderer determinism) achievable. No scope creep; no architectural change. Stale flag still surfaces in frontmatter for CRIT-04 human display, just not in the canonical hash.

### Deferred Items

**1. Pre-existing lint warning in `src/lib/hash.ts`**

- IDE flagged `Object.keys(frontmatter).sort()` on line 22 (`typescript:S2871` — "Provide a compare function that depends on String.localeCompare"). This warning is pre-existing from Plan 03 and is unrelated to this plan's task. JavaScript's default `Array.sort()` on string keys is functionally correct (lexicographic by UTF-16 code units), and changing it could destabilize hashes already produced. Logging here per the deferred-items convention; out of scope for Plan 04.

## Issues Encountered

- **Hash invariance test failed on first GREEN run.** Root-caused to the `stale`-in-hash bug (see Deviation 1). Fix took one focused edit; resolved cleanly.

## User Setup Required

None — no external services or environment variables added by this plan.

## Next Phase Readiness

**Plan 01-05 (CLI bsp binary)** — ready. `runCompile` is the integration point the CLI's `bsp compile` subcommand will call. Returns `{ runId, pagesPlanned, pagesWritten, pagesSkipped, topicPages }` exactly per the plan's published interface.

**Plan 01-06 (fixture)** — ready. `runCompile` reads OneBrain via the standard repo helpers; the fixture loader will write rows via `writeSource`/`writeClaim`/`writeEntity`/`writeEdge`, and `bsp compile` will pick up everything and produce `vault/topics/<primary-tag>.md`.

**Plan 01-07 (integration / round-trip)** — ready. The end-to-end pipeline is now wired: ingest → OneBrain → renderer → vault. Integration tests should drive `bsp ingest --fixture` then `bsp compile` and assert on the rendered topic page (including the `> [!warning] Contradiction` callout, the frontmatter spec, and the hash-skip idempotency).

**No blockers.** No threat surface NOT in the plan's `<threat_model>` was introduced.

## Sample Rendered Topic Page

A representative rendered topic page (with two contradicting claims about pricing) looks like this:

```markdown
---
id: 01J9XPAGE0000000000000000FF
kind: topic
title: Pricing
slug: topics/pricing
generated_at: '2026-04-25T12:00:00.000Z'
generated_by: compilation-agent
compile_run_id: 01J9XRUN00000000000000000F
content_hash: sha256:9c2f...e1
claim_ids:
  - 01J9XAAA00000000000000000A
  - 01J9XBBB00000000000000000B
entity_ids: []
topic_tags:
  - pricing
framework_tags: []
confidence_avg: 0.73
confidence_min: 0.65
contradictions: 1
last_evidence_at: '2026-04-25T00:00:00.000Z'
stale: false
status_breakdown:
  hypothesis: 2
---
## pricing

> Customers will accept $99/mo.
> — [[claim:01J9XAAA00000000000000000A]] confidence=0.8 status=hypothesis

> [!warning] Contradiction
> Two sources disagree on this point.
> - **Claim A** (confidence 0.8, hypothesis): "Customers will accept $99/mo."
>   *— [[claim:01J9XAAA00000000000000000A]], cites (no source)*
> - **Claim B** (confidence 0.65, hypothesis): "Customers will balk above $49/mo."
>   *— [[claim:01J9XBBB00000000000000000B]], cites (no source)*

> Customers will balk above $49/mo.
> — [[claim:01J9XBBB00000000000000000B]] confidence=0.65 status=hypothesis
```

(The `content_hash` value above is illustrative; the actual hash is the sha256 of canonicalized frontmatter-minus-volatile-fields plus the body.)

## Self-Check: PASSED

- All 8 source files and 6 test files exist on disk.
- All 5 task commits present in `git log` (8747626, 11b6f8c, 837dc30, b639977, 204c970).
- `npm test` passes 112 tests + 1 skipped (Voyage live).
- `npx tsc --noEmit -p tsconfig.node.json` exits 0.

---
*Phase: 01-walking-skeleton*
*Completed: 2026-04-26*
