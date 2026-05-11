# Story 1.2: Shared types package

Status: done

## Story

As Downe,
I want a `packages/shared` TypeScript package that owns the wire contract (REST envelopes, SSE event types, domain DTOs),
so that the web and server apps cannot drift on field names, casing, or shape.

## Acceptance Criteria

1. **AC1 — Package is workspace-consumable.** Given the monorepo is scaffolded, when I create `packages/shared` with its own `package.json`, `tsconfig.json`, and `src/index.ts`, then it builds as a workspace package consumable as `@bp/shared` from both `apps/web` and `apps/server` via pnpm workspace protocol, with strict TS enabled (`strict: true`, `noUncheckedIndexedAccess: true`).

2. **AC2 — Five typed source modules exist.** Given the package exists, when I inspect `src/`, then I find typed modules: `events.ts` (`AgentEvent` discriminated union covering the locked Phase 1 event vocabulary), `errors.ts` (`ErrorCode` union + `AppError` envelope shape + error response envelope), `http.ts` (success/error REST envelopes), `domain.ts` (`Project`, `ChatMessage`, `ToolCall`, `Citation`, `ConfidenceLevel`, `DecisionRecord`, `Checkpoint` skeletons plus any types named in Story 1.2 acceptance criteria), `ids.ts` (branded `ProjectId`, `SessionId`, `MessageId`, `CheckpointId`, `DecisionId` UUID types + `IsoUtcTimestamp` branded string alias), and `costs.ts` (cost event skeleton for Story 1.11). The `index.ts` barrel re-exports everything.

3. **AC3 — `AgentEvent` discriminated union is exhaustively narrowable.** Given a consumer imports `AgentEvent`, when they write a `switch` over `event.type`, then TypeScript narrows each branch exhaustively — a helper `assertNever(x: never)` exported from the package makes missing cases a compile-time error, not a runtime surprise.

4. **AC4 — All wire fields are `snake_case`, all timestamps are `IsoUtcTimestamp`.** Given the shared types define wire DTOs, when I audit any field name, then every field is `snake_case` and every timestamp is typed as `IsoUtcTimestamp` (a branded `string` alias). No `camelCase` field alias exists anywhere in `packages/shared`.

5. **AC5 — TypeScript project references cascade breaking changes.** Given either app depends on `@bp/shared`, when the shared package is edited to remove or rename an exported type, then running `pnpm typecheck` from the repo root immediately fails in both apps without needing to rebuild — project references (`composite: true` in shared + `references` in both app `tsconfig.json` files) enforce this automatically.

6. **AC6 — No runtime code in the package.** Given the zero-runtime-code rule, when I inspect every file in `packages/shared/src/`, then there are no function bodies, no class instances, no imports from Node.js or external packages — the only exception is the `assertNever` exhaustiveness helper (a single-line `throw`).

## Tasks / Subtasks

- [x] **Task 1: Create `src/ids.ts` — branded primitive types (AC: 1, 4, 6)**
  - [x] Define `Brand<T, B>` utility type: `type Brand<T, B> = T & { readonly __brand: B }`.
  - [x] Export branded types: `ProjectId`, `SessionId`, `MessageId`, `CheckpointId`, `DecisionId` — all `Brand<string, '<Name>'>`.
  - [x] Export `IsoUtcTimestamp = Brand<string, 'IsoUtcTimestamp'>` — every timestamp field in the package uses this type.
  - [x] Export `UuidV4 = Brand<string, 'UuidV4'>` — base type; the above ID types extend it conceptually (keep as separate brands for stronger safety).
  - [x] Zero runtime code — types only. No function bodies.

