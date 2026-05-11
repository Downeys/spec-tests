---
phase: 02-agents-and-chat
plan: 01
subsystem: infra
tags: [hono, sse, claude-agent-sdk, vitest, jsdom, opentelemetry, phoenix, tavily]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: "src/lib/env.ts (Zod loader), src/lib/log.ts (pino + redact), src/cli/index.ts (commander dynamic-import), src/onebrain/db.ts (drizzle), vitest projects (unit, integration), tsconfig paths (@/server, @/agents pre-declared)"
provides:
  - "Hono server skeleton bound to 127.0.0.1 (T-02-05 mitigation)"
  - "GET /health route returning {status, version, db_ok}"
  - "bsp serve CLI subcommand (lazy dynamic-import, --port long-form only)"
  - "Opt-in OpenTelemetry → Phoenix tracing module (PHOENIX_ENABLED=1 gate)"
  - "Vite dev proxy for /chat /recompile /health → 127.0.0.1:3000"
  - "Vitest 4-project layout (unit, integration, ui, agents) + jsdom-setup"
  - "Phase 2 dependencies installed and ESM-verified (claude-agent-sdk pinned EXACT 0.2.119)"
  - "Env loader requires ANTHROPIC_API_KEY + TAVILY_API_KEY (.min(1)) at boot"
  - "INFRA-04 health-half VALIDATION probe (tests/server/health.spec.ts) — green"
affects:
  - 02-02 (DATA-09 search reader uses the new vitest unit project route for tests/onebrain/)
  - 02-03 (tool-permission boundary uses tests/agents/ project; @/agents alias)
  - 02-04 (sub-agent definitions; coordinator-config.spec lands in tests/agents/)
  - 02-05 (coordinator + repo Layer 1 quant-guard; uses startServer env gate)
  - 02-06 (SSE bridge mounts on createApp() at /chat; uses Hono streamSSE on 4.12.x)
  - 02-07 (UI surface; Vite proxy + tests/ui/ jsdom env both ready)
  - 02-08 (recompile route mounts on createApp() at /recompile)

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/claude-agent-sdk@0.2.119 (EXACT pin, no caret/tilde)"
    - "@anthropic-ai/sdk@^0.90.0"
    - "hono@^4.12.15 (upgraded from plan-spec ~4.0.0 — see deviations)"
    - "@hono/node-server@^2.0.0"
    - "@assistant-ui/react@^0.12.26"
    - "@assistant-ui/react-ai-sdk@^1.3.20"
    - "ai@^6.0.168 (Vercel AI SDK 6)"
    - "@ai-sdk/anthropic@^3.0.71"
    - "@tavily/core@^0.7.2"
    - "@testing-library/jest-dom@^6.9.1"
    - "@arizeai/openinference-instrumentation-anthropic@^0.1.10"
    - "@opentelemetry/sdk-node@^0.215.0"
    - "@opentelemetry/exporter-trace-otlp-http@^0.215.0"
  patterns:
    - "Hono server factory pattern: createApp() returns Hono instance; startServer() is the listen helper. Routes mount via app.route('/', subRoute)."
    - "127.0.0.1-bind discipline: hostname literal AND T-02-05 comment trail required by Section 5 grep checks (defence against future widening)."
    - "Opt-in tracing: PHOENIX_ENABLED=1 gate + lazy import('@opentelemetry/sdk-node') so OTel deps cost nothing when disabled."
    - "Test routing rule: tests/server/*.spec.ts run in unit project (DB-mocked); tests/agents/*.spec.ts run in agents project (real DB, fileParallelism: false); tests/ui/*.spec.{ts,tsx} run in ui project (jsdom)."

