# Deferred Work

## Deferred from: code review of 1-1-monorepo-scaffold-dev-loop (2026-04-23)

- **CORS port not dynamic** — `origin: 'http://127.0.0.1:5173'` is hardcoded; if `WEB_PORT` changes in `.env`, CORS silently breaks. Make it read `process.env.WEB_PORT ?? 5173` in `buildServer()`. [`apps/server/src/server.ts`]
- **Config files excluded from ESLint** — `'**/*.config.{js,mjs,cjs,ts}'` in the `ignores` array means `vite.config.ts`, `vitest.config.ts`, etc. are never linted. Errors in config files are invisible to the lint gate. [`eslint.config.js:15`]
- **`Number()` returns NaN on invalid PORT** — `Number(process.env.PORT ?? 3000)` returns `NaN` if `PORT=abc` or `PORT=''`. Story 1.3 owns proper zod env validation via `apps/server/src/config/env.ts`. [`apps/server/src/main.ts:4`]
- **`vitest.config.ts` `include` misses `tests/` dir** — `include: ['src/**/*.{test,spec}.ts']` won't discover integration tests placed under `apps/server/tests/`. Update when Story 1.7 adds integration tests. [`apps/server/vitest.config.ts:7`]
- **`apps/server/tsconfig.json` `include` misses `tests/`** — integration tests under `apps/server/tests/` won't be type-checked. Update alongside vitest config in Story 1.7. [`apps/server/tsconfig.json:10`]
- **`DATABASE_URL` default credentials `bp:bp` in `.env.example`** — trivial local dev placeholder but technically credentials in VCS. Replace with `<username>:<password>` placeholders before any public repo exposure. [`.env.example:6`]
- **`loadEnv('')` empty prefix** — loads all env vars (including secrets) into the `env` object in `vite.config.ts`. Safe at build-time only; becomes a risk if the pattern is copied into component-level code that feeds `define`. Consider scoping to a `VITE_` prefix for build-time port vars. [`apps/web/vite.config.ts:8`]

## Deferred from: code review of 1-3-fastify-server-bootstrap (2026-04-23)

- **`AppError.status` accepts any integer with no HTTP range validation** — status: number with no guard; an invalid value (0, -1, 999) would be passed to `reply.status()` with unpredictable results. Add a valid HTTP range check in Story 1.5 or when first additional error codes are introduced. [`apps/server/src/errors/AppError.ts`]
- **No response schema on `/healthz`** — Without a `schema.response` declaration, Fastify uses JSON.stringify (slower) and accidentally added fields would leak to clients. Add in a future story when server perf baseline is established. [`apps/server/src/routes/health.ts`]
- **No SIGTERM/SIGINT handlers for graceful shutdown** — Abrupt termination drops in-flight requests without clean connection draining. Add before any production deployment story. [`apps/server/src/main.ts`]

## Deferred from: code review of 1-4-frontend-shell-dark-theme-direction-b-layout (2026-04-23)

- **`ChatInput` is uncontrolled** — `onSubmit` receives no message text; no `value`/`onChange` on the textarea. Acceptable while input is always disabled. Story 1.8 replaces component internals with a fully wired controlled input. [`apps/web/src/features/Chat/ChatInput.tsx`]
- **`TabsContent` has no `forceMount`** — Radix Tabs unmounts inactive tab content by default. Static placeholders are unaffected now; will cause state loss and re-triggered fetches when live components land in future stories. Consider adding `forceMount` or `keepMounted` selectively as tab features are wired. [`apps/web/src/components/ui/tabs.tsx`]
- **`__dirname` used in ESM vite config** — works via Vite's internal CJS shim but is not standard ESM. If Vite changes its config transform pipeline, this will throw `ReferenceError`. Replace with `import.meta.dirname` (Node 21.2+) or `fileURLToPath(new URL('.', import.meta.url))`. [`apps/web/vite.config.ts:15`]
- **`ScrollArea` `data-testid` on Root div not Viewport** — `data-testid="chat-column"` spreads onto `ScrollAreaPrimitive.Root` (overflow-hidden wrapper), not the inner Viewport (scrolling element). Current content-presence tests are unaffected. Any future test that fires scroll events or reads `scrollTop`/`scrollHeight` against `chat-column` will target the wrong element. [`apps/web/src/features/Chat/ChatView.tsx:5`]
- **`ChatInput.handleKeyDown` no disabled guard** — `e.key === 'Enter'` check fires `onSubmit?.()` without checking `disabled`. Only exploitable if the `disabled` HTML attribute is removed from `Textarea` while the component prop remains `true`. Add `if (disabled) return;` as first line of `handleKeyDown` when Story 1.5 enables the input. [`apps/web/src/features/Chat/ChatInput.tsx:11`]

## Deferred from: code review of 1-5-project-crud-projectswitcher-pinecone-namespace-bootstrap (2026-04-23)

