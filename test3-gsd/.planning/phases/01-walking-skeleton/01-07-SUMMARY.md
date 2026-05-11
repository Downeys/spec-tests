---
phase: 01-walking-skeleton
plan: 07
subsystem: ui
tags: [react-19, vite, jsdom, testing-library, phase-gate, obsidian]

requires:
  - phase: 01-06
    provides: 4 integration tests binding pipeline/hash-stability/reingest/eval-meta to assertions
provides:
  - Minimum-viable React 19 skeleton (D-19): src/ui/{index.html, main.tsx, App.tsx} mounting <h1>Business Strategy Planner</h1> + Phase 2 placeholder
  - JSDOM render test (tests/integration/ui-scaffold.test.tsx) asserting INFRA-05
  - vitest config supporting React 19 automatic JSX transform (esbuild.jsx: 'automatic')
  - User-approved phase-gate smoke confirming the full Phase 1 pipeline end-to-end including manual Obsidian visual check of the contradiction callout
affects: [phase-02-agents-chat]

tech-stack:
  added:
    - "@testing-library/react (devDep — JSDOM render assertions for React 19)"
    - "@testing-library/dom (devDep — DOM querying primitives)"
    - "jsdom (devDep — DOM env for vitest UI tests)"
  patterns:
    - "React 19 automatic JSX transform: configured globally via esbuild.jsx: 'automatic' in vitest.config.ts (no per-file 'import React' needed)"
    - "Per-file vitest environment: '// @vitest-environment jsdom' opt-in keeps Node integration tests fast and only loads JSDOM where needed"
    - "Vite root: 'src/ui' + index.html at src/ui/index.html so the dev server serves the React skeleton without rearranging the project layout"

key-files:
  created:
    - src/ui/main.tsx
    - src/ui/App.tsx
    - src/ui/index.html
    - tests/integration/ui-scaffold.test.tsx
  modified:
    - vitest.config.ts (add @/ui alias; include glob accepts .tsx; esbuild.jsx: 'automatic')
    - package.json + package-lock.json (jsdom + testing-library devDeps)

key-decisions:
  - "Test file extension switched .ts → .tsx (Rule 3) — esbuild only transforms JSX in .tsx files. Required updating the integration include glob to *.test.{ts,tsx}."
  - "App.tsx uses 'import type { ReactElement }' instead of 'JSX.Element' (Rule 3) — React 19's TS types route the JSX namespace through ReactElement; tsc on tsconfig.web.json refused JSX.Element."
  - "esbuild.jsx: 'automatic' in vitest.config.ts (post-checkpoint orchestrator fix) — without this, JSX in tests transforms to React.createElement(), which throws ReferenceError: React is not defined in React 19's automatic transform world."
  - "@vitejs/plugin-react NOT added to vitest config — esbuild handles .tsx fine without it; adding it caused unrelated runtime issues during exploration."

patterns-established:
  - "Phase-gate smoke composition: docker → db reset → live ingest (real Voyage) → re-ingest (skip) → compile → re-compile (hash-skip) → npm test → dev-server curl → manual Obsidian visual check. This is the template for future phases' final verification."

requirements-completed:
  - INFRA-05

duration: ~30min (15 min agent Task 1 + ~15 min orchestrator unblock + user-run smoke)
completed: 2026-04-26
---

# Phase 01-07: React Skeleton + Phase-Gate Smoke Summary

**React 19 walking-skeleton (Vite-mounted `<h1>` + Phase 2 placeholder) plus the user-approved Phase 1 phase-gate smoke that exercised every architectural keystone end-to-end against the live Postgres/Voyage stack with manual Obsidian confirmation of the CRIT-05 contradiction callout.**

## Performance

- **Duration:** ~30 min total (Task 1 agent: 11 min; orchestrator unblock + user smoke: ~20 min)
- **Tasks:** 2/2 (Task 1 autonomous, Task 2 manual checkpoint — user-approved)
- **Commits:** 2 (1 feat + 1 fix) + this SUMMARY
- **Test impact:** 155 → 157 passing (+2 ui-scaffold), 1 skipped (Voyage live, gated)

## Accomplishments

- Vite-resolves-the-aliases proof: `src/ui/index.html` references `/src/ui/main.tsx`, which createRoot()-renders `<App />` with the `<h1>Business Strategy Planner</h1>` heading and the `<div data-testid="phase2-placeholder">` slot for Phase 2.
- JSDOM render test asserts the `<h1>` text and the placeholder div via `@testing-library/react`, gated by `// @vitest-environment jsdom`.
- vitest config now supports React 19's automatic JSX transform globally (esbuild.jsx: 'automatic'), unlocking future UI tests without per-file `import React`.
- **Phase-gate smoke approved by the user** — live ingest with real `VOYAGE_API_KEY`, deterministic hash-skip on re-compile, real Obsidian rendered the `> [!warning] Contradiction` callout with both Porter and kaizen wikilinks visible inside, all 5 visual-check items confirmed.

## Task Commits

1. **Task 1: React skeleton + JSDOM test** — `ac6930e` (feat) — agent committed; deferred deps install due to sandbox block
2. **Task 1.5 (orchestrator unblock): jsdom + testing-library + JSX runtime fix** — `19f1598` (fix) — orchestrator committed after agent returned
3. **Task 2: Phase-gate smoke** — user-run, no code changes; documented here in SUMMARY

## Files Created/Modified

