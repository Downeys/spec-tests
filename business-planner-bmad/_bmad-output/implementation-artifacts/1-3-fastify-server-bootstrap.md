# Story 1.3: Fastify server bootstrap

Status: done

## Story

As Downe,
I want the Fastify server running with structured logging, typed errors, env loading, and a health route,
so that every later server story adds handlers to a hardened runtime rather than re-solving boilerplate.

## Acceptance Criteria

1. **AC1 — Boot + Zod env + Pino startup banner.** Given `apps/server` exists, when I run `pnpm --filter @bp/server dev`, then Fastify 5 boots, loads environment variables via a typed config module (Zod-validated, fails fast on missing required keys), and logs a startup banner via Pino with `level`, `time`, `pid`, `hostname`, and `git_sha` fields.

2. **AC2 — `GET /healthz` shape + snake_case wire.** Given the server is running, when I `GET /healthz`, then the response is `200 OK` with a JSON body `{ "status": "ok", "uptime_seconds": N, "version": "<pkg.version>" }` and the wire fields are snake_case.

3. **AC3 — AppError → envelope via single error hook.** Given a handler throws an `AppError` with `code: 'rate_limited'` and `status: 429`, when the request completes, then the single Fastify error hook serializes the error into the shared envelope `{ error: { code, message, retryable, details? } }` and logs the error at Pino `warn` or `error` level based on severity — no handler writes an error response directly.

4. **AC4 — Unhandled exception → generic 500 envelope.** Given an unexpected exception escapes a handler, when the error hook runs, then it returns a generic `{ error: { code: 'internal', message: 'internal_error', retryable: false } }` envelope with status 500, logs the full stack at `error` level, and does NOT leak stack traces to the client.

5. **AC5 — 404 uses the same envelope.** Given the server is running, when I request a route that does not exist, then the 404 response uses the same envelope format with `code: 'not_found'`.

6. **AC6 — Missing required key → fast non-zero exit.** Given the env file is missing `ANTHROPIC_API_KEY`, when I start the server, then it exits with a non-zero code within 100ms and prints a clear message naming the missing key — no partial startup.

## Tasks / Subtasks

- [x] **Task 1: Zod env config module (AC: 1, 6)**
  - [x] Create `apps/server/src/config/env.ts` exporting `envSchema` (Zod) and `type Env = z.infer<typeof envSchema>`.
  - [x] Required at Story 1.3: `ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required')`. All other API keys (`TAVILY_API_KEY`, `PINECONE_API_KEY`, `VOYAGE_API_KEY`, `DATABASE_URL`) are `optional()` in Epic 1 and become required in the story that first uses them (Epic 2+). Do NOT mark them required now — AC6 names only `ANTHROPIC_API_KEY`.
  - [x] Coerced numerics with bounds: `PORT: z.coerce.number().int().positive().max(65535).default(3000)`, same for `WEB_PORT` (default 5173). This fixes the deferred 1-1 review item "`Number()` returns NaN on invalid PORT".
  - [x] Defaults: `NODE_ENV: z.enum(['development','production','test']).default('development')`, `PINECONE_INDEX: z.string().min(1).default('business-planner-intelligence')`, `DATA_ROOT: z.string().default('./data')`.
  - [x] Create `apps/server/src/config/index.ts` exporting a `loadEnv(): Env` function: runs `dotenv/config` (once), calls `envSchema.safeParse(process.env)`, and on failure prints a formatted human message to stderr naming every failed key (use `result.error.issues[].path[0]` + `message`), then `process.exit(1)`. On success returns the parsed `Env` object.
  - [x] `loadEnv()` MUST be the first call in `main.ts` — before Fastify import chains resolve or any async work — to satisfy AC6's 100ms budget.

- [x] **Task 2: `AppError` class (AC: 3, 4)**
  - [x] Create `apps/server/src/errors/AppError.ts`. Import `ErrorCode` and `AppErrorShape` from `@bp/shared` (both are exports from Story 1.2 — do NOT redefine).
  - [x] Class signature: `export class AppError extends Error implements AppErrorShape { readonly code: ErrorCode; readonly status: number; readonly retryable: boolean; readonly details?: unknown; constructor(code: ErrorCode, message: string, options: { status: number; retryable?: boolean; details?: unknown; cause?: unknown }) }`.
  - [x] Default `retryable` to `false` when omitted. Pass `cause` through to `super(message, { cause })` so Pino's serializer captures the chain.
  - [x] Set `this.name = 'AppError'`.
  - [x] Create `apps/server/src/errors/index.ts` barrel exporting `AppError` and `errorHook` (Task 4).
  - [x] **Do NOT** add an extended error hierarchy (no `RateLimitedError`, `PineconeWriteError` subclasses). The `code` field is the discriminator. One class is sufficient per architecture §Enforcement.