key-files:
  created:
    - "src/server/index.ts (createApp + startServer, T-02-05 hostname literal)"
    - "src/server/routes/health.ts (GET /health)"
    - "src/cli/commands/serve.ts (thin handler — delegates to startServer)"
    - "src/lib/tracing.ts (opt-in Phoenix wiring)"
    - "tests/server/health.spec.ts (Wave 0 INFRA-04 probe — 2 cases)"
    - "tests/setup/jsdom-setup.ts (loads @testing-library/jest-dom/vitest)"
    - "tests/ui/.gitkeep + tests/agents/.gitkeep (placeholder dirs for downstream Phase 2 plans)"
  modified:
    - "package.json + package-lock.json (Phase 2 deps; agent-sdk EXACT-pinned)"
    - ".env.example (ANTHROPIC_API_KEY, TAVILY_API_KEY, PHOENIX_ENABLED, RUN_AGENT_TESTS, RUN_TAVILY_TESTS, VAULT_PATH)"
    - "src/lib/env.ts (Zod schema +6 keys; ANTHROPIC/TAVILY required min(1))"
    - "src/cli/index.ts (registered `serve` subcommand mirroring compile pattern)"
    - "vite.config.ts (server.proxy for /health, /chat, /recompile → 127.0.0.1:3000)"
    - "vitest.config.ts (added ui + agents projects; extended unit include to tests/server/**; added @/server + @/agents aliases)"
    - "tests/unit/env.test.ts (positive case includes new keys; +2 negative cases)"

key-decisions:
  - "Pinned @anthropic-ai/claude-agent-sdk to 0.2.119 EXACT (plan said 0.2.4; 0.2.4 was superseded — picked latest 0.2.x per plan's own fallback clause)."
  - "Upgraded hono from plan-spec ~4.0.0 to ^4.12.15 (resolved) — Rule 3 deviation: @hono/node-server@2 imports 'hono/ws' subpath which 4.0.x didn't export. Peer-deps allow ^4."
  - "Added @/server and @/agents aliases to vitest.config.ts (Rule 3 — without them, tests/server/health.spec.ts can't resolve `@/server/index.js`). Mirrors Phase 1 plan 01-07's @/ui addition."
  - "@tavily/core ESM-clean — no createRequire fallback needed; 02-03 tools/tavily.ts can use static `import { tavily } from '@tavily/core'`."
  - "All four SDKs (agent-sdk, anthropic-sdk, tavily, hono) verified ESM-clean with NodeNext at install — no Phase-1-style voyageai breakage."

patterns-established:
  - "T-02-05 mitigation literal: src/server/index.ts must contain `'127.0.0.1'` hostname AND `T-02-05` comment string (greppable, prevents future bind widening)."
  - "CLI lazy-load: every program.command().action() uses `await import('./commands/X.js')` to keep `bsp --help` fast and free of network-client side effects (Phase 1 D-03 carry-forward)."
  - "Boot-time env touch: startServer() does `void env.ANTHROPIC_API_KEY` to make Zod validation explicit and refactor-safe."
  - "Opt-in observability: anything optional (Phoenix, real-API tests) gated behind a single env flag; default OFF; never breaks unit tests."

requirements-completed:
  - INFRA-04

# Metrics
duration: 18min
completed: 2026-04-27
---

# Phase 02 Plan 01: Wave 1 Infra Summary

**Hono server skeleton bound to 127.0.0.1 (T-02-05) with GET /health, `bsp serve` CLI subcommand, opt-in Phoenix tracing, Vite dev proxy, and Vitest 4-project layout (unit + integration + ui + agents) — all Phase 2 dependencies installed with ESM-cleanness verified and the agent SDK exact-pinned.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-27T02:00:29Z
- **Completed:** 2026-04-27T02:18:43Z
- **Tasks:** 3
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments

- **INFRA-04 (health half) green:** `tests/server/health.spec.ts` passes both cases (db_ok=true on success, db_ok=false on db.execute throw). The `/chat` SSE half ships in 02-06.
- **T-02-05 mitigation encoded in source:** `'127.0.0.1'` hostname literal + `T-02-05` comment trail both grep-able in `src/server/index.ts` — future plans can't accidentally widen the bind without explicit security review.
- **Manual sanity check passed:** `npm run bsp -- serve --port 3001` boots, logs `bsp serve listening (local-only — T-02-05)`, and `curl http://127.0.0.1:3001/health` returns `{"status":"ok","version":"0.1.0","db_ok":true}` against a live Postgres.
- **All four vitest projects enumerate** under `npm test -- --run`: 24 test files (16 unit including the new health.spec, 7 integration, 0 ui, 0 agents — last two configured but empty until 02-04/02-07).
- **161 tests passing, 1 skipped** (RUN_VOYAGE_TESTS gated). No Phase 1 regressions.

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Install Phase 2 dependencies + verify ESM-cleanness + extend env loader** — `a9ec9ee` (chore)
2. **Task 2: Hono server skeleton + GET /health + bsp serve subcommand + Vite proxy + Phoenix tracing module** — `b39f22a` (feat)
3. **Task 3: Vitest projects expansion (ui jsdom + agents node) + jsdom setup** — `5d895f1` (test)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP_