- [x] **Task 2: Create `src/events.ts` — `AgentEvent` discriminated union (AC: 2, 3, 6)**
  - [x] Define each event variant as its own `interface` with a `readonly type: '<name>'` literal discriminator.
  - [x] Use these **story-canonical** event type names (stories 1.6–1.10 depend on these exact strings):
    - `message.delta` — `{ message_id: MessageId; delta: string }`
    - `thinking.start` — `{ message_id: MessageId }`
    - `thinking.delta` — `{ message_id: MessageId; delta: string }`
    - `thinking.end` — `{ message_id: MessageId }`
    - `tool_call.start` — `{ tool_call_id: string; tool_name: string; input: unknown }`
    - `tool_call.end` — `{ tool_call_id: string; output: unknown; duration_ms: number; error?: string }`
    - `cost.update` — `{ session_cost_usd: number; project_cost_usd_cumulative: number }`
    - `context.update` — `{ used_tokens: number; max_tokens: number; pct_used: number }`
    - `error` — `{ code: ErrorCode; message: string; retryable: boolean }`
    - `done` — `{ message_id: MessageId; usage: { input_tokens: number; output_tokens: number } }`
    - Future-epic extension stubs (add now so union is complete): `subagent.started`, `subagent.event`, `subagent.completed`, `skeptic.challenge`, `stream.cancelled`
  - [x] Export `AgentEvent` as the union of all variants: `export type AgentEvent = MessageDeltaEvent | ThinkingStartEvent | ... `.
  - [x] Export `assertNever(x: never): never` exhaustiveness helper — one line: `throw new Error('Unhandled AgentEvent type: ' + (x as { type: string }).type)`.
  - [x] All `message_id`, `tool_call_id` fields use the appropriate branded type. All timestamp fields use `IsoUtcTimestamp`.
  - [x] **NOTE on architecture discrepancy:** Architecture §Pattern Categories lists `message.token`/`tool.started`/`tool.completed`/`response.complete` as the "locked" vocabulary, but every Epic 1 story (1.6, 1.7, 1.8, 1.10) uses `message.delta`/`tool_call.start`/`tool_call.end`/`done`. Use the story-canonical names — they are the implementation contract. Flag this discrepancy in the Architecture doc if time allows.

- [x] **Task 3: Create `src/errors.ts` — `ErrorCode` union + error shapes (AC: 2, 4, 6)**
  - [x] Export `ErrorCode` as a string-literal union covering all Phase 1 error codes:
    ```
    'upstream_claude' | 'rate_limited' | 'tavily_failure' | 'pinecone_write_failure' |
    'pinecone_read_failure' | 'wiki_write_failure' | 'tool_execution_error' |
    'invalid_input' | 'not_found' | 'internal'
    ```
  - [x] Export `ErrorEnvelope` interface: `{ error: { code: ErrorCode; message: string; retryable: boolean; details?: unknown } }`.
  - [x] Export `AppErrorShape` interface (the wire shape of thrown errors, not the class — the `AppError` class lives in `apps/server/src/errors/AppError.ts`): `{ code: ErrorCode; message: string; retryable: boolean; status: number }`.
  - [x] All snake_case field names. No runtime code.

- [x] **Task 4: Create `src/http.ts` — REST request/response envelopes (AC: 2, 4, 6)**
  - [x] Export `SuccessResponse<T>` — wraps a data payload. Per architecture §Format Patterns, non-streaming endpoints return the payload directly (not nested under a `data` key). Use a pass-through type alias: `type SuccessResponse<T> = T`.
  - [x] Export `ErrorResponse` — re-export `ErrorEnvelope` from `errors.ts` with an alias for convenience.
  - [x] Export `ApiError` interface: shorthand `{ code: ErrorCode; message: string; retryable: boolean }` (the `error` sub-object from the envelope).
  - [x] No runtime code.