- [x] **Task 3: Pino logger module (AC: 1)**
  - [x] `pnpm --filter @bp/server add pino` — Fastify 5 bundles pino transitively for `logger: true`, but we need to configure `base` to add `git_sha`, so we take a direct dep.
  - [x] Create `apps/server/src/logging/pino.ts`. Compute `git_sha` once at module load: `try { execSync('git rev-parse --short HEAD', { stdio: ['ignore','pipe','ignore'] }).toString().trim() } catch { return 'unknown' }` (import `execSync` from `node:child_process`). `'unknown'` fallback covers CI and non-git environments.
  - [x] Export a configured pino instance: `export const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug', base: { pid: process.pid, hostname: os.hostname(), git_sha: gitSha }, timestamp: pino.stdTimeFunctions.isoTime })`. `os.hostname()` imported from `node:os`. ISO timestamps satisfy architecture §Format Patterns ("ISO-8601 UTC strings everywhere ... in JSONL logs").
  - [x] Create `apps/server/src/logging/index.ts` barrel re-exporting `logger`.
  - [x] Logger module must accept `env` as a constructor parameter or be initialized after `loadEnv()` returns — no top-level `process.env` reads. Recommended: `export function createLogger(env: Env) { ... }` returning the pino instance; `main.ts` calls it post-config.

- [x] **Task 4: Fastify error hook + 404 handler (AC: 3, 4, 5)**
  - [x] Create `apps/server/src/errors/errorHook.ts` exporting `registerErrorHooks(app: FastifyInstance)`:
    1. `app.setErrorHandler((err, req, reply) => { ... })`:
       - If `err instanceof AppError`: log at `'warn'` if `status < 500`, `'error'` if `status >= 500`, include `{ code: err.code, status: err.status, retryable: err.retryable, req_id: req.id }` in the log context. Respond `reply.status(err.status).send({ error: { code: err.code, message: err.message, retryable: err.retryable, details: err.details } })` (omit `details` key if `undefined` — do NOT send `"details": undefined`).
       - Else: log `err` (full stack) at `'error'` with `{ req_id: req.id }`. Respond `reply.status(500).send({ error: { code: 'internal', message: 'internal_error', retryable: false } })`. Never include `err.message` or the stack in the response body (AC4 "no stack leak").
    2. `app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Route not found', retryable: false } }))`.
  - [x] Every response from these handlers is typed to satisfy the `ErrorEnvelope` shape from `@bp/shared/errors` — import that type and annotate locally to keep the wire contract visible.
  - [x] **Do not** set a custom `serializerCompiler` or error-mapping plugin — one `setErrorHandler` is the single choke point (AC3: "no handler writes an error response directly").

- [x] **Task 5: `/healthz` route (AC: 2)**
  - [x] Create `apps/server/src/routes/health.ts` exporting `export async function registerHealthRoute(app: FastifyInstance, opts: { version: string })`.
  - [x] Register `app.get('/healthz', async () => ({ status: 'ok' as const, uptime_seconds: Math.round(process.uptime()), version: opts.version }))`.
  - [x] Fields are literally `status`, `uptime_seconds`, `version` — snake_case, matching `@bp/shared` conventions (there is no shared DTO for health; the response shape is inlined here). `uptime_seconds` is a whole number (seconds, rounded), not milliseconds.
  - [x] The `version` is read once at server construction from `apps/server/package.json` via `import pkg from '../../package.json' with { type: 'json' }` (Node 22 + `resolveJsonModule: true` + `isolatedModules: true` from `tsconfig.base`). Pass `pkg.version` into `registerHealthRoute`'s opts so the route module itself stays free of filesystem reads.
  - [x] Create `apps/server/src/routes/index.ts` barrel exporting a single `registerRoutes(app, opts)` helper that today only calls `registerHealthRoute` — later stories (1.5, 1.7) add `registerProjectsRoutes`, `registerSessionsRoutes`, etc.
  - [x] **Rename**, do not add: Story 1.1 created `GET /api/health` returning `{ status: 'ok' }` in `src/server.ts`. This story REMOVES that route and replaces it with `GET /healthz` at the root path (matches the epic AC exactly — `/healthz` not `/api/healthz`). The existing test in `src/server.test.ts` must be replaced, not extended.