- `src/ui/main.tsx` — React 19 root mount with StrictMode (D-19)
- `src/ui/App.tsx` — `<h1>Business Strategy Planner</h1>` + Phase 2 placeholder, typed as `ReactElement` (React 19 TS contract)
- `src/ui/index.html` — Vite HTML entry, `<script type="module" src="./main.tsx">`
- `tests/integration/ui-scaffold.test.tsx` — JSDOM render assertion of `<h1>` and placeholder
- `vitest.config.ts` — added @/ui alias, `*.test.{ts,tsx}` glob, `esbuild.jsx: 'automatic'`
- `package.json` + `package-lock.json` — jsdom, @testing-library/react, @testing-library/dom

## Decisions Made

- **Manual Obsidian visual check approved by user** — the user added a real `VOYAGE_API_KEY` to `.env`, ran the 8 automated smoke steps + opened `vault/topics/strategic-positioning.md` in Obsidian Reading View, and confirmed all 5 visual items: frontmatter parses, `> [!warning] Contradiction` renders as styled callout, both wikilinks visible inside callout, both claim texts visible, other 5 claims render as standard quote blocks.
- **Phase-gate evidence is dual-bound:** integration tests in 01-06 prove the contradiction callout shape via byte-comparison; the user's Obsidian visual check proves it renders correctly in the actual reader. Either alone would be insufficient; together they pass D-19 + COMP-09 + CRIT-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test file `.ts` → `.tsx` because the file contains JSX**
- **Found during:** Task 1 (vitest run)
- **Issue:** Plan body said `tests/integration/ui-scaffold.test.ts` but the file uses JSX literals; esbuild's default loader only transforms JSX in `.tsx` files
- **Fix:** Renamed to `.tsx`; updated integration project's `include` glob from `*.test.ts` to `*.test.{ts,tsx}`
- **Files modified:** vitest.config.ts, tests/integration/ui-scaffold.test.tsx
- **Committed in:** ac6930e

**2. [Rule 3 — Blocking] @/ui alias missing from vitest.config.ts**
- **Found during:** Task 1
- **Issue:** Test imports `@/ui/App`; alias was in vite.config.ts and tsconfig.json paths but missing from vitest config
- **Fix:** Added `'@/ui': path.resolve(__dirname, 'src/ui')` to the aliases object
- **Committed in:** ac6930e

**3. [Rule 3 — Blocking] React 19 TS types: `JSX.Element` → `ReactElement`**
- **Found during:** Task 1 (tsc --noEmit -p tsconfig.web.json)
- **Issue:** TS2503 — Cannot find namespace 'JSX'. React 19's types route through `import type { ReactElement } from 'react'` instead of the global JSX namespace
- **Fix:** App.tsx now imports ReactElement and uses it as the return type
- **Committed in:** ac6930e

**4. [Rule 3 — Blocking] esbuild.jsx: 'automatic' for React 19 in vitest**
- **Found during:** post-checkpoint orchestrator verification (npm test failed with `ReferenceError: React is not defined`)
- **Issue:** vitest's default esbuild config transforms JSX to `React.createElement(...)` (classic transform); React 19 expects the automatic transform via `react/jsx-runtime` (no `React` symbol needed)
- **Fix:** Added `esbuild: { jsx: 'automatic' }` at the root of vitest.config.ts
- **Committed in:** 19f1598

**5. [Rule 3 — Blocking] Missing devDeps: jsdom + @testing-library/react + @testing-library/dom**
- **Found during:** post-checkpoint orchestrator verification
- **Issue:** Test file uses `// @vitest-environment jsdom` and imports `@testing-library/react`, but the agent's sandbox blocked `npm install`; the test couldn't even start (`Cannot find package 'jsdom'`)
- **Fix:** Orchestrator ran `npm install -D jsdom @testing-library/react @testing-library/dom`
- **Committed in:** 19f1598

---

**Total deviations:** 5 auto-fixed (all Rule 3 — runtime/dependency compatibility, none architectural)
**Impact on plan:** None — all auto-fixes preserve plan intent and the verifiable acceptance criteria. The addition of jsdom/testing-library is consistent with the plan's intent that ui-scaffold.test.ts use JSDOM.

## Issues Encountered

**Agent's sandbox blocked `npm install`** (same pattern as Plan 01-01's commit denial — see 01-01 SUMMARY).
The Wave 6 executor identified the missing JSDOM/testing-library deps but couldn't install them; it returned at the checkpoint with a clear ask. The orchestrator's session installed the deps and the JSX runtime fix, then the user ran the live smoke. Net: no work lost, ~10 min recovery.

## User Setup Required

Voyage AI key in `.env` (`VOYAGE_API_KEY=...`) — required for live ingest. The user provided this during the smoke step.

## Next Phase Readiness

- Phase 1 walking skeleton is complete and user-validated end-to-end.
- Wiki vault contains the Porter strategic-positioning page with the rendered contradiction callout — Phase 2 (Agents + Chat) can begin replacing the placeholder div with assistant-ui Thread + Composer wired to the OneBrain repo.
- All 28 v1 requirements that map to Phase 1 are satisfied (INFRA-01..07, DATA-01..08, DATA-10, COMP-01..05, COMP-07, COMP-09, CRIT-02..06, EVAL-01).

---
*Phase: 01-walking-skeleton*
*Plan: 01-07*
*Completed: 2026-04-26*