- [x] **Task 5: Create `src/domain.ts` — domain DTO skeletons (AC: 2, 4, 6)**
  - [x] `Project`: `{ project_id: ProjectId; name: string; description: string; namespace: string; created_at: IsoUtcTimestamp; deleted_at?: IsoUtcTimestamp }`.
  - [x] `ChatMessage`: `{ message_id: MessageId; project_id: ProjectId; session_id: SessionId; role: 'user' | 'assistant'; content: string; created_at: IsoUtcTimestamp; status: 'streaming' | 'complete' | 'error' }`.
  - [x] `ToolCall`: `{ tool_call_id: string; tool_name: string; input: unknown; output?: unknown; status: 'pending' | 'running' | 'success' | 'error'; duration_ms?: number; started_at: IsoUtcTimestamp; ended_at?: IsoUtcTimestamp }`.
  - [x] `Citation`: `{ citation_id: string; source_url: string; excerpt: string; relevance_score?: number }`.
  - [x] `ConfidenceLevel`: `'high' | 'medium' | 'low' | 'unverified'`.
  - [x] `DecisionRecord`: `{ decision_id: DecisionId; project_id: ProjectId; content: string; evidence: string[]; confidence: ConfidenceLevel; created_at: IsoUtcTimestamp }`.
  - [x] `Checkpoint`: `{ checkpoint_id: CheckpointId; session_id: SessionId; project_id: ProjectId; summary: string; created_at: IsoUtcTimestamp }`.
  - [x] All fields `snake_case`. All timestamps `IsoUtcTimestamp`. All IDs use appropriate branded types. No runtime code.

- [x] **Task 6: Create `src/costs.ts` — cost event skeleton (AC: 2, 4, 6)**
  - [x] Export `CostProvider`: `'anthropic' | 'tavily' | 'pinecone' | 'voyage'`.
  - [x] Export `CostRecord` skeleton (Story 1.11 finalizes this): `{ project_id: ProjectId; session_id: SessionId; provider: CostProvider; model?: string; input_tokens?: number; output_tokens?: number; cost_usd: number; timestamp: IsoUtcTimestamp }`.
  - [x] **Architecture open-item note:** `CostBreakdown` shape (per-provider breakdown for tooltip) is deferred to Story 1.11. Add a `// TODO: Story 1.11 — add CostBreakdown with per-provider breakdown fields` comment inline only (the one exception to the no-comments rule since it is a deferred architectural item).

- [x] **Task 7: Update `src/index.ts` barrel (AC: 1, 2)**
  - [x] Replace the empty `export {};` (from Story 1.1) with named re-exports from every module:
    ```ts
    export * from './ids';
    export * from './events';
    export * from './errors';
    export * from './http';
    export * from './domain';
    export * from './costs';
    ```
  - [x] Verify no naming conflicts across modules. If any type name appears in two modules, re-export with explicit `as` aliases.

- [x] **Task 8: Configure TypeScript project references (AC: 5)**
  - [x] In `packages/shared/tsconfig.json`, add `"composite": true` and `"declarationDir": "dist"` (required by TS project references even though consumers import from source).
  - [x] In `apps/web/tsconfig.json`, add `"references": [{ "path": "../../packages/shared" }]`.
  - [x] In `apps/server/tsconfig.json`, add `"references": [{ "path": "../../packages/shared" }]`.
  - [x] Run `pnpm typecheck` from root — verify it completes cleanly across all three packages.
  - [x] Test cascade: temporarily remove a type from `src/index.ts`, run `pnpm typecheck`, confirm the web and/or server apps fail immediately. Revert.

- [x] **Task 9: Write unit test for exhaustiveness helper (AC: 3)**
  - [x] Create `packages/shared/src/events.test.ts`.
  - [x] Test 1: An object with all known `AgentEvent` type strings successfully narrows in a switch (compile-time proof via TypeScript strict build — no runtime assertion needed here).
  - [x] Test 2: Verify `assertNever` throws at runtime with an informative message when given an unknown type (cover the JS-consuming client edge case).
  - [x] Keep tests minimal — package has zero runtime code except `assertNever`; test only that function.

- [x] **Task 10: Verify full AC coverage (AC: 1–6)**
  - [x] `pnpm --filter @bp/shared typecheck` exits 0.
  - [x] `pnpm --filter @bp/web typecheck` exits 0 after importing `AgentEvent`, `Project`, `ErrorCode` in a test import file.
  - [x] `pnpm --filter @bp/server typecheck` exits 0 after same.
  - [x] `pnpm --filter @bp/shared test` exits 0 (events.test.ts passes).
  - [x] `pnpm lint` exits 0 across workspace.
  - [x] Manually audit 5 random fields across the package for `snake_case` compliance.
  - [x] Confirm `packages/shared/src/` has zero Node.js or npm imports (grep for `import ... from` — should find nothing except relative `./` paths).