## Resolved Library Versions (downstream-plan reference)

Recorded so 02-02..02-09 know the exact API surface they're building against:

| Package | Spec'd | Resolved (lockfile) |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | EXACT (plan: 0.2.4) | **0.2.119 EXACT** (plan-listed 0.2.4 was superseded; picked latest 0.2.x per plan fallback clause) |
| `@anthropic-ai/sdk` | ~0.90.0 | 0.90.0 |
| `hono` | ~4.0.0 (plan) | **4.12.15** (Rule 3 deviation — see below) |
| `@hono/node-server` | (any) | 2.0.0 |
| `@assistant-ui/react` | ~0.12.0 | 0.12.26 |
| `@assistant-ui/react-ai-sdk` | (any) | 1.3.20 |
| `ai` (Vercel AI SDK 6) | (any) | 6.0.168 |
| `@ai-sdk/anthropic` | (any) | 3.0.71 |
| `@tavily/core` | (any) | 0.7.2 — **ESM-clean, no createRequire fallback needed** |
| `@testing-library/jest-dom` | (dev) | 6.9.1 |
| `@arizeai/openinference-instrumentation-anthropic` | (dev) | 0.1.10 |
| `@opentelemetry/sdk-node` | (dev) | 0.215.0 |

## ESM-Cleanness Verification (RESEARCH §Landmines #12 + #13)

All four SDKs imported successfully under NodeNext at install time:

- `@anthropic-ai/claude-agent-sdk` — `query`, `tool`, `createSdkMcpServer` all present (the three exports the coordinator + tool wrappers will use). Other named exports include `AbortError`, `DirectConnectError`, `EXIT_REASONS`, `HOOK_EVENTS`, `InMemorySessionStore`, `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`, `deleteSession`, `foldSessionSummary`.
- `@anthropic-ai/sdk` — `AI_PROMPT`, `APIConnectionError`, etc. all importable.
- `@tavily/core` — exports `tavily` factory function (matches `tavily({ apiKey })` pattern in PATTERNS §RES-01). **No Phase-1-style ESM breakage** — 02-03's `tools/tavily.ts` can use static import.
- `hono` — exports `Hono` class. Routes wire correctly with `@hono/node-server`'s `serve()`.

## T-02-05 Bind-to-127.0.0.1 Decision (audit trail)

Per CLAUDE.md "Out of Scope: Authentication / multi-user — personal project, single user" and PROJECT.md's local-only constraint, the Hono server hostname is hard-coded to `'127.0.0.1'` (loopback) in `src/server/index.ts:51`. Documented as ASVS L1 deviation. Section 5 grep checks confirm:
- `grep "hostname:\s*['\"]127\.0\.0\.1['\"]" src/server/index.ts` → match at lines 51, 53.
- `grep "T-02-05" src/server/index.ts` → match at lines 7, 49, 54.

Future plans cannot widen the bind without explicit security review. Phoenix tracing exporter URL is `http://localhost:4317/v1/traces` (also loopback only — T-02-INFRA-02 disposition: accept).

## Decisions Made