- **`ensureIndex` outside serialize lock** — concurrent `POST /api/projects` calls race on Pinecone API calls (not the file write, which is serialized). Harmless in single-user server; 409 handled correctly. Revisit if multi-user concurrency is introduced. [`apps/server/src/domain/projectService.ts:89-91`]
- **`api<T>` sets `content-type` on GET/DELETE requests** — unconditional `Content-Type: application/json` on all HTTP methods is non-standard but harmless with current server. [`apps/web/src/api/client.ts:15`]
- **`showFirstLaunch` triggers during query error state** — `projectId === null && !isLoading` is also true when the query errors. Users with existing projects who hit a network error see the create form. Spec doesn't define this case; acceptable degradation for now. [`apps/web/src/app/App.tsx:18`]
- **AC7(a-c) project-switch state reset mechanism absent** — trivially satisfied now (chat/tab/gauge are all placeholders). When Stories 1.8+ add real chat history and tab state, `setProjectId` in `ProjectSwitcher` must also dispatch clear actions. [`apps/web/src/features/ProjectSwitcher/ProjectSwitcher.tsx`]
- **`create` reserved-namespace defensive branch is dead code** — `uuidv4()` never starts with `__`, so `isReservedNamespace(projectId)` in `create` can never return true. Untestable without mocking uuid. Intentional by design per spec. [`apps/server/src/domain/projectService.ts:86-87`]
- **`list()` serialized with write ops** — unnecessarily queues concurrent reads behind writes. Acceptable in single-process single-user server; would need reader/writer lock pattern if concurrency requirements change. [`apps/server/src/domain/projectService.ts:109`]

## Deferred from: code review of 1-2-shared-types-package (2026-04-23)

- **`tsc --build` for typecheck may skip re-check on warm cache** — deliberate tradeoff to resolve TS6305; warm CI cache could return green without rechecking. [`packages/shared/package.json`]
- **Event interfaces only mark `type` as `readonly`; all data fields are mutable** — `event.delta = 'tampered'` is valid at the type level. If immutability is intent, all fields should be `readonly`. [`packages/shared/src/events.ts`]
- **`ChatMessage.status: 'error'` carries no error payload** — consumers cannot surface error reason through the domain type alone. [`packages/shared/src/domain.ts`]
- **`CostRecord` has no unique identifier** — deduplication, upsert, and idempotent billing are impossible at the type level. Revisit in Story 1.11. [`packages/shared/src/costs.ts`]
- **Missing `outDir` in `packages/shared/tsconfig.json`** — low risk now (`emitDeclarationOnly: true`), but removing that flag without adding `outDir` would write `.js` files next to `.ts` sources. [`packages/shared/tsconfig.json`]
- **`typescript` in per-package `devDependencies` rather than root** — composite build version skew risk; consider moving to root `devDependencies`. [`packages/shared/package.json`]
- **`ContextUpdateEvent.pct_used` is independent of `used_tokens`/`max_tokens`** — server emits three fields with no enforced derivation; inconsistent values are possible. [`packages/shared/src/events.ts`]
- **`ToolCall.duration_ms` optional vs `ToolCallEndEvent.duration_ms` required** — event guarantees the value exists; domain type allows it to be dropped during persistence mapping. [`packages/shared/src/domain.ts` vs `events.ts`]
- **`DecisionRecord.evidence` allows empty array** — `{ confidence: 'high', evidence: [] }` is structurally valid, which is the most misleading case. [`packages/shared/src/domain.ts`]
- **Branded types (`IsoUtcTimestamp`, ID types) have no runtime enforcement** — `as BrandedType` casts bypass format/validity checks. Known limitation; Zod schemas in Story 1.3 are the correct enforcement boundary. [`packages/shared/src/ids.ts`]
- **Type-layer validation gaps (negative costs, zero max_tokens, empty strings, unvalidated namespace)** — belong at server validation boundary (Story 1.3 Zod schemas), not in the types-only package. [`packages/shared/src/events.ts`, `domain.ts`, `costs.ts`]

## Deferred from: code review of 1-6-sse-infrastructure-typed-event-emitters (2026-04-24)

- **Back-pressure: `write()` return value ignored** — `reply.raw.write()` return value is never checked and no `drain` event is awaited. Under a slow client the server buffers unbounded data. Acceptable for MVP; revisit if production SSE load warrants a high-water-mark circuit-breaker. [`apps/server/src/events/emit.ts:87,93`]
- **Echo route token has no auth check** — UUID format is validated but not tied to any session or user identity. Any client can open an SSE stream with a valid UUID. Auth belongs in Story 1.7+ when real orchestrator routes are wired. [`apps/server/src/routes/sse.ts:7-14`]
- **`buildSseFrame` interpolates `event.type` directly** — if a future `AgentEvent` variant's `type` field somehow contained a newline, SSE framing would break. Currently impossible due to TypeScript string-literal union; revisit if the union is widened to include runtime-derived strings. [`apps/server/src/events/emit.ts:21`]

## Deferred from: implementation of 1-6-sse-infrastructure-typed-event-emitters (2026-04-23)

- **Re-evaluate `fastify-sse-v2` migration** — Story 1.6 ships a purpose-built typed emitter over `reply.raw` instead of the `fastify-sse-v2` community plugin (the named `@fastify/sse-v2` package does not exist on npm). If `fastify-sse-v2` later adds first-class comment-frame support and an explicit Fastify 5 peer dep, revisit migrating. Rationale for this story's choice lives in 1-6's Dev Notes §"SSE plugin choice." [`apps/server/src/events/emit.ts`]
- **`Last-Event-ID` / stream resume not supported** — `createSseHandle` never sets the SSE `id:` field; reconnect is stateless. Story 5.5 owns the resume protocol. [`apps/server/src/events/emit.ts`]
- **`AbortController` not plumbed into `createSseHandle`** — `CreateSseHandleOptions` has `onAbort` callback only; no `abortController` passthrough for downstream cancellation. Story 1.7 (Claude orchestrator) adds the controller so `invoke(signal)` participates in cancellation. [`apps/server/src/events/emit.ts`]
- **No `onResponse` hook observability for hijacked replies** — Fastify's `onResponse` hook does not fire for streams because `reply.hijack()` bypasses the normal response lifecycle. Stream-tier observability lives in the `onAbort` log only. Any future middleware depending on `onResponse` for SSE routes must be adapted. [`apps/server/src/events/emit.ts`]