## Dev Notes

### Starting state from Story 1.1

`packages/shared` is already scaffolded with:
- `packages/shared/package.json` — `name: "@bp/shared"`, `private: true`, `type: "module"`, `main: "./src/index.ts"`, `types: "./src/index.ts"`, `exports` field pointing to `src/index.ts`.
- `packages/shared/tsconfig.json` — extends `../../tsconfig.base.json`. **Does NOT yet have `composite: true`** — Task 8 adds this.
- `packages/shared/src/index.ts` — currently `export {};`. Task 7 replaces this.
- Both `apps/web/package.json` and `apps/server/package.json` already list `"@bp/shared": "workspace:*"` — no install needed.

**Do not re-create or reinstall any of the above.** Start from Task 1 (new type files).

### File naming: architecture vs. epics — use architecture names

The epics file (Story 1.2 AC) names the modules as `http.ts`, `sse.ts`, `domain.ts`, `ids.ts`. The architecture document is the authoritative source and names them differently:

| Epics AC says | Architecture says | Use |
|---|---|---|
| `sse.ts` | `events.ts` | `events.ts` ✅ |
| `http.ts` (includes ErrorCode) | `http.ts` (envelopes only) + `errors.ts` (ErrorCode) | split into both ✅ |
| `ids.ts` | not listed | include it — IDs are a clear domain concern ✅ |
| (not mentioned) | `costs.ts` | include it per architecture ✅ |

### Event name discrepancy — use story-canonical names

Architecture §Naming Patterns lists "Locked Phase 1 vocabulary": `message.token`, `tool.started`, `tool.completed`, `response.complete`.

But every Epic 1 story that references specific event names uses a different vocabulary:

| Architecture says | Stories use | Where |
|---|---|---|
| `message.token` | `message.delta` | Stories 1.6, 1.7, 1.8 |
| `tool.started` | `tool_call.start` | Stories 1.6, 1.10 |
| `tool.completed` | `tool_call.end` | Stories 1.6, 1.10 |
| `response.complete` | `done` | Story 1.7 |

**Use the story names** — they are what Stories 1.6–1.10 emit and consume. The architecture vocabulary is aspirational and predates the story detail. Note: `subagent.*` and `skeptic.challenge` keep the architecture dot-separated format since no story has specified them yet.

### TypeScript exhaustive narrowing — the `never` pattern

The correct implementation for compile-time exhaustiveness checking:

```ts
// In events.ts
export function assertNever(x: never): never {
  throw new Error('Unhandled AgentEvent type: ' + (x as { type: string }).type);
}

// Consumer usage
function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case 'message.delta': /* handle */ break;
    case 'thinking.start': /* handle */ break;
    // ... all cases ...
    default: assertNever(event); // TS error if any case is missing
  }
}
```

Missing a case → TypeScript error: `Argument of type 'UnhandledEventType' is not assignable to parameter of type 'never'`. This is the compile-time gate AC3 requires.

### Branded types — the pattern

```ts
// In ids.ts
type Brand<T, B> = T & { readonly __brand: B };
export type ProjectId = Brand<string, 'ProjectId'>;
export type IsoUtcTimestamp = Brand<string, 'IsoUtcTimestamp'>;
```

**Never** create `as ProjectId` casts in `packages/shared` itself — the package is types-only. The casts belong in server-side factory functions (Story 1.3+ creates actual IDs). Do not pre-create factory helpers here.

### TypeScript project references

Story 1.1 wired workspace dependencies but NOT TypeScript project references. Task 8 must configure them. The minimal change:

```json
// packages/shared/tsconfig.json — add:
{ "compilerOptions": { "composite": true, "declarationDir": "dist" } }

// apps/web/tsconfig.json — add:
{ "references": [{ "path": "../../packages/shared" }] }

// apps/server/tsconfig.json — add:
{ "references": [{ "path": "../../packages/shared" }] }
```

With `composite: true`, TypeScript tracks the shared package as a "build" unit. `pnpm typecheck` (which runs `tsc --noEmit` in each workspace) then resolves shared types via the reference graph rather than raw `node_modules` resolution — meaning a type deletion in shared breaks both apps in a single `pnpm typecheck` run.

**Potential conflict:** Story 1.1 deviation note #8 says `apps/web`'s build script uses `tsc -b && vite build` (project-references style). The `tsc -b` flag already triggers reference resolution for the build — adding `references` to the tsconfig makes this consistent.

### Zero runtime code constraint

`packages/shared` must contain **no imports from external packages** and **no runtime behaviour** except the `assertNever` helper. This is structurally enforced by the package having no `dependencies` in its `package.json` (only `devDependencies` for TypeScript itself). Do not add any `import` statement pointing to an npm package. Violating this would couple every consumer to that package.

### pnpm version

Story 1.1 installed pnpm **10.33.0** (not the 9.x the architecture references). Root `package.json` has `packageManager: "pnpm@10.33.0"`. Use pnpm 10 commands throughout — behaviour is identical for this story.

### ESLint pre-existing rules to be aware of

Story 1.1 Task 6 added a `no-restricted-syntax` rule that flags `throw new Error(` in `apps/server/src/`. The `assertNever` function in `packages/shared/src/events.ts` uses `throw new Error(...)` but is in `packages/shared/src/` not `apps/server/src/` — the rule does not fire there. No ESLint changes needed for this story.

### What this story does NOT do (boundaries)

- **No `AppError` class** — that is `apps/server/src/errors/AppError.ts` and belongs to Story 1.3.
- **No SSE emitter** — that is `apps/server/src/events/` and belongs to Story 1.6.
- **No Zod schemas** — types only; no validation runtime. Zod lives in `apps/server/src/config/env.ts` (Story 1.3).
- **No frontend components** — `@bp/shared` is a pure TS types package; no React or browser code.
- **No factory/constructor helpers** — no `createProjectId()`, no `now()` for timestamps. Consumers cast with `as ProjectId` etc. at their own boundary.
- **`CostBreakdown` fully defined** — Story 1.11 finalizes the per-provider breakdown shape; leave it as the TODO comment stub.

### Project Structure Notes

All new files are within `packages/shared/src/`:

| File | New / Modified |
|---|---|
| `packages/shared/src/ids.ts` | New |
| `packages/shared/src/events.ts` | New |
| `packages/shared/src/errors.ts` | New |
| `packages/shared/src/http.ts` | New |
| `packages/shared/src/domain.ts` | New |
| `packages/shared/src/costs.ts` | New |
| `packages/shared/src/events.test.ts` | New |
| `packages/shared/src/index.ts` | Modified (was `export {};`) |
| `packages/shared/tsconfig.json` | Modified (add `composite`, `declarationDir`) |
| `apps/web/tsconfig.json` | Modified (add `references`) |
| `apps/server/tsconfig.json` | Modified (add `references`) |

No other files are touched. No new npm packages are required — this story adds zero external dependencies.

### References