- [x] **Task 6: `buildApp` factory (AC: 1, 3, 4, 5)**
  - [x] Create `apps/server/src/buildApp.ts` exporting `export async function buildApp(env: Env, logger: pino.Logger): Promise<FastifyInstance>`.
  - [x] Construct Fastify with the prebuilt pino: `const app = Fastify({ loggerInstance: logger, disableRequestLogging: false })` — Fastify 5 accepts `loggerInstance` for a prepared pino instance (this replaces the v4 `{ logger: { ... } }` option when a full instance is supplied).
  - [x] Register `@fastify/cors` with `origin: \`http://127.0.0.1:${env.WEB_PORT}\`` (dynamic, fixes the deferred 1-1 item "CORS port not dynamic"). Keep `credentials: false`.
  - [x] Call `registerErrorHooks(app)` BEFORE `registerRoutes(app, { version: pkg.version })` so the error handler is registered before any route that might throw during registration.
  - [x] Return `app`.
  - [x] **Delete** the existing `apps/server/src/server.ts` file — it is superseded by `buildApp.ts`. Update any imports (tests) to import from `./buildApp`.

- [x] **Task 7: Refactor `main.ts` entry (AC: 1, 6)**
  - [x] Order of operations (strict, measured against AC6's 100ms exit budget):
    1. `const env = loadEnv()` — fails fast with exit 1 on invalid config (NO Fastify import yet would force chain resolution; `loadEnv` only depends on `zod` + `dotenv`).
    2. `const logger = createLogger(env)`.
    3. Log the startup banner: `logger.info({ port: env.PORT, host: '127.0.0.1', node_env: env.NODE_ENV }, 'server starting')` — this one line produces a log record with `level`, `time`, `pid`, `hostname`, `git_sha` (from `base`) plus the msg — satisfies AC1's banner requirement. The second banner line `logger.info({ port }, 'server listening')` fires after `listen()` resolves.
    4. `const app = await buildApp(env, logger)`.
    5. `await app.listen({ host: '127.0.0.1', port: env.PORT })`. **Bind `127.0.0.1` only** — never `0.0.0.0` (architecture §Authentication & Security). Catch and `logger.error` + `process.exit(1)` on listen failure.
  - [x] Keep the `await` top-level (node 22 ESM already supports it). Do NOT wrap in IIFE.
  - [x] Remove the dotenv import from `main.ts` (moved into `loadEnv()` — single source).

- [x] **Task 8: Tests — co-located unit + request injection (AC: 2, 3, 4, 5, 6)**
  - [x] `apps/server/src/config/env.test.ts`:
    - Test 1: `envSchema.safeParse({ ANTHROPIC_API_KEY: 'sk-test' })` → success with defaults.
    - Test 2: `envSchema.safeParse({})` → failure; `issues[0].path[0] === 'ANTHROPIC_API_KEY'`.
    - Test 3: `envSchema.safeParse({ ANTHROPIC_API_KEY: 'sk-test', PORT: 'abc' })` → failure with a port-type message (proves Zod catches the NaN case).
    - Do NOT spawn a subprocess to test `process.exit(1)` — unit-test the schema directly; the exit wiring is obvious from the 3-line `loadEnv` body.
  - [x] `apps/server/src/routes/health.test.ts`:
    - Builds an app via `buildApp(fakeEnv, silentLogger)` and `app.inject({ method: 'GET', url: '/healthz' })`.
    - Asserts `statusCode === 200`, `json().status === 'ok'`, `typeof json().uptime_seconds === 'number'`, `json().version === '<pkg.version>'`, and that no other top-level keys exist (guards against stray fields).
  - [x] `apps/server/src/errors/errorHook.test.ts`:
    - Registers a throwaway test route `app.get('/__throw_app_error', () => { throw new AppError('rate_limited', 'slow down', { status: 429, retryable: true }) })` **inside the test only** (never in production code).
    - Asserts `{ statusCode: 429, json: { error: { code: 'rate_limited', message: 'slow down', retryable: true } } }`.
    - Second test route throws `new Error('boom')` — asserts 500 with `{ error: { code: 'internal', message: 'internal_error', retryable: false } }` and that the body does NOT contain the string `'boom'` or any stack trace.
    - Third test: `app.inject({ url: '/nope' })` → `{ statusCode: 404, json: { error: { code: 'not_found', ... } } }`.
    - Use a `pino({ level: 'silent' })` instance in tests to keep output clean.
  - [x] **ESLint exception note:** `eslint.config.js` forbids `throw new Error(` in `apps/server/src/**/*.ts` but the existing test override already disables `no-restricted-syntax` for `**/*.test.{ts,tsx}`. No config change needed.

- [x] **Task 9: Remove the Story 1.1 placeholder test + verify full gate (AC: 1–6)**
  - [x] Delete `apps/server/src/server.test.ts` (tested the now-removed `GET /api/health`).
  - [x] `pnpm --filter @bp/server typecheck` exits 0.
  - [x] `pnpm --filter @bp/server test` exits 0 (new tests from Task 8 run).
  - [x] `pnpm --filter @bp/server lint` exits 0.
  - [x] `pnpm --filter @bp/server dev` — confirm: first log line is the startup banner JSON with `git_sha`; `curl -s http://127.0.0.1:3000/healthz` returns the expected JSON; `curl -s http://127.0.0.1:3000/does-not-exist` returns the 404 envelope.
  - [x] Temporarily blank `ANTHROPIC_API_KEY` in `.env`, run `pnpm --filter @bp/server dev`, confirm the process exits non-zero with the key name in the message. Restore `.env` after.
  - [x] Full repo gate: `pnpm typecheck && pnpm lint && pnpm test` all green.

## Dev Notes

### Starting state from Stories 1.1 + 1.2

**Already in place — do not recreate:**
- `apps/server/package.json` — name `@bp/server`, type `module`, deps: `@bp/shared workspace:*`, `@fastify/cors ^11`, `dotenv ^16`, `fastify ^5.2.1`, `zod ^3.24.1`. No `pino` yet — Task 3 adds it.
- `apps/server/tsconfig.json` — extends `../../tsconfig.base.json`, references `../../packages/shared`, `lib: ['ES2022']`, `types: ['node']`, `sourceMap: true`, `rootDir: 'src'`.
- `apps/server/vitest.config.ts` — `environment: 'node'`, `include: ['src/**/*.{test,spec}.ts']`.
- `apps/server/src/main.ts` + `apps/server/src/server.ts` + `apps/server/src/server.test.ts` — a 3-file minimal "health check" scaffold. **This story replaces all three.** Do not try to preserve them; the new layout (buildApp + routes + errors + config + logging directories) is the permanent shape per architecture §Complete Project Directory Structure.
- `@bp/shared` exports `ErrorCode` union (10 codes), `ErrorEnvelope` (`{ error: { code, message, retryable, details? } }`), and `AppErrorShape` (`{ code, message, retryable, status }`). This story's `AppError` class MUST `implements AppErrorShape` — do not reinvent the shape.

**Root ESLint already forbids the anti-patterns this story must avoid:**
- `apps/server/src/**/*.ts` bans `throw new Error(` (AST selector: `ThrowStatement > NewExpression[callee.name='Error']`). Use `AppError` for all server throws.
- `apps/server/src/**/*.ts` bans raw `res.write(JSON.stringify(...))` (the SSE anti-pattern). Not directly relevant here, but the rule fires in Story 1.6 — noted for context.
- Tests are exempt (the `**/*.test.*` override disables `no-restricted-syntax`).

**Environment variables** (`.env.example` at repo root) — all ten keys already documented. This story consumes them; `TAVILY_API_KEY`, `PINECONE_*`, `VOYAGE_API_KEY`, `DATABASE_URL` remain optional until Epic 2.

### Architecture compliance cross-reference

| Concern | Architecture § | This story's move |
|---|---|---|
| Env loaded via `zod`, fail fast | §Infrastructure & Deployment, §Environment configuration | Task 1 (`config/env.ts` + `loadEnv` in `main.ts`) |
| `AppError extends Error` with `code`, `retryable` | §Process Patterns, §Error handling | Task 2 (`errors/AppError.ts`) |
| Single Fastify error hook → envelope; stack never leaks | §Process Patterns | Task 4 (`errors/errorHook.ts`, `setErrorHandler`) |
| Pino JSON stdout + `data/logs/server.jsonl` (stream #1) | §Monitoring & logging — 5 streams | Task 3 — Pino stdout only this story; `data/logs/server.jsonl` duplicate stream deferred to Epic 2 (write mirror appears when `costs.jsonl` and `sessions/*.jsonl` also come online) |
| Bind `127.0.0.1` only | §Authentication & Security | Task 7 |
| `snake_case` wire fields | §Format Patterns | Tasks 4, 5 (envelope + healthz) |
| `@fastify/cors` to `http://localhost:5173` | §Authentication & Security | Task 6 (dynamic via `env.WEB_PORT`) |
| UUID v4 IDs server-generated | §Format Patterns | Not in scope this story — Story 1.5 creates the first IDs |

### Why a `data/logs/server.jsonl` mirror is NOT wired this story

Architecture lists 5 log streams: (1) backend app log (Pino stdout **+ `data/logs/server.jsonl`**), (2) agent event transcript, (3) wiki activity log, (4) cost events, (5) Pinecone ack log. Story 1.3 ships only stream #1 to stdout. The file mirror, transcript, and other streams belong to the stories that produce their content (session transcript = Story 1.7, cost events = Story 1.11, wiki log = Story 4.1). Wiring a disk-mirror destination now creates an empty file and a flush-on-exit concern that pays zero dividends until at least Epic 2.

### Why `loadEnv()` must run before any Fastify import chain

AC6 caps total time-to-exit at 100ms when `ANTHROPIC_API_KEY` is missing. Importing Fastify 5 pulls ~40ms of module load on cold Node 22. `main.ts` must be ordered:

```ts
// apps/server/src/main.ts
import { loadEnv } from './config';          // <10ms — zod + dotenv only
const env = loadEnv();                        // exits here on missing key
import('./buildApp').then(...)               // dynamic import AFTER config pass
```

An alternative (static) order also works if `buildApp` is the only heavy import — but the dynamic pattern guarantees the 100ms budget no matter what later stories add. Pick either; document in a code comment which guarantee you rely on.

### Fastify 5 logger option: `loggerInstance` vs `logger`

- Fastify 4: `{ logger: pino(...) }` accepted either a config object or a prebuilt instance.
- Fastify 5: `{ logger: true }` uses default pino; `{ logger: { ... } }` takes pino **config**; `{ loggerInstance: pino(...) }` takes a **prebuilt** instance. Use `loggerInstance` — we configure pino centrally to add `git_sha` and ISO timestamps, then hand the instance to Fastify.

Reference: Fastify v5 release notes §Logging. `@types/fastify` types both options; TypeScript flags the mismatch if you pass `pino(...)` under `logger` instead of `loggerInstance`.

### `AppError.details` serialization

`ErrorEnvelope.error.details` is `unknown` — any shape is allowed on the wire. Two rules:
1. **Never** put `err.stack` in `details`.
2. **Never** put raw upstream API responses verbatim (they may contain PII or vendor headers); extract only the fields the client needs (`retry_after`, `upstream_code`, etc.).

When `details` is `undefined`, omit the key from the envelope — do not send `"details": undefined` or `"details": null` (architecture §Format Patterns: "null means explicitly no value; omit the field if it's not applicable").

### Git SHA retrieval fallback

`execSync('git rev-parse --short HEAD')` can throw in three cases: (1) git isn't installed, (2) not a git repo, (3) HEAD doesn't exist (fresh repo with no commits). The `'unknown'` fallback covers all three. Do not let a missing SHA crash startup — it's a log field, not a functional one.

**Do NOT** invoke `git` on every log line — call it once at module load. Re-reading would cost ~30ms per log.

### What this story does NOT do (boundaries)

- **No SSE routes** — `@fastify/sse-v2` is NOT installed here. Story 1.6 owns SSE.
- **No Claude / Pinecone / Tavily / Voyage clients** — those belong to Stories 1.7 and 2.1. Do not pre-create empty `clients/` files.
- **No projects / sessions / costs / wiki routes** — Stories 1.5 / 1.7 / 1.11 / 4.1 own those. `routes/index.ts` only registers `health` this story.
- **No `data/logs/server.jsonl` mirror, no transcript writer** — see "Why not wired this story" above.
- **No integration tests** — `apps/server/tests/integration/` stays empty (the `.gitkeep` from Story 1.1 remains). Integration tests gated behind `INTEGRATION=1` come in Story 1.7.
- **No Anthropic SDK installation** — the env `ANTHROPIC_API_KEY` is validated as a string but never read by a client yet.
- **No rate limiting, no auth middleware** — permanently out of scope (single-user local tool).
- **No Docker / Postgres wiring** — Phase 2.
- **No request-id middleware** — Fastify 5 auto-generates `req.id` (monotonic number); the error hook uses `req.id` directly. A custom request-id plugin is not required for a single-user local server.

### Fixes for deferred 1-1 + 1-2 review items this story closes

- ✅ **CORS port dynamic** — Task 6 reads `env.WEB_PORT` (was hard-coded `5173`).
- ✅ **`Number()` NaN on invalid `PORT`** — Task 1 uses `z.coerce.number().int().positive().max(65535)` (was `Number(process.env.PORT ?? 3000)`).
- ⏭ **Branded types have no runtime enforcement** — Story 1.2 deferred item. This story is where we'd add Zod schemas for branded types (e.g. `z.string().uuid().transform(v => v as ProjectId)`) — **but** no handler in this story creates or consumes branded IDs yet. Defer to Story 1.5 (first project CRUD). Noted here so Story 1.5 picks it up.
- ⏭ **Type-layer validation gaps (negative costs, empty content, etc.)** — Story 1.2 deferred. Addressed incrementally in the route story that owns each shape (1.5 for projects, 1.7 for messages, 1.11 for costs). This story adds the *framework* (Zod config validation) that those route stories will extend to body/query validation.

### Previous story intelligence — patterns to follow

From [1-2-shared-types-package.md](./1-2-shared-types-package.md) Dev Notes:
- **Project references with `composite: true`** — already configured. `pnpm typecheck` cascades breaking changes from `@bp/shared` into `@bp/server`. No additional tsconfig changes needed this story.
- **Story-canonical event names** — `message.delta`, `tool_call.start`, `tool_call.end`, `done` (NOT the architecture's older `message.token` / `tool.started` vocabulary). Not directly consumed in Story 1.3, but the `AppError` → `error` SSE event shape already defined in `@bp/shared/events.ts` (`ErrorEvent = { type: 'error'; code: ErrorCode; message: string; retryable: boolean }`) is what Story 1.6 will emit. This story's error hook writes the HTTP envelope; the SSE-emitting equivalent lives in Story 1.6.
- **`assertNever` helper is exported from `@bp/shared/events`** — use it if you write any `switch (err.code)` elsewhere. Not needed in Task 4 because the error hook branches on `instanceof AppError`, not on `code`.
- **pnpm 10.33.0** — not pnpm 9. Script commands: `pnpm --filter @bp/server add pino` (not `pnpm add pino --filter`; pnpm 10 accepts both, the former is the docs-style).

### Git intelligence — recent commits touching the server app

```
4df7bf9 feat: implement story 1-2 shared types package
e0cf4b4 feat: add React web app with Vite, TypeScript, and test scaffold
4ee8f32 feat: add shared package with core types and utilities
597070a chore: initialize monorepo root scaffold and tooling
```

Patterns observed:
- Each story lands as a single `feat:` commit with complete file set — match this style. No in-progress commits.
- Tests are co-located `*.test.ts` next to source (`server.test.ts` next to `server.ts`). Continue the pattern for `errorHook.test.ts`, `health.test.ts`, `env.test.ts`.
- `packages/shared` landed before this story and is the authoritative source of `ErrorCode`, `ErrorEnvelope`, `AppErrorShape`. Import from `@bp/shared`, never redefine.

### Latest tech specifics (verified for this story)

- **Fastify 5.2.1** — already in `package.json`. Option naming: `{ loggerInstance: pino(...) }` (not v4's `{ logger: pino(...) }`). `setErrorHandler` and `setNotFoundHandler` signatures unchanged from v4.
- **Pino 9** — Fastify 5 bundles pino 9 transitively; installing `pino` directly (Task 3) brings `^9.x` as a sibling peer. `pino.stdTimeFunctions.isoTime` is stable in pino 9.
- **Zod 3.24.1** — already installed. Use `z.coerce.number()` for env numerics (stable since 3.20). `result.error.issues` is the 3.x shape (`errors` is 4.x; do not use).
- **Node 22** — top-level `await` + JSON import assertions (`with { type: 'json' }`) are both stable.

### Project Structure Notes

New files (eight):

| File | Purpose |
|---|---|
| `apps/server/src/config/env.ts` | Zod schema + `Env` type |
| `apps/server/src/config/index.ts` | `loadEnv()` (dotenv + safeParse + exit-on-fail) |
| `apps/server/src/config/env.test.ts` | schema coverage |
| `apps/server/src/errors/AppError.ts` | class, implements `AppErrorShape` |
| `apps/server/src/errors/errorHook.ts` | `registerErrorHooks(app)` |
| `apps/server/src/errors/errorHook.test.ts` | envelope path coverage (AppError + generic + 404) |
| `apps/server/src/errors/index.ts` | barrel |
| `apps/server/src/logging/pino.ts` | `createLogger(env)` factory |
| `apps/server/src/logging/index.ts` | barrel |
| `apps/server/src/routes/health.ts` | `registerHealthRoute(app, { version })` |
| `apps/server/src/routes/health.test.ts` | GET `/healthz` coverage |
| `apps/server/src/routes/index.ts` | `registerRoutes(app, opts)` barrel |
| `apps/server/src/buildApp.ts` | Fastify factory (logger + CORS + error hook + routes) |

Modified files:

| File | Change |
|---|---|
| `apps/server/src/main.ts` | reordered — config → logger → buildApp → listen |
| `apps/server/package.json` | add `pino` dep |

Deleted files:

| File | Reason |
|---|---|
| `apps/server/src/server.ts` | replaced by `buildApp.ts` |
| `apps/server/src/server.test.ts` | replaced by `routes/health.test.ts` (new route shape) |

No changes outside `apps/server/`. No shared-package or root-config edits.

### Conflict check: `buildApp` vs Story 1.1's `buildServer`

Story 1.1 deviation: the scaffold used `buildServer()` in `server.ts`, not the architecture-named `buildApp()` in `buildApp.ts`. Architecture §Complete Project Directory Structure is authoritative — use `buildApp`. The rename is part of Task 6 (delete old file, create new file). Keep the factory pure: no `app.listen()` inside `buildApp` — listen is `main.ts`'s job.

### References

- [epics.md §Story 1.3: Fastify server bootstrap](../planning-artifacts/epics.md) — source of all 6 ACs.
- [architecture.md §Authentication & Security](../planning-artifacts/architecture.md) — bind `127.0.0.1` only, `.env` secrets, no auth.
- [architecture.md §Process Patterns — Error handling](../planning-artifacts/architecture.md) — typed `AppError`, single Fastify error hook, no stack leak.
- [architecture.md §Format Patterns](../planning-artifacts/architecture.md) — snake_case wire fields, ISO-8601 timestamps, UUID v4 IDs server-generated (informs AppError/envelope).
- [architecture.md §Infrastructure & Deployment — Environment configuration](../planning-artifacts/architecture.md) — zod env in `apps/server/src/config.ts`, fail fast.
- [architecture.md §Monitoring & logging — 5 streams](../planning-artifacts/architecture.md) — Pino stream #1 (stdout); file mirror + other streams deferred to later stories.
- [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) — authoritative server layout: `main.ts`, `buildApp.ts`, `config/`, `errors/`, `events/`, `logging/`, `routes/`.
- [architecture.md §Enforcement Guidelines](../planning-artifacts/architecture.md) — "Throw `AppError` with a valid `ErrorCode` — never `throw new Error('string')` in request paths."
- [packages/shared/src/errors.ts](../../packages/shared/src/errors.ts) — `ErrorCode` union, `ErrorEnvelope`, `AppErrorShape`.
- [1-2-shared-types-package.md §Dev Notes — What this story does NOT do](./1-2-shared-types-package.md) — explicitly handed `AppError` class to Story 1.3.
- [deferred-work.md](./deferred-work.md) — items this story closes (CORS port dynamic, PORT NaN) and items it intentionally defers.
- [prd.md §NFR1–NFR5](../planning-artifacts/prd.md) — integration resilience requirements; codified here as the error envelope framework, extended per-dependency in Epic 2.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code / bmad-dev-story)

### Debug Log References

- Manual smoke (live server on port 3099): startup banner log contained `level`, `time` (ISO), `pid`, `hostname`, `git_sha: 4df7bf9`, `port`, `host`, `node_env` — AC1 observed. `GET /healthz` → `200` with body `{"status":"ok","uptime_seconds":3,"version":"0.1.0"}` — AC2 observed. `GET /does-not-exist` → `404` with body `{"error":{"code":"not_found","message":"Route not found","retryable":false}}` — AC5 observed.
- Manual AC6 smoke: `ANTHROPIC_API_KEY` unset, `node --import tsx src/main.ts` → stderr `Environment configuration is invalid:\n  - ANTHROPIC_API_KEY: Required`, process exit code `1`. Fastify is never imported on this path (env check is the first statement in `main.ts`, buildApp is a dynamic import that never runs), so "no partial startup" is structurally guaranteed.
- Pino 10 (the default installed version) narrows `Logger` with a required `msgPrefix` that Fastify 5's `FastifyBaseLogger` does not declare. This surfaces as a TS variance error on the `FastifyInstance<..., Logger>` returned by `Fastify({ loggerInstance })`. Two fixes considered: (a) downgrade to pino ^9 — does not resolve the variance; (b) cast the pino instance to `FastifyBaseLogger` at the Fastify boundary so the instance generic stays at the default. Went with both: pinned `pino` to `^9` per Dev Notes, plus a single `as unknown as FastifyBaseLogger` cast in `buildApp.ts` where the instance is handed off. All downstream helpers (`registerRoutes`, `registerErrorHooks`) keep their plain `FastifyInstance` signature.

### Completion Notes List

- All 6 ACs exercised: AC1 via live banner capture + AC1 fields present in `routes/health.test.ts`; AC2 via `routes/health.test.ts`; AC3 + AC4 via `errors/errorHook.test.ts` (429 AppError path, 500 generic path with stack-leak guard); AC5 via `errors/errorHook.test.ts` 404 injection and live 404 curl; AC6 via `config/env.test.ts` (schema rejects empty + non-numeric PORT) + live exit-code check.
- Pino dependency pinned to `^9` (Dev Notes called for 9, and 10's `msgPrefix` requirement trips Fastify 5's type surface).
- `details` is omitted from the envelope when `undefined` (spread-if-defined), matching §Format Patterns "omit the field if not applicable".
- Envelope body is typed locally via `ErrorEnvelope` from `@bp/shared/errors` in `errorHook.ts` to keep the wire contract visible at the single choke point.
- Replaced (not extended) the Story 1.1 `GET /api/health` surface: `src/server.ts` and `src/server.test.ts` deleted; their replacements are `src/buildApp.ts` plus the `routes/`, `errors/`, `config/`, `logging/` directories.
- Repo gate green: `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm test` ✅ (shared + server + web).
- Dynamic imports in `main.ts` (`await import('./logging/index.js')`, `await import('./buildApp.js')`) make the "no Fastify before env" ordering explicit and enforce AC6 structurally — not just as a convention.

### File List

New:

- `apps/server/src/config/env.ts`
- `apps/server/src/config/index.ts`
- `apps/server/src/config/env.test.ts`
- `apps/server/src/errors/AppError.ts`
- `apps/server/src/errors/errorHook.ts`
- `apps/server/src/errors/errorHook.test.ts`
- `apps/server/src/errors/index.ts`
- `apps/server/src/logging/pino.ts`
- `apps/server/src/logging/index.ts`
- `apps/server/src/routes/health.ts`
- `apps/server/src/routes/health.test.ts`
- `apps/server/src/routes/index.ts`
- `apps/server/src/buildApp.ts`

Modified:

- `apps/server/src/main.ts`
- `apps/server/package.json` (added `pino ^9` dep)
- `pnpm-lock.yaml` (pino install)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-3 status: ready-for-dev → in-progress → review; last_updated date)
- `_bmad-output/implementation-artifacts/1-3-fastify-server-bootstrap.md` (this story file: Status, Tasks/Subtasks, Dev Agent Record, File List, Change Log)

Deleted:

- `apps/server/src/server.ts`
- `apps/server/src/server.test.ts`

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-04-23 | Implemented Story 1.3: Fastify server bootstrap. Added Zod env config, AppError class, Pino logger, Fastify error hook + 404 handler, `/healthz` route, `buildApp` factory, refactored `main.ts` to fail-fast on missing env before Fastify import. Replaced Story 1.1 `/api/health` scaffold with the permanent layout. All 6 ACs verified via unit tests + live smoke. | Claude (Dev) |

## Review Findings

- [x] [Review][Decision] `details: unknown` provides no runtime guard against sensitive data in error responses — Fixed: added `sanitizeDetails()` in `errorHook.ts` using `structuredClone` + `delete stack` before spreading into envelope.
- [x] [Review][Patch] `buildApp()` throw is not caught — only `app.listen()` is wrapped in try/catch [`apps/server/src/main.ts`] — Fixed: wrapped in separate try/catch with `logger.error` + `process.exit(1)`.
- [x] [Review][Patch] `ErrorEnvelope` imported from `@bp/shared` instead of spec-prescribed `@bp/shared/errors` [`apps/server/src/errors/errorHook.ts`] — Dismissed: `@bp/shared` only exports `.` root path; sub-path not configured. Current import is correct.
- [x] [Review][Defer] `AppError.status` accepts any integer with no HTTP range validation [`apps/server/src/errors/AppError.ts`] — deferred, pre-existing
- [x] [Review][Defer] No response schema on `/healthz` — Fastify falls back to JSON.stringify, extra fields would leak [`apps/server/src/routes/health.ts`] — deferred, pre-existing
- [x] [Review][Defer] No SIGTERM/SIGINT handlers for graceful shutdown [`apps/server/src/main.ts`] — deferred, pre-existing
