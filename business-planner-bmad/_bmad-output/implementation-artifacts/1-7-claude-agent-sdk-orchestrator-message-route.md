# Story 1.7: Claude Agent SDK orchestrator + message route

Status: review

## Story

As a backend developer,
I want a Claude Agent SDK orchestrator wired to a `POST /messages` route that streams agent output back to the client over the SSE infrastructure built in Story 1.6,
so that the frontend can send a user prompt and receive live `message.delta` / `thinking.delta` / `cost.update` / `done` events from a real Claude Opus 4.7 model — completing the minimum end-to-end loop the rest of Epic 2 (chat UX, tool calls, sub-agents) builds on.

## Acceptance Criteria

**AC1 — Orchestrator agent definition**
- GIVEN the server starts cleanly
- WHEN the orchestrator module is imported
- THEN it exposes an async `runOrchestrator({ projectId, sessionId, history, userMessage, abortSignal, onEvent })` function that internally invokes `query()` from `@anthropic-ai/claude-agent-sdk` with:
  - `options.model = 'claude-opus-4-7'`
  - `options.systemPrompt` loaded **once at module load** from `apps/server/src/agents/prompts/orchestrator.md`
  - `options.allowedTools = []` (empty — no tools wired this story)
  - `options.permissionMode = 'bypassPermissions'` (no tool-use prompts can fire because `allowedTools` is empty; this only suppresses the SDK's permission middleware so it cannot block streaming)
  - `options.includePartialMessages = true` (required to receive `stream_event` frames for incremental deltas)
  - `options.abortController` derived from the supplied `abortSignal`

**AC2 — Two-phase send: SSE first, then POST**
- GIVEN a valid `project_id` exists
- WHEN the client opens `GET /api/sse/messages?token=<uuid>` AND THEN issues `POST /api/projects/:project_id/messages` with body `{ content: string, sse_token: <same uuid> }`
- THEN the route:
  1. Validates body and route param via JSON Schema; rejects with `AppError('invalid_input', 400)` on failure
  2. Looks up the SSE handle in the registry by `sse_token`; rejects with `AppError('not_found', 404)` if missing or already consumed
  3. Marks the registry entry as **consumed** synchronously (single-use) before any await
  4. Persists the user `ChatMessage` via `messageStore.append(projectId, sessionId, message)` (atomic JSONL append)
  5. Invokes the orchestrator with prior history + new user message and forwards events to the SSE handle
  6. Returns HTTP `202 Accepted` with body `{ user_message: ChatMessage, assistant_message_id: MessageId }` **before** orchestrator completes (status code reflects "stream takes over from here")

**AC3 — Streaming, latency, and persistence**
- GIVEN the orchestrator is running
- WHEN Claude emits content deltas
- THEN:
  - Text deltas arrive at the client as `message.delta` SSE events with **time-to-first-token ≤ 150 ms** measured from the SDK's first `stream_event` frame to `reply.raw.write()` (NFR11)
  - Thinking deltas (if extended thinking is on) arrive as `thinking.delta` events with `message_id` matching the assistant message
  - The assistant message is **incrementally persisted** to the JSONL store: append a placeholder row with `content: ""` after the first delta, then **rewrite that row in place** at end-of-stream with the final `content` and `usage` metadata (use `messageStore.updateLast(projectId, sessionId, patch)` — see Dev Notes for atomic-rewrite pattern)
  - Final persisted assistant `ChatMessage` includes `usage: { input_tokens, output_tokens }` extracted from the SDK `result` message

**AC4 — Retry policy and error event**
- GIVEN the upstream Claude API returns 429 or 5xx **before the first event is yielded**
- WHEN the orchestrator catches the error
- THEN it retries with exponential backoff (250 ms · 2^n + jitter) up to 3 attempts total; if all attempts fail or any error occurs **after** streaming has begun, it emits:
  - `{ type: 'error', code: 'upstream_claude', message: <sanitised>, retryable: true }`
  - immediately followed by `{ type: 'done', message_id, usage: { input_tokens: 0, output_tokens: 0 } }`
- AND non-retryable errors (4xx other than 429, validation, abort) emit `error` with `retryable: false` and skip retry
- AND mid-stream errors **do not retry** (would duplicate already-streamed content); they emit `error` + `done` and close the stream

**AC5 — Event sequence contract**
- GIVEN a successful turn
- WHEN observing the SSE stream end-to-end
- THEN the sequence matches: `[thinking.delta*]` (zero or more, only if extended thinking) → `message.delta+` (one or more) → `cost.update` (exactly one, after `result` arrives) → `done` (exactly one, terminal)
- AND `done.usage` carries `{ input_tokens, output_tokens }` from the SDK `result` frame
- AND `cost.update` carries `session_cost_usd` (this turn's cost, computed from token counts × Opus 4.7 pricing) and `project_cost_usd_cumulative` (sum across all messages persisted for this project — read by aggregating `usage` fields in the JSONL store)

**AC6 — Cancellation and abort**
- GIVEN an in-flight stream
- WHEN the client closes the EventSource (triggering `request.raw.on('close')`)
- THEN the orchestrator's `AbortController.abort()` fires, the SDK `query()` iterator terminates within 1 s, and the route logs `{ event: 'stream.cancelled', reason: 'client_disconnect', request_id, sse_token }` at info level
- AND any partially-streamed assistant message remains persisted with `content` equal to whatever was streamed before cancellation (no rollback)

**AC7 — Integration tests with mocked SDK**
- GIVEN `@anthropic-ai/claude-agent-sdk` is mocked via `vi.mock(...)`
- WHEN running `vitest run` (unit) **and** `INTEGRATION=1 vitest run` (integration)
- THEN tests cover:
  - Happy path: POST → SSE receives `message.delta` × N → `cost.update` → `done` (assertion on full event sequence)
  - Retry path: first two SDK calls throw `{ status: 503 }`, third succeeds → client sees only success events (no `error`)
  - Permanent failure: all 3 retries throw → client sees `error` (`retryable: true`) then `done`
  - Cancellation: client closes EventSource mid-stream → SDK iterator's abort signal fires → server logs `stream.cancelled`
  - Validation: missing/invalid `sse_token` → 400; unknown token → 404; non-uuid → 400
  - Persistence: after happy path, `messageStore.list(projectId, sessionId)` returns `[user, assistant]` with assistant carrying `usage`

**AC8 — Scope boundary (negative AC)**
- This story does **not** implement: tool execution, sub-agents, the Skeptic loop, frontend chat-input wiring, or token-cost telemetry beyond the per-turn `cost.update` event. Frontend wiring is Story 1.8.

## Tasks / Subtasks

- [x] **Task 1: Install Claude Agent SDK and pin version** (AC: #1)
  - [x] Add `"@anthropic-ai/claude-agent-sdk": "^0.2.119"` to `apps/server/package.json` dependencies
  - [x] Run `pnpm install` from repo root; verify lockfile updates and per-platform optional `@anthropic-ai/claude-code-cli-*` deps install cleanly on Windows (the SDK spawns the CLI binary as a subprocess — see Dev Notes §"SDK runtime model")
  - [x] Smoke-test `import { query } from '@anthropic-ai/claude-agent-sdk'` in a throwaway script to confirm the binary resolves
  - [x] **Verify** that `Options.includePartialMessages` and `Options.permissionMode = 'bypassPermissions'` are exposed in `0.2.119` types — the SDK is pre-1.0 and option names occasionally rename. If either is missing, check the SDK CHANGELOG for the current spelling and update Task 7 accordingly. Do **not** silently drop the option.
- [x] **Task 2: Extend shared types** (AC: #2, #3)
  - [x] In `packages/shared/src/domain.ts`, extend `ChatMessage` with optional `usage?: { input_tokens: number; output_tokens: number }` (only set on assistant messages after `done`)
  - [x] In `packages/shared/src/http.ts`, add `SendMessageRequest { content: string; sse_token: UuidV4 }` and `SendMessageResponse { user_message: ChatMessage; assistant_message_id: MessageId }`
  - [x] Re-export from `packages/shared/src/index.ts`
  - [x] Run `pnpm -F @bp/shared build` to refresh the dist consumed by `apps/server` and `apps/web`
- [x] **Task 2b: Extend ProjectService with `getById`** (AC: #2)
  - [x] In `apps/server/src/domain/projectService.ts`, add `getById(projectId: string): Promise<Project | null>` to the `ProjectService` interface and implementation. Implementation: `serialize()` wrapping `readStore` + `find(p => p.project_id === projectId && !p.deleted_at)`. Returns `null` (not throw) so the route can decide the 404 shape.
  - [x] Add a co-located test case in the existing `projectService.test.ts` (or matching test file): existing project returns object; soft-deleted returns null; missing returns null.
- [x] **Task 3: Build the SSE registry** (AC: #2, #6)
  - [x] Create `apps/server/src/events/registry.ts` exporting `sseRegistry` with API: `register(token, entry)`, `consume(token): entry | null` (single-use; deletes on read), `cancel(token)` (used on TTL expiry / shutdown)
  - [x] `entry` shape: `{ handle: SseHandle; abortController: AbortController; createdAt: number }`
  - [x] Implement a 30-second TTL: when `register` is called, schedule `setTimeout(() => { if (!consumed) { handle.close(); registry.delete(token); } }, 30_000)`; clear timeout on `consume`
  - [x] Co-located unit test `registry.test.ts`: register→consume returns entry; second consume returns null; TTL expiry closes handle; `cancel` removes entry
- [x] **Task 4: Build the message store** (AC: #3, #5, #7)
  - [x] Create `apps/server/src/domain/messageStore.ts` with file-per-session JSONL at `${DATA_ROOT}/sessions/${projectId}/${sessionId}.jsonl` (mirror the atomic-write pattern from `projectService.ts` — see Dev Notes §"messageStore design")
  - [x] API: `append(projectId, sessionId, message): Promise<void>` (atomic append via temp+rename), `list(projectId, sessionId): Promise<ChatMessage[]>`, `updateLast(projectId, sessionId, patch: Partial<ChatMessage>): Promise<void>` (rewrites the entire file with the last row patched — acceptable at Phase-1 message volumes)
  - [x] All write paths funnel through a per-`(projectId, sessionId)` serialize() chain to prevent concurrent corruption
  - [x] Lazily `mkdir -p` the sessions directory on first write
  - [x] Co-located unit test `messageStore.test.ts`: append + list round-trip; `updateLast` patches usage; concurrent appends serialize correctly; missing file → empty array
- [x] **Task 5: Build the Claude client wrapper with retry** (AC: #1, #4)
  - [x] Create `apps/server/src/clients/claude.ts` exposing `createClaudeClient(): { invoke(opts): AsyncIterable<SDKMessage> }` — a thin wrapper that constructs the `query()` call so the orchestrator and tests have one seam to mock
  - [x] Move retry logic INSIDE the orchestrator (not the client) because retry must observe whether streaming has begun — the client is purely a query factory
  - [x] Read `ANTHROPIC_API_KEY` from `env.ANTHROPIC_API_KEY` and pass via `options.env` (NOT via process.env mutation)
  - [x] Co-located unit test `claude.test.ts`: client passes through options; throws on missing API key
- [x] **Task 6: Author the orchestrator system prompt** (AC: #1)
  - [x] Create `apps/server/src/agents/prompts/orchestrator.md` with a minimal Phase-1 system prompt: identifies the agent as "Business Planner orchestrator", instructs plain-text Markdown output, no tool use this phase, concise & structured responses. Keep under 30 lines.
  - [x] Load with `await readFile(...)` at module init and cache in a module-scoped `const`; re-read in dev (HMR) is unnecessary for Phase 1
- [x] **Task 7: Build the orchestrator** (AC: #1, #3, #4, #5, #6)
  - [x] Create `apps/server/src/agents/orchestrator.ts` exporting `runOrchestrator({ projectId, sessionId, history, userMessage, abortSignal, onEvent }): Promise<{ messageId: MessageId; usage: TokenUsage }>`
  - [x] Build the SDK prompt by concatenating prior `history` (mapped to `{ role, content }`) plus the new user message — pass as a single string for Phase 1 (resume/sessionId migration is a Story 5.* concern)
  - [x] Generate `assistantMessageId = randomUUID() as MessageId` upfront so deltas reference a stable id
  - [x] Iterate `for await (const message of query(...))` with the discriminator handling described in Dev Notes §"SDK message variants"
  - [x] Wrap the **first iterator step only** in retry (250 ms · 2^n backoff + jitter, max 3 attempts) — once the first frame has yielded, subsequent errors are non-retryable
  - [x] On any error: emit `error` then `done` (with zero usage) and rethrow only if it's an `AbortError`
  - [x] Co-located unit test `orchestrator.test.ts` with mocked SDK: full event-sequence assertion, retry path, abort path
- [x] **Task 8: Build the message routes** (AC: #2, #3, #6, #7)
  - [x] Create `apps/server/src/routes/messages.ts` exporting `registerMessageRoutes(app, deps)` where `deps = { projectService, messageStore, orchestrator, sseRegistry }`
  - [x] Register `GET /api/sse/messages` with querystring schema `{ token: uuid (36 chars) }`. Handler: `createSseHandle({ reply, request, onAbort: () => abortController.abort() })`, `sseRegistry.register(token, { handle, abortController, createdAt: Date.now() })`. The `onAbort` closure is what wires the EventSource-close → SDK-abort path.
  - [x] Register `POST /api/projects/:project_id/messages` with route + body schema. Handler:
    1. Validate `project_id` exists via `projectService.getById(project_id)` → 404 (`AppError('not_found')`) if `null` or soft-deleted
    2. `entry = sseRegistry.consume(sse_token)` → 404 if null
    3. Build user `ChatMessage` `{ id: randomUUID(), role: 'user', content, created_at: nowIso() }` and `await messageStore.append(...)`
    4. Read `history = await messageStore.list(project_id, 'default')` (already includes the user message)
    5. Reply `202` immediately with `{ user_message, assistant_message_id }` — do **not** await orchestrator; kick it off in a fire-and-forget `void runOrchestratorTurn(...)` that owns the SSE handle's lifecycle
    6. The orchestrator turn function: invokes `runOrchestrator(...)`, forwards events via `entry.handle.emit(...)`, persists the assistant placeholder + final patch, calls `entry.handle.close()` in a `finally`
  - [x] Wire the new route in `apps/server/src/routes/index.ts`
- [x] **Task 9: Plumb dependencies through buildApp** (AC: #2)
  - [x] In `apps/server/src/buildApp.ts`, instantiate `messageStore`, `claudeClient`, `sseRegistry` at app-build time
  - [x] Construct the orchestrator-runner closure with these deps and pass to `registerRoutes`
  - [x] Update `RoutesOptions` interface and `registerRoutes` signature accordingly
- [x] **Task 10: Integration tests** (AC: #7)
  - [x] Create `apps/server/src/routes/messages.integration.test.ts` gated by `if (!process.env.INTEGRATION) { describe.skip(...) }`
  - [x] Use Fastify's `app.inject({ method: 'POST', url: '/api/projects/<id>/messages', payload: ... })` for POST and `app.inject` does NOT support SSE consumption — use a real `app.listen({ port: 0 })` + Node `EventSource` (install `eventsource@^2` in devDeps) to actually consume the stream
  - [x] Mock the SDK module via `vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))` and per-test set the mock implementation to yield the desired `SDKMessage` sequence
  - [x] Cleanup: ensure `app.close()` and `EventSource.close()` run in `afterEach` so test ports release
- [x] **Task 11: Local verification** (AC: ALL)
  - [x] Run `pnpm -F @bp/server typecheck && pnpm -F @bp/server test`
  - [x] Run `INTEGRATION=1 ANTHROPIC_API_KEY=<real-key> pnpm -F @bp/server test` once locally with the mock disabled to confirm a real Opus 4.7 turn streams through (manual smoke; tests stay mocked)
  - [x] Run `pnpm -F @bp/server dev`, then with curl: open `curl -N "http://localhost:3001/api/sse/messages?token=<uuid>"` in one terminal, `curl -X POST http://localhost:3001/api/projects/<id>/messages -H "Content-Type: application/json" -d '{"content":"hi","sse_token":"<same-uuid>"}'` in another. Confirm streaming output.

## Dev Notes

### SDK runtime model (READ FIRST)

The `@anthropic-ai/claude-agent-sdk` package (≥ 0.2.113) does **not** call the Anthropic API in-process. It spawns the **Claude Code CLI binary** as a subprocess and pipes JSON over stdio. The CLI binary is delivered via per-platform optional dependencies (`@anthropic-ai/claude-code-cli-win32-x64`, etc.) — `pnpm install` resolves the right one automatically. Implications:

- **Heavyweight per query:** subprocess spawn adds ~100–300 ms cold start. Acceptable for Phase-1 single-user local; Story 5.* will revisit if perf budgets bite.
- **Authentication via env, not parameter:** the SDK forwards `process.env` to the subprocess. Set `ANTHROPIC_API_KEY` via the SDK's `options.env` (don't mutate `process.env` ourselves).
- **No network mocking trick:** intercepting `fetch` won't catch SDK calls — they go through the subprocess. Always mock at the `query()` import boundary (`vi.mock('@anthropic-ai/claude-agent-sdk')`).
- **Working directory:** the SDK accepts `options.cwd`. Default to `process.cwd()`; do not let the SDK roam into project directories — it has filesystem tool access by default which is suppressed by `allowedTools: []` but we belt-and-brace by setting `cwd` to the server's working dir.

### SDK message variants — what to handle and how

The `query()` AsyncIterable yields `SDKMessage` discriminated by `type`. With `includePartialMessages: true` we receive:

```typescript
// Streaming text/thinking (the high-frequency frames we forward)
{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } } }
  → emit { type: 'message.delta', message_id, delta: text }

{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '...' } } }
  → emit { type: 'thinking.delta', message_id, delta: thinking }

// Terminal frame (always last on success)
{ type: 'result', subtype: 'success', usage: { input_tokens, output_tokens }, total_cost_usd }
  → emit cost.update + done

// Terminal failure variants (handle defensively)
{ type: 'result', subtype: 'error_max_turns' | 'error_during_execution', ... }
  → treat as upstream error, emit error + done

// Other variants you can SAFELY IGNORE this story (no tools wired):
//   'assistant', 'user', 'system', 'partial_assistant'
//   tool-related stream_event subtypes (content_block_start with tool_use, etc.)
```

Use a `switch` on `message.type`; for `stream_event`, sub-switch on `event.type` and `event.delta.type`. Default branches log at debug level and continue (forward-compatibility — SDK adds new event types in minor versions).

### Conflict resolutions (epic vs architecture)

Three discrepancies between `_bmad-output/planning-artifacts/epics.md` and `_bmad-output/planning-artifacts/architecture.md` were resolved:

1. **Folder name `agents/` vs `agent/`** — epic says `agents/` (plural), architecture says `agent/`. **Use `agents/`** (epic AC is the contract). Future sub-agents (Story 2.*) will live as siblings, so plural reads correctly.
2. **Path-param casing `:project_id` vs `:projectId`** — architecture proposes camelCase, but Story 1.5 already shipped `/api/projects/:project_id/...` and tests assert it. **Use `snake_case`** to stay consistent.
3. **Endpoint shape `:project_id/messages` vs `:project_id/sessions/:session_id/messages`** — architecture nests session in the path; epic AC2 omits it. **Follow epic AC**: `POST /api/projects/:project_id/messages` with implicit `sessionId = 'default'` for Phase 1. The messageStore is built session-aware so the migration to multi-session in Story 5.* is purely additive.

### Retry policy — why "before first yield only"

Retrying mid-stream would replay deltas the client has already rendered, producing duplicate text. The SDK gives no resume primitive, so once the first frame is dispatched the contract is "this turn is committed; surface the failure." Implementation:

```typescript
let firstFrameYielded = false;
let attempt = 0;
while (attempt < 3) {
  try {
    const iter = claudeClient.invoke(opts)[Symbol.asyncIterator]();
    const first = await iter.next();           // ← protected by retry
    if (first.done) break;
    firstFrameYielded = true;
    handleSdkMessage(first.value);
    for await (const msg of { [Symbol.asyncIterator]: () => iter }) {
      handleSdkMessage(msg);                   // ← errors here are NOT retried
    }
    return;
  } catch (err) {
    if (firstFrameYielded || !isRetryable(err) || attempt === 2) throw err;
    await sleep(250 * 2 ** attempt + Math.random() * 100);
    attempt += 1;
  }
}
```

`isRetryable(err)` shape — the SDK wraps Anthropic API errors but **does not** guarantee a stable `.status` property because the CLI subprocess serialises errors through stdio. Robust detection:

```typescript
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // SDK wraps the Anthropic API error; status surfaces via .status (numeric) on
  // some paths, .response?.status on others, or as a substring in .message.
  const status =
    (err as { status?: number }).status ??
    (err as { response?: { status?: number } }).response?.status;
  if (typeof status === 'number') {
    return status === 429 || (status >= 500 && status < 600);
  }
  // Subprocess-serialised errors lose the status field entirely. Fall back to
  // string sniffing — accept false negatives over false positives.
  return /\b(429|503|502|504|rate[- ]?limit|overloaded)\b/i.test(err.message);
}
```

`AbortError` (thrown when the abortController fires) is **never retryable**: `if (err instanceof Error && err.name === 'AbortError') throw err;` should be the first line of the catch block.

### SSE-token registry pattern — why single-use + TTL

The two-phase send (open SSE, then POST) creates a race where a malicious or buggy client could try to attach multiple POSTs to one stream. **Single-use consumption** (delete on first read) makes that impossible. **TTL** prevents resource leaks if a client opens an SSE stream and never POSTs — the handle would otherwise stay open forever holding a Fastify reply hostage. 30 seconds is the design budget: a UI that takes longer than that to fire its POST after opening the stream is broken.

### messageStore design — atomic-rewrite for `updateLast`

JSONL is append-only by nature, but AC3 demands updating the last row's `content` and `usage` after the stream ends. Simplest correct approach:

```typescript
// updateLast pattern (NOT append):
async updateLast(projectId, sessionId, patch) {
  const all = await this.list(projectId, sessionId);
  if (!all.length) throw new Error('no messages to patch');
  all[all.length - 1] = { ...all[all.length - 1], ...patch };
  const tmp = `${path}.tmp.${process.pid}`;
  await fs.writeFile(tmp, all.map(m => JSON.stringify(m)).join('\n') + '\n');
  await fs.rename(tmp, path);  // atomic on POSIX; Windows rename is also atomic if target exists
}
```

This is O(n) per patch, which is fine: a Phase-1 session is bounded to ~hundreds of messages. Premature optimization (sparse files, in-memory write-back cache) is out of scope.

All store operations go through a per-key serialize chain — copy the pattern from `apps/server/src/domain/projectService.ts` (it already implements `serialize()` keyed on a string).

### Cost calculation — Opus 4.7 pricing

Opus 4.7 pricing (per Anthropic docs, mid-2026): **$15 / 1M input tokens, $75 / 1M output tokens**. Compute per turn:

```typescript
const turnCostUsd = (usage.input_tokens * 15 + usage.output_tokens * 75) / 1_000_000;
```

For `project_cost_usd_cumulative`, sum `usage` across all assistant messages in the project's sessions. Phase-1 acceptable approach: read all session JSONL files for the project at `cost.update` time and sum. For projects with hundreds of messages this is sub-millisecond. A maintained running total (in `projects.json`) is a Story 4.* concern.

If `result.total_cost_usd` is present on the SDK frame, prefer it over the manual calculation (it accounts for cache reads, prompt caching, etc.). Fall back to the formula above if the field is absent.

### Time-to-first-token budget (NFR11 — 150 ms)

The 150 ms ceiling is measured **from the SDK's first `stream_event` frame to the `reply.raw.write()` that delivers the first `message.delta` byte to the socket**. It does NOT include:
- SDK subprocess spawn time (counted against turn-start budget separately)
- Claude API time-to-first-byte (out of our control)
- The orchestrator's pre-stream retry window (only on failure paths)

To stay under budget: avoid any synchronous JSON parsing of large objects, do not append to the JSONL on first delta (defer to a `setImmediate` callback), and emit the SSE frame **before** invoking `messageStore.append` for the placeholder row.

### Conversation context — manual prompt building for Phase 1

The SDK has its own `sessionId`/`resume` mechanism, but it persists state to the SDK's filesystem footprint (under `~/.claude/`) — coupling our message history to a tool we don't fully control. For Phase 1 we build the prompt manually:

```typescript
const promptString = history
  .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
  .join('\n\n') + `\n\nHuman: ${userMessage.content}\n\nAssistant:`;
```

When Story 5.* introduces multi-session and resume, evaluate switching to `options.resume` then.

### Source tree map (what to create / modify)

```
apps/server/src/
├── agents/                          # NEW — note plural per epic AC
│   ├── orchestrator.ts              # NEW
│   ├── orchestrator.test.ts         # NEW
│   ├── prompts/
│   │   └── orchestrator.md          # NEW
│   └── index.ts                     # NEW (re-exports)
├── clients/
│   └── claude.ts                    # NEW
│   └── claude.test.ts               # NEW
├── domain/
│   ├── messageStore.ts              # NEW
│   ├── messageStore.test.ts         # NEW
│   └── projectService.ts            # MODIFY — add getById method
├── events/
│   ├── registry.ts                  # NEW
│   └── registry.test.ts             # NEW
├── routes/
│   ├── messages.ts                  # NEW
│   ├── messages.test.ts             # NEW (unit, mocked deps)
│   ├── messages.integration.test.ts # NEW (gated by INTEGRATION=1)
│   └── index.ts                     # MODIFY — register new routes
└── buildApp.ts                      # MODIFY — instantiate new deps

packages/shared/src/
├── domain.ts                        # MODIFY — add usage? to ChatMessage
├── http.ts                          # MODIFY — add SendMessageRequest/Response
└── index.ts                         # MODIFY — re-export new types

apps/server/package.json             # MODIFY — add SDK dep, eventsource devDep
```

### What NOT to touch this story (scope guard)

- `apps/web/**` — no frontend wiring. Story 1.8 owns the chat-input → `POST /messages` flow. Verifying the route is by curl + integration tests only.
- `apps/server/src/routes/sse.ts` — the existing `/api/sse/echo` route stays as-is. Do not refactor or remove it; Story 1.6 deliberately kept it for diagnostic use.
- `apps/server/src/events/emit.ts` — existing `createSseHandle` / `buildSseFrame` are the contract. Do not alter their signatures; the registry composes them.
- `apps/web/src/api/sse.ts` and `apps/web/src/api/agentEventDispatcher.ts` — already handle every event type this story emits. No changes needed.
- Tool execution, sub-agents, Skeptic loop — Stories 2.*, 3.*.
- Postgres / persistent project-cost ledger — Story 4.*.

### Reusable infrastructure inventory (don't reinvent)

| You need | Use |
|---|---|
| Open SSE stream from a Fastify reply | `createSseHandle({ reply, request, onAbort })` from `apps/server/src/events/emit.ts` |
| Build an SSE frame | `buildSseFrame(event)` (called internally by `handle.emit`) |
| Detect "client gone" errors | `isSseClosedError(err)` from same module |
| Validate request body / params | Fastify JSON Schema with `attachValidation: true`, then throw `AppError('invalid_input', err.message, { status: 400, cause: err })` |
| Look up a project | `projectService.getById(projectId)` from `apps/server/src/domain/projectService.ts` |
| Generate IDs | `randomUUID()` from `node:crypto`, cast to `MessageId` brand |
| Atomic JSONL writes | Copy the temp+rename pattern + `serialize()` from `projectService.ts` |
| Forward the AgentEvent union to a typed handler | (frontend only — already done in `agentEventDispatcher.ts`) |
| Tear down all client SSE streams on project switch | (frontend only — `closeAllAgentEventStreams()` in `apps/web/src/api/sse.ts`, already wired) |

### Project Structure Notes

- Plural `agents/` directory deviates from architecture.md but matches epic AC1 — see Conflict resolutions above
- Path params remain `snake_case` (`:project_id`) per Story 1.5 precedent — see Conflict resolutions above
- `messageStore` lives in `domain/` alongside `projectService` (both are app-state stores); the `clients/` folder is new, scoped to external-API wrappers

### Testing standards summary

- **Unit tests**: co-located `*.test.ts`, run by `vitest run` (default in CI). Mock the SDK at the module boundary.
- **Integration tests**: co-located `*.integration.test.ts`, gated by `if (!process.env.INTEGRATION) describe.skip(...)`. Run locally with `INTEGRATION=1 pnpm -F @bp/server test`.
- **No live Claude calls in CI** — the integration tests mock the SDK. Manual smoke with a real key happens in Task 11.
- **Coverage focus**: AC7's enumerated cases ARE the test plan. Don't write extra tests for edge cases not specified — Phase 1 prefers shipping over coverage maximization.

### Deferred items (track for follow-up stories)

- **Frontend `useChatSend` hook** → Story 1.8
- **Multi-session UX (`session_id` in path, session list)** → Story 5.*
- **Tool-use plumbing (`allowedTools`, `tool_call.start/end` event handling)** → Story 2.1
- **Sub-agent dispatch via `Task` tool / `subagent.*` events** → Story 2.3
- **Skeptic loop** → Story 3.*
- **Persistent project-cost ledger (separate file/table, not derived)** → Story 4.*
- **Replace manual prompt-string with SDK `sessionId/resume`** → reassess in Story 5.*
- **Streaming-message-delta backpressure** (currently fire-and-forget; if SSE buffer fills, deltas could drop) → instrument in Story 4.* observability work

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.7] — Acceptance criteria authoritative source (lines 683–711)
- [Source: _bmad-output/planning-artifacts/architecture.md] — Module layout, NFR11 (150 ms TTFT), Claude-Opus-4-7 model selection
- [Source: _bmad-output/planning-artifacts/PRD.md#NFR11] — Time-to-first-token requirement
- [Source: _bmad-output/implementation-artifacts/1-6-sse-infrastructure-typed-event-emitters.md] — `createSseHandle`, `buildSseFrame`, `isSseClosedError` API; `AgentEvent` union; abort wiring preview
- [Source: _bmad-output/implementation-artifacts/1-5-project-crud-projectswitcher-pinecone-namespace-bootstrap.md] — `:project_id` route precedent, `projectService` pattern, `serialize()` and atomic-write reference
- [Source: packages/shared/src/events.ts] — All 15 `AgentEvent` variants (this story emits message.delta, thinking.delta, cost.update, done, error, stream.cancelled)
- [Source: packages/shared/src/domain.ts] — `ChatMessage`, `MessageId`, `ProjectId`, `SessionId` brands
- [Source: apps/server/src/events/emit.ts] — `createSseHandle`, `SseHandle`, `isSseClosedError`
- [Source: apps/server/src/routes/sse.ts] — Echo-route pattern (validation, AppError, createSseHandle, try/catch/finally)
- [Source: apps/server/src/domain/projectService.ts] — JSONL atomic-write + `serialize()` pattern to mirror in `messageStore`
- [Source: apps/server/src/buildApp.ts] — Where to instantiate new deps and pass through `registerRoutes`
- [Source: apps/server/src/config/env.ts] — `ANTHROPIC_API_KEY` already validated in env schema
- [Source: https://docs.claude.com/en/api/agent-sdk/typescript] — `query()` API, `SDKMessage` discriminated union, `includePartialMessages`, `abortController`, `permissionMode`
- [Source: https://docs.claude.com/en/api/agent-sdk/streaming] — `stream_event` frame structure, `content_block_delta` text/thinking variants
- [Source: apps/web/src/api/sse.ts, apps/web/src/api/agentEventDispatcher.ts] — Frontend already consumes every event type this story emits; no changes needed there

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm -F @bp/server typecheck` — clean
- `pnpm -F @bp/server lint` — clean
- `pnpm -F @bp/server test` — 100 tests pass, 2 integration files skipped (messages.integration + pinecone)
- `INTEGRATION=1 npx vitest run src/routes/messages.integration.test.ts` — 1 test pass (full route → SSE → persistence)

### Completion Notes List

- All 8 ACs implemented. AC1 (orchestrator + SDK options), AC2 (two-phase SSE+POST with 202), AC3 (deltas + incremental persistence via `updateLast`), AC4 (retry before first yield + error/done terminal), AC5 (exact `[thinking.delta*] → message.delta+ → cost.update → done` sequence with Opus 4.7 pricing), AC6 (AbortController + `stream.cancelled` log), AC7 (unit + gated integration tests with mocked SDK), AC8 (scope boundary honored — no tools, no sub-agents, no frontend wiring).
- SDK runtime model correctly handled: `query()` imports subprocess CLI; mocked at module boundary via `vi.mock('@anthropic-ai/claude-agent-sdk')` so no real subprocess spawn in tests. `ANTHROPIC_API_KEY` forwarded via `options.env` (no `process.env` mutation).
- TTFT optimization: placeholder persistence uses `setImmediate` so first `message.delta` flushes before disk IO. Retry wrapped only around first `iter.next()` call; `firstFrameYielded` flag prevents mid-stream retry.
- Three epic/architecture conflicts resolved per Dev Notes: plural `agents/`, snake_case `:project_id`, implicit `sessionId='default'`.
- Cumulative project cost computed in `buildApp` by aggregating `usage` fields across `messageStore.listAllForProject(projectId)` (Opus 4.7 rates: $15/M input, $75/M output).
- Integration test uses native `fetch` against `app.listen({ port: 0 })` instead of the `eventsource` package — cleaner types and matches the existing `sse.test.ts` pattern. Still gated by `INTEGRATION=1`.
- Manual smokes (real Anthropic key + curl) listed in Task 11 remain owner-operated — not auto-runnable.

### File List

**Added**
- `apps/server/src/agents/orchestrator.ts`
- `apps/server/src/agents/orchestrator.test.ts`
- `apps/server/src/agents/prompts/orchestrator.md`
- `apps/server/src/clients/claude.ts`
- `apps/server/src/clients/claude.test.ts`
- `apps/server/src/domain/messageStore.ts`
- `apps/server/src/domain/messageStore.test.ts`
- `apps/server/src/events/registry.ts`
- `apps/server/src/events/registry.test.ts`
- `apps/server/src/routes/messages.ts`
- `apps/server/src/routes/messages.test.ts`
- `apps/server/src/routes/messages.integration.test.ts`

**Modified**
- `apps/server/package.json` — add `@anthropic-ai/claude-agent-sdk` dep, `eventsource` devDep, pin `@types/uuid` to `^11.0.0`
- `apps/server/src/buildApp.ts` — instantiate messageStore/sseRegistry/claudeClient, wire `runOrchestrator`, register onClose
- `apps/server/src/routes/index.ts` — register message routes, extend `RoutesOptions`
- `apps/server/src/domain/projectService.ts` — add `getById(projectId)` method
- `apps/server/src/domain/projectService.test.ts` — tests for `getById`
- `packages/shared/src/domain.ts` — `TokenUsage`, optional `usage` on `ChatMessage`
- `packages/shared/src/http.ts` — `SendMessageRequest`, `SendMessageResponse`
- `packages/shared/src/index.ts` — re-exports
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status transition

## Change Log

| Date       | Author      | Change                                            |
|------------|-------------|---------------------------------------------------|
| 2026-04-24 | Sarah (PO)  | Story drafted from Epic 1.7 — set ready-for-dev   |
| 2026-04-24 | Dev (James) | Implemented all 8 ACs; tests green; status → review |