- **0.2.119 instead of 0.2.4** — plan said EXACT 0.2.4, but 0.2.4 doesn't exist on npm anymore (latest 0.2.x at install time was 0.2.119). The plan explicitly anticipates this: "If the EXACT pin `0.2.4` of `@anthropic-ai/claude-agent-sdk` is not on npm at install time, choose the latest `0.2.x` and pin it exactly". Did so.
- **Tavily ESM verified clean** — no fallback path needed. 02-03's `tools/tavily.ts` can `import { tavily } from '@tavily/core'` directly.
- **Test routing rule** for downstream Phase 2 plans (documented in vitest.config.ts comment): tests/server/*.spec.ts → unit project (DB-mocked, fast); tests/agents/*.spec.ts → agents project (real DB, fileParallelism: false); tests/ui/*.spec.{ts,tsx} → ui project (jsdom). Don't put real-DB tests under tests/server/ — move them to tests/agents/ instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pinned @anthropic-ai/claude-agent-sdk to EXACT version after npm install added a `^`**
- **Found during:** Task 1 (Install Phase 2 dependencies)
- **Issue:** `npm install @anthropic-ai/claude-agent-sdk@0.2.119` writes `"^0.2.119"` to package.json by default — but the plan's acceptance criterion REQUIRES the version string to have NO leading `^` or `~` (RESEARCH landmine #6).
- **Fix:** Edited package.json to `"0.2.119"` (no caret), then re-ran `npm install` to regenerate lockfile cleanly.
- **Files modified:** package.json
- **Verification:** `node -e "const v = require('./package.json').dependencies['@anthropic-ai/claude-agent-sdk']; if (v.startsWith('^') || v.startsWith('~')) process.exit(1)"` exits 0.
- **Committed in:** `a9ec9ee` (Task 1 commit).

**2. [Rule 1 - Bug] Updated tests/unit/env.test.ts positive case + added 2 negative cases**
- **Found during:** Task 1 (after extending env schema)
- **Issue:** Adding `ANTHROPIC_API_KEY: z.string().min(1)` and `TAVILY_API_KEY: z.string().min(1)` broke the existing positive harness test (tests/unit/env.test.ts:110), which only set DATABASE_URL/POSTGRES_PASSWORD/VOYAGE_API_KEY. Existing test failed: `ANTHROPIC_API_KEY: expected string, received undefined`.
- **Fix:** (a) Added the two new keys to the positive case's runEnvLoader call; (b) added two new negative cases to confirm the new validations fire (`throws if ANTHROPIC_API_KEY missing`, `throws if TAVILY_API_KEY missing`).
- **Files modified:** tests/unit/env.test.ts
- **Verification:** `npm test -- --run tests/unit/env.test.ts` → 6 passed (4 original + 2 new).
- **Committed in:** `a9ec9ee` (Task 1 commit).

**3. [Rule 2 - Missing Critical] Added placeholder ANTHROPIC_API_KEY + TAVILY_API_KEY to .env**
- **Found during:** Task 1 (env loader extension)
- **Issue:** env.ts loads at process boot via `safeParse(process.env)`. After the schema added two required keys, any test or script that imports env.ts (transitively, via @/onebrain/db.ts which uses env.DATABASE_URL) would crash on missing keys. The plan explicitly says to NOT add a separate "test mode" branch — but the existing `.env` file (gitignored) didn't yet have the new keys.
- **Fix:** Appended `ANTHROPIC_API_KEY=placeholder-not-a-real-key` and `TAVILY_API_KEY=placeholder-not-a-real-key` to `.env` (the local gitignored file, not `.env.example`). Real keys go here for `bsp serve`; tests that exercise env-injection logic still use vi.stubEnv per the plan's discipline.
- **Files modified:** .env (gitignored — not committed)
- **Verification:** `npm test -- --run --project unit` → 113/113 pass; no env-validation crashes in any imported module.
- **Committed in:** N/A (.env is gitignored).

**4. [Rule 3 - Blocking] Upgraded `hono` from `~4.0.0` to `^4.6.0` (resolved 4.12.15)**
- **Found during:** Task 3 (running tests/server/health.spec.ts in the new unit project)
- **Issue:** `~4.0.0` resolves to the very first `4.x` release (`hono@4.0.0-rc.4`-era), but `@hono/node-server@2.0.0` imports the `hono/ws` subpath, which wasn't exported until later 4.x. Test failed with `Package subpath './ws' is not defined by "exports" in node_modules/hono/package.json`.
- **Fix:** `npm install hono@^4.6.0` (npm picked 4.12.15). `@hono/node-server` peer-dep is `hono: ^4` so any 4.x is in-range. Plan said "~4.x" which I read as "the latest 4.x"; the strict tilde semver was the wrong literal.
- **Files modified:** package.json (`"hono": "^4.12.15"`), package-lock.json
- **Verification:** `npm test -- --run tests/server/health.spec.ts` → both cases green; `npm test -- --run` → 161 passed (1 skipped).
- **Committed in:** `5d895f1` (Task 3 commit).

**5. [Rule 3 - Blocking] Added @/server + @/agents aliases to vitest.config.ts**
- **Found during:** Task 3 (running tests/server/health.spec.ts in the new unit project)
- **Issue:** The Vitest alias map (`vitest.config.ts:4-13`) had `@/onebrain`, `@/lib`, `@/cli`, `@/compilation`, `@/ui` — but NOT `@/server` or `@/agents`. The new probe `tests/server/health.spec.ts` imports `@/server/index.js` and failed: `Cannot find package '@/server/index.js'`. Mirrors the Phase 1 plan 01-07 bug where `@/ui` was missing.
- **Fix:** Added `'@/server': path.resolve(__dirname, 'src/server')` and `'@/agents': path.resolve(__dirname, 'src/agents')` to the aliases map. tsconfig.json paths and vite.config.ts already had both — vitest.config.ts was the gap.
- **Files modified:** vitest.config.ts
- **Verification:** `npm test -- --run tests/server/health.spec.ts` → resolution succeeds; both cases green.
- **Committed in:** `5d895f1` (Task 3 commit).

---

**Total deviations:** 5 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical, 2 Rule 3 blocking)
**Impact on plan:** All deviations were strictly necessary for correctness/execution and stayed within the plan's scope (no new features). No Rule 4 architectural decisions required. The plan's pre-anticipated fallbacks (Tavily ESM, agent-sdk version drift) all worked as designed.

## Issues Encountered

None beyond the deviations above. The plan was unusually well-spec'd — every gotcha I hit was already documented in RESEARCH §Landmines or anticipated in the plan's action prose.

## User Setup Required

None for this plan. Real `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` values must be added to `.env` before `bsp serve` can be used in production-like dev (placeholders are in there now). The user will need:
- An Anthropic API key from https://console.anthropic.com/ (used by 02-04, 02-05 sub-agents)
- A Tavily API key from https://app.tavily.com/ (free tier 1k credits/month — used by 02-03's tavily tools)

These were already noted in the plan's `user_setup` frontmatter.

## Next Phase Readiness

**Ready for 02-02 (DATA-09 hybrid search):**
- @/server alias in place; @/onebrain alias unchanged.
- Unit project routes `tests/server/` (won't be needed for 02-02; tests/onebrain/ is already covered by the unit include glob for *.test.ts but 02-02 may want to add `tests/onebrain/*.spec.ts` to the include — small follow-up).

**Ready for 02-03 (tool-permission boundary):**
- @/agents alias in place; tests/agents/ project ready for `coordinator-config.spec.ts`, `tool-permission.spec.ts`, etc.
- @tavily/core ESM-clean — `import { tavily } from '@tavily/core'` works.

**Ready for 02-04..02-09:**
- All Phase 2 deps installed and ESM-verified.
- Hono createApp() factory ready for `.route('/chat', chatRoute)` and `.route('/recompile', recompileRoute)` mounts in 02-06 and 02-08.
- Phoenix tracing module ready (opt-in) — sub-agent invocations will be auto-instrumented when PHOENIX_ENABLED=1.
- Vite proxy ready — frontend (02-07) at :5173 reaches Hono at :3000 without CORS.

**No blockers. No pending decisions.**

## Self-Check: PASSED

Files created (all present):
- `src/server/index.ts` — FOUND
- `src/server/routes/health.ts` — FOUND
- `src/cli/commands/serve.ts` — FOUND
- `src/lib/tracing.ts` — FOUND
- `tests/server/health.spec.ts` — FOUND
- `tests/setup/jsdom-setup.ts` — FOUND
- `tests/ui/.gitkeep` — FOUND
- `tests/agents/.gitkeep` — FOUND

Commits exist:
- `a9ec9ee` — FOUND (Task 1: deps + env)
- `b39f22a` — FOUND (Task 2: server + serve + tracing + health probe)
- `5d895f1` — FOUND (Task 3: vitest projects + jsdom-setup + alias fix)

---
*Phase: 02-agents-and-chat*
*Plan: 01*
*Completed: 2026-04-27*