- [epics.md §Story 1.2: Shared types package](../planning-artifacts/epics.md) — source of all 5 acceptance criteria.
- [architecture.md §Shared package layout](../planning-artifacts/architecture.md) — authoritative file names (`events.ts`, `errors.ts`, `http.ts`, `domain.ts`, `costs.ts`).
- [architecture.md §Naming Patterns — Event naming](../planning-artifacts/architecture.md) — Phase 1 event vocabulary (note: use story-canonical names per Task 2 guidance above).
- [architecture.md §Format Patterns](../planning-artifacts/architecture.md) — `snake_case` wire fields, `IsoUtcTimestamp`, UUID v4 IDs server-generated.
- [architecture.md §Enforcement Guidelines](../planning-artifacts/architecture.md) — "Add any new event type, error code, or domain shape to `packages/shared` first."
- [architecture.md §Open Items — CostBreakdown](../planning-artifacts/architecture.md) — "finalize fields in the first cost-meter story" (Story 1.11).
- [1-1-monorepo-scaffold-dev-loop.md §Completion Notes](./1-1-monorepo-scaffold-dev-loop.md) — pnpm 10, package.json layout, existing tsconfig structure.
- [architecture.md §First implementation priority](../planning-artifacts/architecture.md) — "populate `packages/shared` with the `AgentEvent` / `ErrorCode` / domain type unions. All subsequent stories depend on this baseline."

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Initial cross-package typecheck with composite refs surfaced TS6305 ("Output file ... has not been built from source file"). Resolved by setting shared's `typecheck` script to `tsc --build` so declarations are emitted into `packages/shared/dist/` before dependent apps typecheck. `pnpm -r run typecheck` now runs in topological order and cascades breaking changes through references as required by AC5.
- Verified AC5 cascade by temporarily removing `export * from './errors'` in `packages/shared/src/index.ts`: `pnpm typecheck` failed in both apps (web + server) with `TS2305: Module '"@bp/shared"' has no exported member 'ErrorCode'`. Restored the export before completion.

### Completion Notes List

- All 6 acceptance criteria satisfied; 10 tasks and all subtasks checked.
- `packages/shared` now exports 7 modules (`ids`, `events`, `errors`, `http`, `domain`, `costs`, barrel `index`) plus the `events.test.ts` unit test.
- `events.ts` uses **story-canonical** event names (`message.delta`, `tool_call.start`, `tool_call.end`, `done`) — per Task 2 note, flagged as divergent from architecture's "locked vocabulary" (`message.token`, `tool.started`, etc.). Followed the story directive; the architecture doc still needs a sync pass (flagged here for a later doc-sync task, not in scope for Story 1.2).
- `assertNever` is the sole runtime export (one-line throw) — complies with AC6.
- Added `composite: true`, `declaration: true`, `declarationDir: "dist"`, `emitDeclarationOnly: true` to `packages/shared/tsconfig.json`. Removed the prior `noEmit: true` (incompatible with composite).
- Added `references: [{ path: "../../packages/shared" }]` to both `apps/web/tsconfig.json` and `apps/server/tsconfig.json`.
- Added `vitest` as a `devDependencies` entry in `packages/shared/package.json` to satisfy Task 9 (mirrors apps/web and apps/server). Does not alter runtime API surface — no new **runtime** dependencies.
- Added `*.tsbuildinfo` to `.gitignore` so `tsc --build`'s bookkeeping file is not committed.
- Cross-package import validated via a temporary smoke file (`apps/{web,server}/src/_shared-types-smoke.ts`) importing `AgentEvent`, `Project`, `ErrorCode`. Typecheck passed; smoke files removed before completion.
- Full verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` all green across the workspace. Shared test suite passes 2/2.

### Change Log

| Date | Change |
|---|---|
| 2026-04-23 | Story 1.2 implemented: added `packages/shared` type modules (ids, events, errors, http, domain, costs), barrel export, `assertNever` exhaustiveness helper, project-reference wiring across apps/web + apps/server, first unit test. |

### File List

**New files**
- `packages/shared/src/ids.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/errors.ts`
- `packages/shared/src/http.ts`
- `packages/shared/src/domain.ts`
- `packages/shared/src/costs.ts`
- `packages/shared/src/events.test.ts`
- `packages/shared/vitest.config.ts`

**Modified files**
- `packages/shared/src/index.ts` — replaced `export {};` with barrel re-exports.
- `packages/shared/package.json` — `typecheck` + `build` now `tsc --build`; `test` now `vitest run`; added `typescript` + `vitest` to `devDependencies`.
- `packages/shared/tsconfig.json` — added `composite`, `declaration`, `declarationDir: "dist"`, `emitDeclarationOnly`; removed `noEmit`.
- `apps/web/tsconfig.json` — added `references: [{ path: "../../packages/shared" }]`.
- `apps/server/tsconfig.json` — added `references: [{ path: "../../packages/shared" }]`.
- `.gitignore` — added `*.tsbuildinfo`.
- `pnpm-lock.yaml` — regenerated after adding `vitest` to `packages/shared`.

### Review Findings

- [x] [Review][Decision] `ToolCallEndEvent` / `SubagentCompletedEvent` — `output` (required) and `error` (optional) can coexist simultaneously; no mutual-exclusion constraint. A "failed" end is structurally indistinguishable from a "success with an error annotation." Stories 1.6 and 1.10 consume these shapes — should they become discriminated variants (`{ status: 'success'; output: unknown } | { status: 'error'; error: string }`) before downstream stories lock in? [`packages/shared/src/events.ts` — `ToolCallEndEvent`, `SubagentCompletedEvent`]

- [x] [Review][Patch] `events.test.ts` `seen.size` assertion is weak for new union members — if a type is added to `AgentEvent` but not to the `events[]` array, `seen.size` still equals the old length and the test stays green. Replace `toBe(events.length)` with a literal count or enumerate expected type strings explicitly. [`packages/shared/src/events.test.ts`]

- [x] [Review][Defer] `tsc --build` for typecheck may skip re-check on warm cache — deliberate tradeoff to resolve TS6305; warm CI cache could return green without rechecking. [`packages/shared/package.json`] — deferred, pre-existing
- [x] [Review][Defer] Event interfaces only mark `type` as `readonly`; all data fields are mutable — `event.delta = 'tampered'` is valid at the type level. Inconsistent if immutability is intent. [`packages/shared/src/events.ts`] — deferred, pre-existing
- [x] [Review][Defer] `ChatMessage.status: 'error'` carries no error payload — consumers cannot surface error reason through the domain type. [`packages/shared/src/domain.ts`] — deferred, pre-existing
- [x] [Review][Defer] `CostRecord` has no unique identifier — deduplication, upsert, and idempotent billing are impossible at the type level. Story 1.11 scope. [`packages/shared/src/costs.ts`] — deferred, pre-existing
- [x] [Review][Defer] Missing `outDir` in `packages/shared/tsconfig.json` — low risk now (`emitDeclarationOnly: true`), but removing that flag would write `.js` files next to `.ts` sources. [`packages/shared/tsconfig.json`] — deferred, pre-existing
- [x] [Review][Defer] `typescript` in per-package `devDependencies` rather than root — composite build version skew risk in larger monorepos. [`packages/shared/package.json`] — deferred, pre-existing
- [x] [Review][Defer] `ContextUpdateEvent.pct_used` is independent of `used_tokens`/`max_tokens` — server emits three fields with no enforced derivation relationship. [`packages/shared/src/events.ts`] — deferred, pre-existing
- [x] [Review][Defer] `ToolCall.duration_ms` is optional but `ToolCallEndEvent.duration_ms` is required — event guarantees the value exists; domain type allows it to be dropped during persistence mapping. [`packages/shared/src/domain.ts` vs `events.ts`] — deferred, pre-existing
- [x] [Review][Defer] `DecisionRecord.evidence` allows empty array — `{ confidence: 'high', evidence: [] }` is structurally valid. [`packages/shared/src/domain.ts`] — deferred, pre-existing
- [x] [Review][Defer] `IsoUtcTimestamp` and all branded ID types have no runtime enforcement — any `as BrandedType` cast bypasses format/validity checks. [`packages/shared/src/ids.ts`] — deferred, known branded-type limitation
- [x] [Review][Defer] Type-layer validation gaps (negative costs, zero max_tokens, empty ChatMessage.content, unvalidated Project.namespace) — these belong at the server validation boundary (Story 1.3 Zod schemas), not in the types-only package. [`packages/shared/src/events.ts`, `domain.ts`, `costs.ts`] — deferred, pre-existing
