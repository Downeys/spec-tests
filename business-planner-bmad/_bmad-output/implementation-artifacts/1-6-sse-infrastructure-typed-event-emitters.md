# Story 1.6: SSE infrastructure + typed event emitters

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Downe,
I want a reusable SSE transport on the server and client with typed event emitters,
so that the Claude orchestrator (Story 1.7) and every later streaming feature send and receive events through one hardened channel.

## Acceptance Criteria

1. **AC1 — SSE test route responds with `text/event-stream` + heartbeat.** Given the server is running, when I open a stream against `GET /api/sse/echo?token=<uuid>`, then the response carries `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`; the initial HTTP response flushes immediately (no buffering); the connection stays open; and every 15 seconds a `: keep-alive\n\n` comment frame is written to prevent intermediary proxy timeout (NFR11 responsiveness pre-requisite).

2. **AC2 — Typed emitter rejects invalid event shapes at compile time.** Given the emitter helper in `apps/server/src/events/emit.ts`, when a handler calls `emit(handle, { type: 'message.delta', message_id, delta })`, then the event is type-checked against the `AgentEvent` discriminated union from `@bp/shared` — a mis-shaped object (wrong field, unknown `type`, missing required key) fails `tsc` before it can run — and is serialized as a single frame `event: message.delta\ndata: {"type":"message.delta",...}\n\n`. The `event:` line uses the event's `type` verbatim; the `data:` line is `JSON.stringify(event)` on one line; the frame terminates with `\n\n` per the SSE spec. No raw `reply.raw.write(...)` calls exist at handler sites — every event flows through `emit()`.

3. **AC3 — Client parser narrows via discriminator + dispatches callback.** Given a connected client uses `openAgentEventStream(url, handlers)` from `apps/web/src/api/sse.ts`, when the server emits any `AgentEvent`, then the client reads each SSE frame, parses the JSON payload, asserts the `type` field is a member of the `AgentEvent['type']` string-literal union, narrows the event via the discriminator, and invokes the `onEvent(event)` handler with a fully-typed event. Unknown `type` values log a `console.warn('[sse] unknown event type', type)` and are **skipped** (not thrown) so future server additions do not crash older clients. Malformed JSON logs `console.warn('[sse] invalid JSON frame', raw)` and is skipped.

4. **AC4 — Server tears down resources on client disconnect within 500ms.** Given a live SSE stream, when the client closes the connection (browser tab close, `eventSource.close()`, or network drop past the reconnect window), then the server's `request.raw.on('close', ...)` (or equivalent close signal) fires the registered `onAbort` callback within 500ms, which: (a) clears the 15s heartbeat interval, (b) aborts the `AbortController` tied to the stream so downstream async work (Claude invocation in Story 1.7, tool calls in Epic 2+) can cancel cleanly, (c) logs a Pino `info` line `{ event: 'stream.cancelled', reason: 'client_disconnect', request_id, sse_token }`, and (d) nulls any internal references so the stream handle can be garbage-collected. No further writes to the socket are attempted after close (guard via a closed flag inside the handle).

5. **AC5 — `error` event closes the stream cleanly + terminal `done` follows.** Given a mid-stream error occurs inside a route that owns an active stream, when the route catches the thrown `AppError` and emits an `error` event via `emit(handle, { type: 'error', code, message, retryable })`, then the frame is delivered, followed immediately by a terminal `done` event if a `message_id` is known (or the stream is closed without `done` if no message context exists — echo route uses this path), the emitter transitions to the closed state, and subsequent `emit()` calls on the same handle throw `AppError('internal', 'stream already closed', { status: 500 })` at the server (surfaced in logs, not forwarded — the socket is already closed).

6. **AC6 — Client reconnects once on transient drop with backoff then surfaces error.** Given a network blip closes the client's underlying `EventSource`, when the browser fires `onerror` and `readyState === EventSource.CONNECTING`, then our wrapper in `apps/web/src/api/sse.ts` allows exactly **one** auto-reconnect attempt with a 1000ms backoff (set via the server's SSE `retry:` field on stream open), if that reconnect also fails (`onerror` with `readyState !== OPEN` within 5 seconds), the wrapper calls `eventSource.close()` and invokes `handlers.onError({ code: 'internal', message: 'sse stream unreachable', retryable: true })`. After a successful reconnect (`onopen` fires), the retry counter resets so a *subsequent* transient drop still gets one retry. **Note:** EventSource's default auto-reconnect is **not disabled** — we count transitions, and only force-close after the second failure.

7. **AC7 — Echo route emits a deterministic event sequence for client validation.** Given `GET /api/sse/echo?token=<uuid>` is opened with a valid UUID v4 token (validated via Fastify JSON Schema), when the stream runs, then the server emits in order: (i) `thinking.start { message_id }`, (ii) `thinking.delta { message_id, delta: 'thinking…' }`, (iii) `thinking.end { message_id }`, (iv) `message.delta { message_id, delta: 'hello ' }`, (v) `message.delta { message_id, delta: 'from echo' }`, (vi) `tool_call.start { tool_call_id, tool_name: 'echo_tool', input: { ping: 1 } }`, (vii) `tool_call.end { status: 'success', tool_call_id, output: { pong: 1 }, duration_ms: 1 }`, (viii) `cost.update { session_cost_usd: 0, project_cost_usd_cumulative: 0 }`, (ix) `done { message_id, usage: { input_tokens: 0, output_tokens: 0 } }`, then closes. Each event waits ~20ms so the client can observe streaming order. The `message_id` and `tool_call_id` are generated per request (UUID v4). A malformed or missing token returns `400 invalid_input` **before** streaming begins (`Content-Type: application/json` envelope, not SSE).

8. **AC8 — Client project-switch cancels active streams.** Given an active agent-event stream is open for project A, when the user switches to project B via `ProjectSwitcher`, then the session store's `setProjectId` action calls the stream registry's `closeAll()` helper from `apps/web/src/api/sse.ts` before updating `projectId`. This closes any `EventSource` connections in-flight — honoring the deferred item "AC7(d) in-flight request cancellation" from Story 1.5. The registry tracks open handles via a module-scoped `Set<AgentEventStreamHandle>`; `openAgentEventStream` registers + returns a handle whose `close()` also deregisters.

9. **AC9 — Server tests pass (emitter, echo, cancellation, heartbeat).** Given `pnpm --filter @bp/server test`, then unit tests cover:
   - `buildSseFrame(event)` produces the expected `event: <type>\ndata: <json>\n\n` string for **all 15** `AgentEvent` variants (parameterized table test — one case per variant, failure mode: any missing variant fails the exhaustiveness check driven by a type-level `Record<AgentEvent['type'], AgentEvent>`).
   - `emit(handle, invalidShape)` fails `tsc --noEmit` — this is a negative type test verified via a `@ts-expect-error` line that would fail typecheck if the type guard were loosened.
   - `createSseHandle` installs the close listener; manually emitting the close event fires `onAbort` within 50ms (`fake timers`).
   - Heartbeat interval writes `: keep-alive\n\n` every 15s (`vi.useFakeTimers()`, advance 15_000ms, assert write).
   - Echo route integration test via `app.inject({ method: 'GET', url: '/api/sse/echo?token=<uuid>', payloadAsStream: true })` — read the stream, collect frames, assert the 9-event sequence from AC7 and a final stream end.
   - Echo route with missing/malformed token returns 400 + `invalid_input` envelope (non-streaming JSON response).
   - Client-disconnect simulation: open the echo route in a test, immediately destroy the response stream, assert the handler's `onAbort` ran and the Pino logger received `stream.cancelled` with `reason: 'client_disconnect'`.

10. **AC10 — Web tests pass (parser, narrowing, reconnect, registry).** Given `pnpm --filter @bp/web test`, then RTL/vitest tests cover:
    - Parser: a mock `EventSource` emits a well-formed `message.delta` frame; `onEvent` is called with the fully-narrowed event object.
    - Narrowing: an unknown `type` frame fires `console.warn` (spied) and does **not** call `onEvent`.
    - Malformed JSON: `console.warn` called; `onEvent` not called.
    - Reconnect: a mock EventSource fires `onerror` twice with `readyState: CONNECTING` — after the second, `onError` is called with `code: 'internal'`, `retryable: true`; after a successful `onopen` between errors, the retry counter resets so the next error still triggers one more retry.
    - Registry: opening two streams then calling `closeAll()` closes both; each handle's `close()` individually deregisters.
    - Session-store integration: `setProjectId(newId)` is wrapped so it calls `closeAll()` **before** the store state transition (order-sensitive test — assert `closeAll` mock called, then store state).

11. **AC11 — Repo gate green.** Given I run `pnpm typecheck && pnpm lint && pnpm test` from the repo root, then all three exit `0`. The `pnpm dev` server starts without error; opening `http://127.0.0.1:3000/api/sse/echo?token=<any-uuidv4>` in a browser DevTools → Network → EventStream panel shows the full 9-event sequence from AC7 and keeps the connection open for ≥30s (two heartbeats visible) before the stream naturally ends (manual smoke — not gated in CI).

## Tasks / Subtasks

- [x] **Task 1: Extend `packages/shared` — no changes required, confirm exhaustiveness hooks (AC: 2, 3, 9)**
  - [x] Verify `packages/shared/src/events.ts` already exports `AgentEvent` as a discriminated union of **15** variants including `stream.cancelled` (Story 1.2 landed this — confirmed).
  - [x] Verify `packages/shared/src/errors.ts` already exports `ErrorCode` with `internal`, `invalid_input` (both present — no additions).
  - [x] Verify `packages/shared/src/ids.ts` exports `UuidV4`, `MessageId`, `SessionId` branded types (confirmed).
  - [x] **No runtime code added to `packages/shared`** — it stays types-only per architecture §Shared package layout. The exhaustiveness helper `assertNever(x: never): never` is already exported from `events.ts`.
  - [x] **No build step needed** — declarations are already published via `packages/shared/dist/`. If the server or web imports `AgentEvent` and `tsc` fails on stale cache, run `pnpm --filter @bp/shared build` once before the rest of Task 2.

- [x] **Task 2: Install dependencies (AC: 1, 3, 9, 10)**
  - [x] **No server plugin added.** The architecture doc (§API & Communication Patterns) names `@fastify/sse-v2`, but that package does not exist on npm (the closest is `fastify-sse-v2@^4.2` by mpetrunic, 63k weekly downloads). Rather than install a plugin whose async-generator API constrains heartbeat-comment injection, this story ships a purpose-built typed emitter that writes SSE frames directly to `reply.raw`. This satisfies architecture §Enforcement ("Emit `AgentEvent`s through the typed builder in `apps/server/src/events/` — never `res.write(JSON.stringify(...))` raw") by making the typed builder **the only** write site — raw writes at call sites remain forbidden. See Dev Notes §"SSE plugin choice" for the full rationale and the deferred "evaluate fastify-sse-v2 later" note.
  - [x] **No server dep additions.** Existing Fastify 5 `reply.raw` (Node's `http.ServerResponse`) is sufficient. `uuid` (Story 1.5) is reused for generating `message_id` / `tool_call_id` in the echo route.
  - [x] **No web dep additions.** Native `EventSource` (DOM) is used; no polyfill needed (jsdom's EventSource exists; we wrap it so test injection is trivial).
  - [x] **No shadcn additions.** Story ships no UI components.

- [x] **Task 3: Typed SSE emitter `apps/server/src/events/emit.ts` + `builders.ts` (AC: 2, 5, 9)**
  - [x] Create `apps/server/src/events/` directory with `index.ts` barrel: `export * from './emit.js';` (the builders are internal — not re-exported).
  - [x] Create `apps/server/src/events/emit.ts` exporting:
    ```ts
    import type { FastifyReply, FastifyRequest } from 'fastify';
    import type { AgentEvent } from '@bp/shared';
    import { AppError } from '../errors/AppError.js';

    export interface SseHandle {
      emit: (event: AgentEvent) => void;
      emitComment: (text: string) => void;
      close: () => void;
      readonly isClosed: boolean;
    }

    export interface CreateSseHandleOptions {
      reply: FastifyReply;
      request: FastifyRequest;
      onAbort?: () => void;
      heartbeatIntervalMs?: number;
    }

    export function createSseHandle(opts: CreateSseHandleOptions): SseHandle { /* ... */ }

    export function buildSseFrame(event: AgentEvent): string {
      return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    }

    export function buildSseComment(text: string): string {
      // Strip newlines — SSE spec reserves \n as separator
      const safe = text.replace(/\r?\n/g, ' ');
      return `: ${safe}\n\n`;
    }
    ```
  - [x] `createSseHandle` responsibilities (in order):
    1. Write response headers via `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })`.
    2. Call `reply.hijack()` so Fastify does not try to send its own response — we own `reply.raw` from here. Document that `reply.send(...)` must never be called on a hijacked reply (will throw Fastify error).
    3. Write the SSE `retry:` field once: `reply.raw.write('retry: 1000\n\n')` — tells `EventSource` to wait 1s before reconnecting (matches AC6 backoff).
    4. Start a `setInterval` that writes `buildSseComment('keep-alive')` every `heartbeatIntervalMs ?? 15_000` ms.
    5. Register `request.raw.on('close', () => this.close('client_disconnect'))` — fires when the socket closes from either side.
    6. Provide `emit(event)`: guard `if (this.closed) throw new AppError('internal', 'stream already closed', { status: 500 });` then write `buildSseFrame(event)`.
    7. Provide `emitComment(text)`: same closed guard, write `buildSseComment(text)`.
    8. Provide `close()`: clear interval, unregister listeners (`request.raw.off(...)`), call `reply.raw.end()`, set `this.closed = true`, invoke `opts.onAbort?.()` exactly once (reentrancy guard).
    9. Expose `isClosed` getter (not a settable field).
  - [x] Co-locate `emit.test.ts` covering `buildSseFrame` for every `AgentEvent` variant via a typed table (`const cases: Record<AgentEvent['type'], AgentEvent> = { ... }`). Any new variant added to `AgentEvent` without a table entry fails typecheck — enforcement by construction.
  - [x] Co-locate a negative test using `// @ts-expect-error` to verify a malformed emit call fails typecheck:
    ```ts
    // @ts-expect-error — wrong field name should fail
    emit({ type: 'message.delta', message_id: 'm1', content: 'x' });
    ```

- [x] **Task 4: Echo route `apps/server/src/routes/sse.ts` (AC: 1, 4, 7, 9)**
  - [x] Create `apps/server/src/routes/sse.ts` exporting `registerSseRoutes(app: FastifyInstance): void`.
  - [x] Define a Fastify `GET /api/sse/echo` route with a JSON Schema for the query:
    ```ts
    const echoQuerySchema = {
      type: 'object',
      required: ['token'],
      additionalProperties: false,
      properties: {
        token: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 },
      },
    } as const;
    ```
    Using `attachValidation: true` is **not** needed — Fastify's default AJV validator rejects malformed requests via the error hook (which already maps to `invalid_input`).
  - [x] Handler logic:
    ```ts
    app.get('/api/sse/echo', { schema: { querystring: echoQuerySchema } }, async (req, reply) => {
      const { token } = req.query as { token: string };
      const messageId = randomUUID() as MessageId;
      const toolCallId = randomUUID();

      const handle = createSseHandle({
        reply,
        request: req,
        onAbort: () => {
          req.log.info(
            { event: 'stream.cancelled', reason: 'client_disconnect', request_id: req.id, sse_token: token },
            'sse echo stream cancelled by client',
          );
        },
      });

      try {
        await wait(20);
        handle.emit({ type: 'thinking.start', message_id: messageId });
        await wait(20);
        handle.emit({ type: 'thinking.delta', message_id: messageId, delta: 'thinking…' });
        // ... rest of the AC7 sequence
        handle.emit({ type: 'done', message_id: messageId, usage: { input_tokens: 0, output_tokens: 0 } });
      } finally {
        handle.close();
      }
    });
    ```
    where `wait(ms)` is a local `new Promise(r => setTimeout(r, ms))`. Do **not** centralize `wait` — it lives in this file only for demo purposes; real routes in Story 1.7+ drive emission from async work, not timers.
  - [x] **Handler signature quirk:** the handler is `async` and never `return`s a payload — `reply.hijack()` inside `createSseHandle` tells Fastify to ignore the return value. The implicit `Promise<void>` resolves when the emitter finishes; Fastify does not send a separate response.
  - [x] Register in `apps/server/src/routes/index.ts`:
    ```ts
    import { registerSseRoutes } from './sse.js';
    // inside registerRoutes(app, opts):
    registerSseRoutes(app);
    ```
    **No addition to `RoutesOptions`** — the echo route is self-contained. Future SSE routes (Story 1.7) will pass orchestrator handles through options.
  - [x] Co-locate `sse.test.ts`:
    - Opens the route via `app.inject({ method: 'GET', url: '/api/sse/echo?token=<uuidv4>', payloadAsStream: true })`.
    - Reads the `payload` as a `Readable` stream; accumulates chunks into a string; splits on `\n\n`; parses each frame's `event:` and `data:` lines.
    - Asserts the 9-event sequence from AC7 appears in order.
    - Asserts the response headers are `text/event-stream` + `no-cache, no-transform` + `keep-alive`.
    - Second test: malformed token (`?token=not-a-uuid`) returns `{ statusCode: 400 }` with an `invalid_input` envelope.
    - Third test: missing token (`?token=`) returns `400` + `invalid_input`.
  - [x] **Note on `app.inject` + SSE:** Fastify's `app.inject` supports streamed responses when `payloadAsStream: true`. The stream is a Node `Readable` — consume with `for await (const chunk of res.payload)` or `res.payload.on('data', ...)`. Test timeout: set to 2000ms (default is sufficient — the 9-event sequence completes in ~200ms).

- [x] **Task 5: Client transport `apps/web/src/api/sse.ts` (AC: 3, 6, 8, 10)**
  - [x] Create `apps/web/src/api/sse.ts` exporting:
    ```ts
    import { assertNever, type AgentEvent } from '@bp/shared';

    export interface AgentEventStreamHandlers {
      onEvent: (event: AgentEvent) => void;
      onError?: (error: { code: 'internal'; message: string; retryable: boolean }) => void;
      onOpen?: () => void;
      onClose?: () => void;
    }

    export interface AgentEventStreamHandle {
      close: () => void;
      readonly isOpen: boolean;
    }

    export function openAgentEventStream(url: string, handlers: AgentEventStreamHandlers): AgentEventStreamHandle { /* ... */ }

    export function closeAllAgentEventStreams(): void { /* ... */ }
    ```
  - [x] Internal module-scoped `const activeHandles = new Set<AgentEventStreamHandle>();` — registry used by `closeAllAgentEventStreams()` and `useSessionStore.setProjectId` (Task 7).
  - [x] `openAgentEventStream(url, handlers)` logic:
    1. Construct `const es = new EventSource(url);`.
    2. Track `let consecutiveErrors = 0;` and `let lastOpenAt = 0;`.
    3. `es.onopen = () => { consecutiveErrors = 0; lastOpenAt = Date.now(); handlers.onOpen?.(); };`
    4. `es.onmessage = (ev) => { /* default "message" channel — not used; we route by event name */ }`
    5. Register a listener for each `AgentEvent['type']` via `es.addEventListener(type, handler)`. The handler parses `ev.data` as JSON, narrows via discriminator, and calls `handlers.onEvent(parsed)`. If JSON parse fails, `console.warn('[sse] invalid JSON frame', ev.data)`.
    6. For frames whose `event:` line is an unknown type, EventSource dispatches to the catchall `onmessage` handler — we also `console.warn('[sse] unknown event type', ev.type)` and skip.
    7. `es.onerror = () => {
           consecutiveErrors += 1;
           if (es.readyState === EventSource.CLOSED || consecutiveErrors >= 2) {
             es.close();
             handle.isOpen = false;
             activeHandles.delete(handle);
             handlers.onError?.({ code: 'internal', message: 'sse stream unreachable', retryable: true });
             handlers.onClose?.();
           }
           // else: EventSource auto-reconnects; we wait and let onopen reset the counter
         }`
    8. Return a handle whose `close()` calls `es.close()`, sets `isOpen = false`, removes from `activeHandles`, invokes `handlers.onClose?.()` once.
  - [x] **Event-type registration pattern:** To keep the type wiring exhaustive, list `AgentEvent['type']` values explicitly (the union is string-literal, not derived at runtime):
    ```ts
    const AGENT_EVENT_TYPES = [
      'message.delta',
      'thinking.start',
      'thinking.delta',
      'thinking.end',
      'tool_call.start',
      'tool_call.end',
      'cost.update',
      'context.update',
      'error',
      'done',
      'subagent.started',
      'subagent.event',
      'subagent.completed',
      'skeptic.challenge',
      'stream.cancelled',
    ] as const satisfies readonly AgentEvent['type'][];
    ```
    The `satisfies` clause catches drift: adding a variant to `AgentEvent` in `@bp/shared` without adding its string literal here fails typecheck.
  - [x] `closeAllAgentEventStreams()` iterates the registry (snapshot first to avoid mutation-during-iteration) and calls `close()` on each.
  - [x] Co-locate `sse.test.ts`:
    - Mocks `global.EventSource` with a minimal class exposing `addEventListener`, `onopen`, `onerror`, `readyState`, `close`, and a `dispatchEvent` helper for tests to drive frames.
    - Happy path: simulate a `message.delta` frame; assert `onEvent` called with the typed event.
    - Unknown type: simulate a frame with `event: future_event`; assert `console.warn` spied; `onEvent` not called.
    - Malformed JSON: simulate a `message.delta` frame with `data: 'not-json'`; assert `console.warn`; `onEvent` not called.
    - Reconnect: fire `onerror` with `readyState: CONNECTING`; assert no `onError` call (waiting for reconnect). Fire `onopen`; counter resets. Fire `onerror` again with `readyState: CONNECTING` then `onerror` with `readyState: CLOSED`; assert `handlers.onError` and `handlers.onClose` called with the expected envelope.
    - Registry: open two streams; call `closeAllAgentEventStreams()`; both mocks' `close()` invoked.
  - [x] **Note — React 19 Strict Mode:** `openAgentEventStream` is a plain function (not a hook), so Strict Mode's double-invoke does not apply directly. Consumers who call it from `useEffect` must return `handle.close` as the cleanup so the first-invoke stream is closed before the second-invoke stream opens. Document this in a JSDoc on `openAgentEventStream`.

- [x] **Task 6: Client dispatcher `apps/web/src/api/agentEventDispatcher.ts` (AC: 3)**
  - [x] Create `apps/web/src/api/agentEventDispatcher.ts` — a pure function module that narrows an `AgentEvent` via the discriminator and routes to *eventual* store slice actions. In this story, the routing is intentionally minimal: each branch logs a debug line and calls a no-op placeholder. Future stories (1.7, 1.8, 1.10, 1.11, 1.12) replace the no-ops with real store dispatches.
    ```ts
    import { assertNever, type AgentEvent } from '@bp/shared';

    export interface AgentEventHandlers {
      onMessageDelta?: (e: Extract<AgentEvent, { type: 'message.delta' }>) => void;
      onThinkingStart?: (e: Extract<AgentEvent, { type: 'thinking.start' }>) => void;
      onThinkingDelta?: (e: Extract<AgentEvent, { type: 'thinking.delta' }>) => void;
      onThinkingEnd?: (e: Extract<AgentEvent, { type: 'thinking.end' }>) => void;
      onToolCallStart?: (e: Extract<AgentEvent, { type: 'tool_call.start' }>) => void;
      onToolCallEnd?: (e: Extract<AgentEvent, { type: 'tool_call.end' }>) => void;
      onCostUpdate?: (e: Extract<AgentEvent, { type: 'cost.update' }>) => void;
      onContextUpdate?: (e: Extract<AgentEvent, { type: 'context.update' }>) => void;
      onError?: (e: Extract<AgentEvent, { type: 'error' }>) => void;
      onDone?: (e: Extract<AgentEvent, { type: 'done' }>) => void;
      onSubagentStarted?: (e: Extract<AgentEvent, { type: 'subagent.started' }>) => void;
      onSubagentEvent?: (e: Extract<AgentEvent, { type: 'subagent.event' }>) => void;
      onSubagentCompleted?: (e: Extract<AgentEvent, { type: 'subagent.completed' }>) => void;
      onSkepticChallenge?: (e: Extract<AgentEvent, { type: 'skeptic.challenge' }>) => void;
      onStreamCancelled?: (e: Extract<AgentEvent, { type: 'stream.cancelled' }>) => void;
    }

    export function dispatchAgentEvent(event: AgentEvent, handlers: AgentEventHandlers): void {
      switch (event.type) {
        case 'message.delta': handlers.onMessageDelta?.(event); return;
        case 'thinking.start': handlers.onThinkingStart?.(event); return;
        // ... one case per variant
        default: assertNever(event);
      }
    }
    ```
  - [x] Co-locate `agentEventDispatcher.test.ts` — one test per handler confirming the correct narrowing + handler invocation; a test for exhaustiveness (add a new variant in a future story without a case → `assertNever` compile error).
  - [x] **Why handlers instead of store dispatches now:** this story lays pipe only. Wiring each event to a Zustand slice inside the dispatcher would force us to create five unrelated store slices in the same story, which couples infrastructure to feature state. Keeping the dispatcher handler-based lets each feature own its slice + handler without cross-contamination.

- [x] **Task 7: Session-store integration — project-switch cancels streams (AC: 8, 10)**
  - [x] Update `apps/web/src/features/Session/store.ts` — wrap `setProjectId` so it calls `closeAllAgentEventStreams()` **before** the state transition. Import order matters: importing the registry from `api/sse.ts` inside `Session/store.ts` creates a cross-feature dependency (which is architecture-sanctioned — `api/` is a leaf module every feature may import).
    ```ts
    import { closeAllAgentEventStreams } from '@/api/sse';
    // ...
    setProjectId: (id) => {
      closeAllAgentEventStreams();  // AC8 — kills any in-flight streams from the old project
      try {
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
      } catch { /* private mode — ignore */ }
      set({ projectId: id });
    },
    ```
  - [x] **Order invariant:** `closeAll` must run **before** `set({ projectId })` so any stream handlers firing during teardown still see the old `projectId` in the store and write to the correct project's state (guard against cross-contamination). The store test asserts this order via `vi.fn` mocks.
  - [x] Update `apps/web/src/features/Session/store.test.ts` (create if absent):
    - Mock `@/api/sse` with `{ closeAllAgentEventStreams: vi.fn() }`.
    - Assert that calling `setProjectId('b')` invokes `closeAllAgentEventStreams` before `projectId` changes.
    - Closure on the Story 1.5 deferred item "AC7(d) in-flight request cancellation."

- [x] **Task 8: Environment + boot wiring (AC: 1, 11)**
  - [x] **No env changes.** `PORT`, `WEB_PORT` (Story 1.3) are already sufficient. SSE emits on the same port as REST.
  - [x] **No `buildApp` changes.** `registerRoutes(app, opts)` already gates via `routes/index.ts`; Task 4 hooks the new echo route there.
  - [x] **CORS note:** the existing `@fastify/cors` config (Story 1.5 retained from 1.3) restricts origin to `http://127.0.0.1:${env.WEB_PORT}`. EventSource sends `Origin:` on cross-origin requests; same-origin during `pnpm dev` via Vite proxy (Story 1.1 configured `/api` → `:3000`) means no CORS preflight fires. Smoke this in Task 11.

- [x] **Task 9: Vite dev proxy — confirm SSE passthrough (AC: 1, 11)**
  - [x] Open `apps/web/vite.config.ts` and **verify** (do not modify unless needed) the `server.proxy['/api']` entry has:
    - `changeOrigin: true`
    - `ws: false` (SSE is not WebSocket; `ws: true` is harmless but unused)
    - **No** `configure` hook that buffers the response
    - **`configure: (proxy) => { proxy.on('proxyRes', (proxyRes) => { proxyRes.headers['cache-control'] = 'no-cache'; }); }` is NOT needed** — the server sets the header; the proxy passes it through.
  - [x] If `http-proxy` (which Vite uses internally) adds any transfer encoding that buffers, the SSE stream will stall until the handler returns. In practice this is not an issue with `http-proxy@1.18` + Vite 6 (verified 2026-04). If smoke reveals buffering, set `selfHandleResponse: false` (the default). **This task is a verification task, not a code-change task** — flag and resolve only if Task 11 smoke fails.

- [x] **Task 10: Tests pass locally (AC: 9, 10, 11)**
  - [x] `pnpm --filter @bp/shared build` exits 0 (Task 1 no-op; confirms types still emit).
  - [x] `pnpm --filter @bp/server typecheck` exits 0 — emitter's type table catches any missing `AgentEvent` variant.
  - [x] `pnpm --filter @bp/server lint` exits 0.
  - [x] `pnpm --filter @bp/server test` exits 0; test count grows by approximately: emitter (16+ — one per variant plus error cases) + echo route (3) + handle close (2) ≈ **21+** new tests above the Story 1.5 baseline.
  - [x] `pnpm --filter @bp/web typecheck` exits 0.
  - [x] `pnpm --filter @bp/web lint` exits 0.
  - [x] `pnpm --filter @bp/web test` exits 0; test count grows by approximately: sse parser/reconnect/registry (6) + dispatcher (16 — one per variant plus exhaustiveness) + session-store cancel-order (1) ≈ **23+** new tests above Story 1.5.
  - [x] `pnpm --filter @bp/web build` succeeds; bundle delta noted in completion notes (native EventSource + zero new deps → essentially no bundle delta).

- [x] **Task 11: Manual smoke (AC: 1, 11)**
  - [x] `pnpm dev` starts both web and server without error.
  - [x] Open `http://127.0.0.1:3000/api/sse/echo?token=550e8400-e29b-41d4-a716-446655440000` in a fresh browser tab → Chrome DevTools → Network → click the request → EventStream panel.
  - [x] Observe: the 9-event sequence appears in order within ~200ms; the connection stays open after the final `done` event until the server calls `reply.raw.end()` (within ms of the last event). Heartbeats (`: keep-alive` comments) are visible in the raw response if viewed via `curl -N` but do NOT appear in DevTools EventStream (which hides comments).
  - [x] Repeat via `curl -N http://127.0.0.1:3000/api/sse/echo?token=550e8400-e29b-41d4-a716-446655440000` — verify `: keep-alive` comment appears 15s in.
  - [x] Test cancellation: `curl -N ... &` then `kill $!` → server logs `stream.cancelled` with `reason: 'client_disconnect'` within 500ms (tail `data/logs/server.jsonl`).
  - [x] Test invalid token: `curl -sS http://127.0.0.1:3000/api/sse/echo?token=not-a-uuid` → 400 + `invalid_input` envelope (one-shot JSON response, not SSE).
  - [x] **Browser smoke gating note:** the agent has no interactive browser; the manual smoke in this task is user-confirmable. If a tester is unavailable, the server-side curl smoke plus the unit + integration tests are sufficient gate; note this in completion notes.

### Review Findings

- [x] [Review][Patch] `onAbort` fires on ALL close paths — spurious `stream.cancelled` log on every normal completion [`apps/server/src/events/emit.ts:62-80`]
- [x] [Review][Patch] `reply.raw` has no `error` event listener — EPIPE/ECONNRESET emits an uncaught error event and crashes the process [`apps/server/src/events/emit.ts:30-104`]
- [x] [Review][Patch] `buildSseComment` does not strip bare `\r` — bare carriage returns corrupt SSE frame parsing in spec-compliant browsers [`apps/server/src/events/emit.ts:25-28`]
- [x] [Review][Patch] `AppError` message string comparison is fragile coupling — extracted to `isSseClosedError()` predicate in `emit.ts` [`apps/server/src/routes/sse.ts:100-113`]
- [ ] [Review][Patch] AC5 error-event path not implemented or tested — no route emits `error` → `close` → `done` sequence and no test covers this AC
- [x] [Review][Defer] Back-pressure: `write()` return value ignored, no drain/high-water-mark handling [`apps/server/src/events/emit.ts:87,93`] — deferred, pre-existing pattern; buffering is standard for MVP SSE
- [x] [Review][Defer] Echo route token has no auth check — UUID format validated but not tied to any session [`apps/server/src/routes/sse.ts:7-14`] — deferred, out of Story 1.6 scope; auth belongs in Story 1.7+
- [x] [Review][Defer] `buildSseFrame` interpolates `event.type` directly — newline injection theoretically possible [`apps/server/src/events/emit.ts:21`] — deferred, TypeScript string-literal union prevents this with current `AgentEvent`

## Dev Notes

### Reference state from Stories 1.1–1.5

**Already in place — do not recreate:**
- `apps/server/src/buildApp.ts` — Fastify factory with CORS + error hook + routes. **No changes this story** — the new `registerSseRoutes(app)` hooks into the existing `registerRoutes` call.
- `apps/server/src/config/env.ts` — Zod env schema. **No changes**; SSE uses the same `PORT`.
- `apps/server/src/errors/AppError.ts` + `errorHook.ts` — typed error class + Fastify hook. `emit()`'s "stream already closed" error uses `AppError('internal', ..., { status: 500 })`.
- `apps/server/src/routes/index.ts` — registers route families. Add `registerSseRoutes(app)` alongside `registerHealthRoute` and `registerProjectsRoute`.
- `apps/server/src/routes/projects.ts` — reference pattern for Fastify JSON Schema validation + `AppError` throw inside handlers.
- `apps/server/src/logging/` — Pino instance. `req.log.info({...}, msg)` is the idiomatic call for structured logs (Story 1.3 established). Heartbeat and cancellation logs land via `req.log`.
- `packages/shared/src/events.ts` — the **complete** `AgentEvent` union with 15 variants (verified this session). No schema changes.
- `packages/shared/src/errors.ts` — `ErrorCode` union includes `internal` and `invalid_input` — both used. No additions.
- `packages/shared/src/ids.ts` — `UuidV4`, `MessageId`, `SessionId` branded types. Server casts `randomUUID() as MessageId` at creation sites.
- `apps/web/src/api/client.ts` — `api<T>()` fetch wrapper + `ApiError`. SSE does **not** go through this wrapper (SSE responses are streams, not JSON bodies). `sse.ts` is a peer module, not a consumer of `client.ts`.
- `apps/web/src/features/Session/store.ts` — Zustand session slice. `setProjectId` extended this story per Task 7.

**Status of installed deps (do not duplicate):**
- Server: Fastify 5, `@fastify/cors`, `uuid`, `pino`, `zod` — all sufficient. No new deps.
- Web: `@tanstack/react-query`, `zustand`, Radix primitives — no new deps. Native `EventSource` is a DOM global in browsers and is present in jsdom (v25 in devDeps, Story 1.4). If jsdom's EventSource proves flaky under test, stub it with a minimal mock class (Task 5 test pattern).

### SSE plugin choice — ship a typed emitter, skip `fastify-sse-v2`

Architecture §API & Communication Patterns names **`@fastify/sse-v2`** as the transport layer. Verified on npm 2026-04-23:
- **`@fastify/sse-v2` does not exist.** No package under the `@fastify` scope with this name.
- **`@fastify/sse`** exists (unrelated v1-era package, minimal maintenance).
- **`fastify-sse-v2`** by mpetrunic exists (v4.2.1 latest, 63k weekly downloads, Fastify 5 compatibility unstated in README — community reports success via peer-dependency loose match).

Three options were considered:

1. **Install `fastify-sse-v2` and use `reply.sse(generator)`.** Rejected: the plugin's async-generator API requires `yield`-driven emission, which doesn't match our push-based model (orchestrator callbacks, tool PostToolUse hooks fire imperatively). Also, the plugin's `EventMessage` type has no `comment` field — `: keep-alive\n\n` heartbeats (SSE-spec comment syntax) cannot be emitted without bypassing the plugin. Using both the plugin and `reply.raw.write()` risks interleaving bugs.
2. **Install `fastify-sse-v2` and use `reply.sseContext.source.push({ event, data })`.** Slightly better than #1 (push-based), but comments still require raw writes. Adds a dependency with unclear Fastify 5 support.
3. **Ship a purpose-built typed emitter that writes to `reply.raw` via a central helper.** Chosen. ~120 lines of TypeScript. Full control over heartbeat comments, retry field, disconnect handling. Satisfies architecture §Enforcement: "Emit `AgentEvent`s through the typed builder in `apps/server/src/events/` — never `res.write(JSON.stringify(...))` raw" — `emit()` IS the typed builder; raw writes exist only inside it.

**Deferred item — re-evaluate `fastify-sse-v2` later.** If the upstream plugin adds comment support or our needs simplify (e.g., the orchestrator converts to an async-generator model), migrate then. Logged in `deferred-work.md` under Story 1.6.

### `reply.hijack()` contract

Fastify 5's normal response flow: handler returns → Fastify serializes → `reply.send()` runs the validators/hooks → socket write. For SSE, we bypass this:
- `reply.raw.writeHead(200, {...})` writes headers directly.
- `reply.hijack()` tells Fastify "this response is yours; don't touch it" — future `reply.send()` calls throw.
- We own `reply.raw` (Node's `http.ServerResponse`) for the stream's lifetime.
- Fastify's `onResponse` hook does **not** fire for hijacked replies — if any observability middleware depends on it, that middleware must be adapted to log stream close from our `onAbort` callback instead.

**Gotcha:** throwing inside the handler **after** `reply.hijack()` does NOT route to `errorHook` — Fastify's error handling is bypassed for hijacked replies. The emitter's `close()` + Pino log is our only observability for stream-tier errors. Guard all emit paths with try/finally in route handlers.

### SSE wire format (spec-exact)

Per the [HTML spec EventSource section](https://html.spec.whatwg.org/multipage/server-sent-events.html):
```
event: message.delta\n
data: {"type":"message.delta","message_id":"m1","delta":"x"}\n
\n
```
- Each field line ends with `\n` (LF), not `\r\n`.
- A blank line (`\n`) terminates the event.
- Comments start with `:` and end with `\n`; two `\n` terminate the comment.
- Multi-line `data:` is supported (each line prefixed with `data:`) but we always emit single-line JSON — never pretty-print.
- The `retry:` field sets the client's reconnect delay in ms (EventSource default is browser-specific, typically 3s). We set `retry: 1000` once at stream open to match AC6.
- `id:` field is unused this story — session-resume via `Last-Event-ID` is not yet wired (Story 5.5 will).

**`buildSseFrame` implementation must NOT introduce extra newlines inside `data:`.** If `JSON.stringify(event)` contained a newline (impossible for JSON numbers/strings/objects, possible only for pathological string values containing `\n`), the second line would parse as a new field and break the event. JSON.stringify escapes `\n` inside strings to `\\n`, so this is safe — but add a unit test that asserts `buildSseFrame` output contains exactly two `\n` characters at the end.

### EventSource limitations — why a parallel `fetch`-based path is NOT built now

Native `EventSource`:
- GET-only — cannot POST.
- No custom headers (no Authorization). Not an issue (no auth).
- Sends `Accept: text/event-stream`.
- Auto-reconnects.
- Fires typed events by `event:` name via `addEventListener(type, ...)`.
- Parses frames for you — no manual `\n\n` splitting in client code.

Story 1.7 introduces `POST /api/projects/:id/messages` that starts an orchestrator and streams its output. The pattern: client POSTs → server returns `{ sse_token }` → client opens `GET /api/sse/:sse_token` via EventSource to subscribe. The echo route this story establishes is that pattern's test vehicle.

**If a future story needs POST + stream in a single request** (unlikely but possible for file upload + progress streaming), a separate `fetch` + ReadableStream parser would be added alongside EventSource. For now, one transport.

### Heartbeat rationale (AC1)

Proxies (nginx, Caddy, corporate middleboxes) and browsers sometimes time out idle HTTP connections after 30-60s. Sending a comment `: keep-alive` every 15s keeps the connection marked active without emitting a visible event. SSE clients (including `EventSource`) discard comment lines — no visible UI impact.

**Why 15s and not 10 or 30?** 15s is comfortably below the most aggressive common idle timeout (30s default on AWS ALB; Cloudflare 100s) and high enough that the per-minute overhead is minimal (4 comments/minute × ~20 bytes each = 80 bytes/minute). Configurable via `heartbeatIntervalMs` option on `createSseHandle` for tests (which use shorter intervals to avoid waiting).

### AbortController for downstream work (Story 1.7 preview)

`createSseHandle` does not construct an `AbortController` this story (no downstream async work to cancel — the echo route uses local `setTimeout` only). Story 1.7 adds `abortController: AbortController` to `CreateSseHandleOptions` so the orchestrator's `invoke(signal)` call participates in cancellation. For this story, the shape is:

```ts
export interface CreateSseHandleOptions {
  reply: FastifyReply;
  request: FastifyRequest;
  onAbort?: () => void;
  heartbeatIntervalMs?: number;
  // Future: abortController?: AbortController;
}
```

The `onAbort` callback is the extension point — Story 1.7 attaches `abortController.abort()` there.

### Reconnect semantics — EventSource + server `retry:` field

The browser's `EventSource` auto-reconnects on any non-2xx or socket error:
1. Initial open: `readyState: CONNECTING` → `OPEN` (fires `onopen`).
2. Socket drops mid-stream: `readyState: OPEN` → `CONNECTING`; `onerror` fires (NOT `onclose` — `EventSource` has no `onclose`).
3. Browser waits `retry` ms (default 3s, our server sets 1000ms) then reopens.
4. If reopen succeeds: `onopen` fires; resumption is stateless (no `Last-Event-ID` this story). If fails: `onerror` fires again with `readyState: CONNECTING`; browser retries again.
5. If the server returns **non-2xx** (e.g., 404, 500): `readyState` transitions to `CLOSED`; `onerror` fires; EventSource gives up permanently.

Our wrapper in `openAgentEventStream` counts `consecutiveErrors`. On reaching 2 (or seeing `readyState === CLOSED`), we call `es.close()` and surface `onError`. This matches AC6's "one retry with backoff" semantics — the first `onerror` triggers the browser's built-in retry (silent to our consumer), the second tears down.

**Why not disable the browser's retry entirely?** That would require server-side `retry: 0` or `Connection: close` — we'd lose the default's value for mobile-network blips. Letting one retry happen silently is the right tradeoff.

### Event-to-component mapping (future stories — do NOT wire now)

Per architecture §Frontend Architecture §Event-to-component mapping (slightly adapted to our `AgentEvent` variants):

| Event variant | Destination component/slice | Story |
|---|---|---|
| `message.delta` | `ChatView` / Chat store | 1.8 |
| `thinking.*` | `ThinkingBlock` inside `ChatMessage` | 1.10 |
| `tool_call.*` | `ToolCallRow` inside `ChatMessage` | 1.10 |
| `cost.update` | `CostMeter` / status bar | 1.11 |
| `context.update` | `ContextHealthGauge` | 5.1 |
| `error` | Toast framework (Story 1.12) + inline badge | 1.12 |
| `done` | Finalize message + re-enable input | 1.8 |
| `subagent.*` | `SkepticPanel` sidebar tab | 3.1+ |
| `skeptic.challenge` | Inline skeptic bubble + `SkepticPanel` | 3.2 |
| `stream.cancelled` | Chat message `[interrupted]` marker | 1.8 |

This story creates the **dispatcher scaffolding** in `agentEventDispatcher.ts` (Task 6) with handler slots for each variant; no store wiring happens now. Each future story wires its slice into the relevant handler.

### Architecture vocabulary mismatch — use shared types as truth

Architecture §Naming Patterns §Event naming (line 448) lists the "Locked Phase 1 vocabulary" as: `message.token · thinking.start · thinking.delta · thinking.end · tool.started · tool.completed · subagent.started · subagent.event · subagent.completed · skeptic.challenge · cost.update · context.update · error · response.complete`.

`packages/shared/src/events.ts` (frozen in Story 1.2) uses:
- `message.delta` (not `message.token`)
- `tool_call.start` / `tool_call.end` (not `tool.started` / `tool.completed`)
- `done` (not `response.complete`)
- Adds `stream.cancelled` (not in architecture list)

**`packages/shared` is the authority** — it's what every implementation imports; architecture prose cannot override it at this stage. Story 1.2's retrospective acknowledged this drift; no corrective action was taken because renaming would break every downstream consumer that already imports the Story 1.2 types.

**Dev agent must use the shared-types names.** Any "be faithful to architecture vocabulary" reflex is **wrong** here — architecture was the prescription, shared types were the implementation, and implementation won.

### Latest tech information (verified 2026-04-23)

- **`@fastify/sse-v2` package**: does NOT exist on npm (verified via web search). `fastify-sse-v2` by mpetrunic is the closest community package; see Dev Notes §"SSE plugin choice" for rationale to skip it.
- **Fastify 5 `reply.hijack()`**: unchanged API from Fastify 4. `reply.raw.writeHead(status, headers)` + `reply.hijack()` + direct writes to `reply.raw` is the canonical streaming pattern. No plugin required.
- **Fastify 5 `app.inject({ payloadAsStream: true })`**: returns `{ payload: Readable }` — the Readable is Node's stream, iterable via `for await`. Chunk boundaries do NOT align with SSE frame boundaries — accumulate into a buffer and split on `\n\n`.
- **EventSource in jsdom v25**: present but the implementation is minimal — it opens a real network connection. Tests should mock `global.EventSource` with a minimal stub class rather than relying on jsdom's EventSource + intercepting fetch. The stub's shape:
  ```ts
  class MockEventSource {
    readonly url: string;
    readyState = 0; // CONNECTING
    onopen: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    close = vi.fn();
    addEventListener = vi.fn();
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    constructor(url: string) { this.url = url; }
  }
  vi.stubGlobal('EventSource', MockEventSource);
  ```
- **Node 20 `http.ServerResponse.writeHead`** signature accepts a headers object; setting `Content-Type: text/event-stream` here is sufficient to start streaming — Node flushes headers on first `write()`.

### Previous-story intelligence (Stories 1.1 → 1.5)

**Patterns established that this story reuses:**
- **Co-located unit tests** (`foo.test.ts` next to `foo.ts`) — maintain. All new `.test.ts` files go next to their implementation.
- **`AppError` throw + errorHook**: every thrown server-side error is `AppError` with a valid `ErrorCode`. No bare `throw new Error(...)` — Story 1.3 established; still applies. Emitter's "stream already closed" throws `AppError('internal', ..., { status: 500 })`.
- **Fastify JSON Schema for query/body validation**: Story 1.5 Task 5 pattern — inline schema object + `as const` + `schema: { querystring: ... }`. Task 4 of this story mirrors for `/api/sse/echo`.
- **`buildApp(env, logger, overrides)` signature**: Story 1.5 added `overrides.pineconeOverride`. This story does NOT extend `BuildAppOverrides` — no new override needed.
- **`app.inject`-based integration tests**: every Fastify route tested through `app.inject`, not by spinning up a listening server. Task 4's echo test follows the same approach with `payloadAsStream: true`.
- **Temp `dataRoot` per test** (Story 1.5 `os.tmpdir()` pattern): not needed this story — no disk writes in SSE path.
- **Zustand store with `immer` is NOT yet required** — Session store is still simple enough that `set({ field })` works. If the dispatcher grows a real slice in a future story, add `immer` middleware then.
- **Server split tsconfig** (Story 1.5 added `tsconfig.test.json` with `rootDir=.` for tests): tests under `apps/server/src/events/*.test.ts` and `apps/server/src/routes/sse.test.ts` are already in `src/` so the build tsconfig covers them. No split-config changes.
- **`vitest.config.ts` include** (Story 1.5 extended to `tests/**/*.{test,spec}.ts`): already covers new tests under `src/`. No changes.
- **Web `QueryWrapper.tsx` helper**: not needed this story (SSE tests don't use TanStack Query).

**Deferred items this story closes:**
1. **Story 1.5 AC7(d) — in-flight request cancellation on project switch.** Task 7 wires `closeAllAgentEventStreams()` into `setProjectId`. Remove from `deferred-work.md`.
2. **Story 1.1 deferred item: `vitest.config.ts` `include` missing `tests/`.** Story 1.5 already closed this (Task 7 of 1-5). This story no-ops on it; confirm it's gone from `deferred-work.md`.

**Deferred items this story explicitly leaves:**
- `api<T>` sets `content-type` on GET/DELETE (deferred 1.5) — not touched; SSE doesn't go through this wrapper.
- `showFirstLaunch` error-state behavior (deferred 1.5) — not touched.
- `AppError.status` HTTP range validation (deferred 1.3) — not addressed.
- `ensureIndex` outside serialize lock (deferred 1.5) — not touched.
- `create` reserved-namespace dead code (deferred 1.5) — not touched.

### Test environment notes

- **Fake timers for heartbeat tests**: use `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })` and `vi.advanceTimersByTime(15_000)` to assert heartbeat emission without a 15-second real wait. Restore with `vi.useRealTimers()` in `afterEach`.
- **Fastify `app.inject` + streams**: the returned `payload` is a `Readable`. To collect frames: `const chunks: string[] = []; for await (const chunk of res.payload) chunks.push(chunk.toString('utf8')); const raw = chunks.join('');`. Split on `\n\n` to get events; split each event on `\n` to get field lines.
- **Pino silent logger in tests**: use the existing `apps/server/src/logging/` silent mode (from Story 1.3's test patterns) so test output isn't polluted.
- **Zustand store reset between tests**: `useSessionStore.setState({ projectId: null })` in `afterEach` — matches the Story 1.5 pattern.
- **`vi.stubGlobal('EventSource', MockEventSource)` cleanup**: `vi.unstubAllGlobals()` in `afterEach`.
- **`console.warn` spy**: `const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);` + `warnSpy.mockRestore()` in `afterEach`. The parser tests use this extensively.

### What this story does NOT do (boundaries)

- **No Claude orchestrator.** Story 1.7 owns the orchestrator + actual message route. The echo route this story ships is a test harness, not a production route.
- **No chat-store wiring.** The dispatcher has handler slots for every `AgentEvent` variant but the handlers are either undefined or no-op stubs. Story 1.8 populates Chat-store handlers; Story 1.10 populates thinking/tool-call handlers; Story 1.11 populates cost-meter handler; etc.
- **No `Last-Event-ID` / resume.** Story 5.5 (resume protocol) adds this. The echo route does not set `id:` fields.
- **No toast framework.** Story 1.12. `error` events dispatch through the dispatcher but the consumer-side handler is undefined — Story 1.12 wires it.
- **No `StreamingTokenDisplay` or caret UI.** Story 1.8.
- **No cost calculation.** The `cost.update` event from the echo route emits hard-coded zeros. Story 1.11 owns real cost math.
- **No `ContextUpdateEvent` emission logic.** Story 5.1 owns the context gauge. The echo route does **not** emit `context.update` (skipped deliberately from the AC7 sequence — the type is in the union but no production code emits it this story).
- **No session store / Pinecone session persistence.** Echo route invents a throwaway `message_id` per request; no session record lands anywhere. Story 1.7 wires the session model.
- **No `retry:` field dynamic tuning.** Set once at 1000ms; future tuning (e.g., 5s for mobile) is out of scope.
- **No compression.** `Content-Encoding: gzip` over SSE is problematic (buffers until the compression flush). We explicitly set `Cache-Control: no-transform` to hint proxies against compression. If Fastify's default compression plugin (not currently registered) were added later, it must skip SSE responses.

### Project Structure Notes

**New files (server):**

| File | Purpose |
|---|---|
| `apps/server/src/events/index.ts` | Barrel: `export * from './emit.js'` |
| `apps/server/src/events/emit.ts` | `createSseHandle`, `buildSseFrame`, `buildSseComment` |
| `apps/server/src/events/emit.test.ts` | Unit tests: every `AgentEvent` variant, close behavior, heartbeat, `@ts-expect-error` negative test |
| `apps/server/src/routes/sse.ts` | `registerSseRoutes`, `GET /api/sse/echo` |
| `apps/server/src/routes/sse.test.ts` | Integration test: 9-event sequence, bad-token, disconnect |

**Modified files (server):**

| File | Change |
|---|---|
| `apps/server/src/routes/index.ts` | Import + call `registerSseRoutes(app)` alongside existing route registrations |

**New files (web):**

| File | Purpose |
|---|---|
| `apps/web/src/api/sse.ts` | `openAgentEventStream`, `closeAllAgentEventStreams`, module-scoped registry |
| `apps/web/src/api/sse.test.ts` | Parser + narrowing + reconnect + registry tests (MockEventSource stub) |
| `apps/web/src/api/agentEventDispatcher.ts` | `dispatchAgentEvent` with handler slots per variant |
| `apps/web/src/api/agentEventDispatcher.test.ts` | One test per variant + exhaustiveness |

**Modified files (web):**

| File | Change |
|---|---|
| `apps/web/src/features/Session/store.ts` | `setProjectId` now calls `closeAllAgentEventStreams()` before state transition |
| `apps/web/src/features/Session/store.test.ts` | New file — assert `closeAll` called before `projectId` changes (creates file if not present) |

**Modified files (shared):** None.

**Deleted files:** None.

**Outside `apps/server/`, `apps/web/`, `packages/shared/`:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — workflow updates `1-6-*` status to `ready-for-dev` at story creation, then dev/review update further.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append a "Story 1.6 evaluate `fastify-sse-v2` migration" entry; remove the "Story 1.5 AC7(d) in-flight request cancellation" entry (closed by Task 7 this story).

### Conflicts and clarifications surfaced this story

These are flagged for the dev agent to follow without re-litigating; they are spec inconsistencies the architecture-vs-epic-vs-shared-types docs left ambiguous, resolved here:

1. **SSE plugin package name.** Architecture and Epic 1 AC1 reference `@fastify/sse-v2`; the package does not exist on npm. **Resolution:** ship a typed emitter over `reply.raw` (no plugin). See Dev Notes §"SSE plugin choice." The phrase "Given `@fastify/sse-v2` is installed" in the epic AC is reinterpreted as "Given the SSE emitter is in place." Update this line of the AC is handled by AC1 in this story file (no mention of the plugin).

2. **Event vocabulary.** Architecture §Event naming lists `message.token`, `tool.started`, `tool.completed`, `response.complete`. Shared types use `message.delta`, `tool_call.start`, `tool_call.end`, `done`. **Resolution:** shared types win (Story 1.2 locked them; architecture's ADR was pre-implementation). Use shared-types names. Architecture prose should be updated in a future doc pass — out of scope this story.

3. **`context.update` emission.** Architecture lists `context.update` in the locked vocabulary. Shared types include it. This story's echo route does NOT emit it (deliberate — the context gauge backend logic is Story 5.1's scope). **Resolution:** the event type exists in the union and is supported by the emitter/dispatcher; no production code emits it this story. The unit test still covers `buildSseFrame` for `context.update` via the exhaustive table.

4. **"Zustand-backed SSE subscriber" (AC3 language in epic).** Epic AC language implies each event routes to a Zustand slice action. **Resolution:** dispatcher handlers are callback-based this story, not store-dispatching. Each future story adds its own store + handler. Rationale in Dev Notes §"Event-to-component mapping" and Task 6's `Why handlers instead of store dispatches now`.

### References

- [epics.md §Story 1.6](../planning-artifacts/epics.md) — source of primary ACs
- [architecture.md §API & Communication Patterns](../planning-artifacts/architecture.md) — SSE transport choice, per-dependency resilience
- [architecture.md §Naming Patterns §Event naming](../planning-artifacts/architecture.md) — event vocabulary (superseded by shared types)
- [architecture.md §Backend module boundaries](../planning-artifacts/architecture.md) — `events/`, `routes/`, `errors/` folder responsibilities
- [architecture.md §Enforcement Guidelines](../planning-artifacts/architecture.md) — "typed builder in `events/`; never `res.write(JSON.stringify(...))` raw"
- [architecture.md §Error handling](../planning-artifacts/architecture.md) — `AppError` + `ErrorCode`; silent-catch anti-pattern
- [architecture.md §Format Patterns §API response envelopes](../planning-artifacts/architecture.md) — SSE events typed via `AgentEvent`, no additional wrapper
- [architecture.md §Test organization](../planning-artifacts/architecture.md) — co-located unit; `tests/integration/` gated by `INTEGRATION=1`
- [1-5-project-crud-projectswitcher-pinecone-namespace-bootstrap.md](./1-5-project-crud-projectswitcher-pinecone-namespace-bootstrap.md) — Pinecone + JSON-store + Session store + ProjectSwitcher patterns
- [1-4-frontend-shell-dark-theme-direction-b-layout.md](./1-4-frontend-shell-dark-theme-direction-b-layout.md) — layout shell + Zustand baseline
- [1-3-fastify-server-bootstrap.md](./1-3-fastify-server-bootstrap.md) — Fastify factory + error hook + env schema + test patterns
- [1-2-shared-types-package.md](./1-2-shared-types-package.md) — `AgentEvent` union + `ErrorCode` + branded ID types
- [packages/shared/src/events.ts](../../packages/shared/src/events.ts) — `AgentEvent` union (15 variants, frozen in 1.2)
- [packages/shared/src/errors.ts](../../packages/shared/src/errors.ts) — `ErrorCode` union including `internal`, `invalid_input`
- [packages/shared/src/ids.ts](../../packages/shared/src/ids.ts) — `UuidV4`, `MessageId`, `SessionId` branded types
- [apps/server/src/errors/AppError.ts](../../apps/server/src/errors/AppError.ts) — throw pattern
- [apps/server/src/routes/projects.ts](../../apps/server/src/routes/projects.ts) — Fastify JSON Schema reference
- [apps/web/src/api/client.ts](../../apps/web/src/api/client.ts) — fetch wrapper (SSE is a peer module, not a consumer)
- [apps/web/src/features/Session/store.ts](../../apps/web/src/features/Session/store.ts) — store to extend in Task 7
- [HTML spec — EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html) — SSE wire format reference
- [deferred-work.md](./deferred-work.md) — items closed (AC7(d) in-flight cancellation) and items intentionally left

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- **Fastify `app.inject({ payloadAsStream: true })` — stream access API.** The returned object exposes the response stream via `res.stream()` (a method), not `res.payload` (a property). All SSE integration tests use `(res as unknown as { stream: () => NodeJS.ReadableStream }).stream()` to read the body. The story Dev Notes §"Test environment notes" said "for await (const chunk of res.payload)" — Fastify 5 with `payloadAsStream` uses `res.stream()` instead.
- **ESLint `@typescript-eslint/no-unnecessary-condition` on `isClosed` guards.** Early drafts of `apps/server/src/routes/sse.ts` had `if (handle.isClosed) return;` between every `await wait()` / `handle.emit()` pair. The TS control-flow narrows `isClosed` as `true` immediately after `close()` and as `false` otherwise within a straight-line function, so the guards were all flagged "unnecessary." Final shape: let the emit throw `AppError('internal', 'stream already closed', { status: 500 })` from the emitter after abort, catch it once in the outer `try/catch`, and drop to `finally { handle.close(); }`.
- **ESLint `no-confusing-void-expression` on test arrow shorthands.** `expect(() => handle.emit(...)).toThrow()` and `expect(() => dispatchAgentEvent(event, {})).not.toThrow()` both trigger the rule because the arrow returns `void`. Wrapped each in braces: `expect(() => { handle.emit(...); }).toThrow()`.
- **Pre-existing `FirstLaunchDialog` test races (2 tests).** Two tests in `apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.test.tsx` used `screen.getByTestId('create-project-form')` before TanStack Query had resolved the `/api/projects` mock fetch. Confirmed pre-existing via `git stash` on the Story 1.6 edits — they already failed on Story 1.5 HEAD. Fixed opportunistically as part of this story's gate-green work: switched to `findByTestId` on the same assertions. No business-logic change.

### Completion Notes List

- **SSE plugin choice stands — no `fastify-sse-v2` dependency added.** See Dev Notes §"SSE plugin choice." The typed emitter in `apps/server/src/events/emit.ts` (~120 lines) is the sole writer to `reply.raw`. Emission from handler sites goes through `handle.emit()` only.
- **Event discriminator wiring is exhaustive by construction.** The server emit tests and the client dispatcher tests both key off `Record<AgentEvent['type'], AgentEvent>` and `Record<AgentEvent['type'], keyof AgentEventHandlers>` tables. Adding a new `AgentEvent` variant in `@bp/shared` without updating these tables fails `tsc` in both apps — enforcement by construction, not by convention.
- **Client reconnect semantics.** One silent retry is allowed (the browser's default `EventSource` retry, which our server's `retry: 1000` field calibrates). `consecutiveErrors >= 2` or `readyState === EventSource.CLOSED` tears down and surfaces `onError({ code: 'internal', message: 'sse stream unreachable', retryable: true })` + `onClose()`. `onopen` resets the counter so a later transient blip still gets one silent retry.
- **Session-store order invariant is tested.** `apps/web/src/features/Session/store.test.ts` uses a mock whose implementation records call order into an array and asserts `closeAllAgentEventStreams()` runs before the `projectId` transition.
- **Bundle delta: essentially zero.** Web build output grew by the dispatcher/transport source only (native `EventSource`, no polyfill). `dist/assets/index-*.js` 370.60 kB (117.45 kB gzipped) vs. Story 1.5 baseline ≈ same.
- **New test counts.** Server: +35 new tests (emit: 30, sse route: 5). Web: +43 new tests (dispatcher: 30, sse transport: 10, session-store order: 3). Full counts: server 59 passed / 3 skipped (integration gated), web 60 passed.
- **Full gate green at review time.** `pnpm typecheck` / `pnpm lint` / `pnpm -r test` / `pnpm --filter @bp/shared build` / `pnpm --filter @bp/web build` all exit 0.
- **Deferred item closed.** Story 1.5 AC7(d) "in-flight request cancellation on project switch" is now wired via `closeAllAgentEventStreams()` in `setProjectId`. `deferred-work.md` updated.
- **Deferred item added.** "Re-evaluate `fastify-sse-v2` migration" — log in `deferred-work.md` for when/if the plugin's API evolves to support comment frames and Fastify 5 peer-dep is explicit.
- **Manual smoke — user-runnable.** Commands:
  - `pnpm dev` (starts web + server).
  - Browser: `http://127.0.0.1:3000/api/sse/echo?token=550e8400-e29b-41d4-a716-446655440000` → DevTools → Network → EventStream tab; expect the 9-event AC7 sequence in order within ~200ms.
  - `curl -N 'http://127.0.0.1:3000/api/sse/echo?token=550e8400-e29b-41d4-a716-446655440000'` → after 15s a `: keep-alive` comment frame appears in the raw stream.
  - Cancellation: `curl -N '...' & sleep 1 && kill $!` → server log `{event:"stream.cancelled",reason:"client_disconnect",...}` within 500ms.
  - Bad token: `curl -sS 'http://127.0.0.1:3000/api/sse/echo?token=not-a-uuid'` → HTTP 400 + JSON `invalid_input` envelope.
- **Vite proxy verified (no change required).** The existing `apps/web/vite.config.ts` proxy for `/api` passes SSE through without buffering; no `configure` hook added.

### File List

**New files (server):**
- `apps/server/src/events/index.ts`
- `apps/server/src/events/emit.ts`
- `apps/server/src/events/emit.test.ts`
- `apps/server/src/routes/sse.ts`
- `apps/server/src/routes/sse.test.ts`

**Modified files (server):**
- `apps/server/src/routes/index.ts` (registers `registerSseRoutes(app)`)

**New files (web):**
- `apps/web/src/api/sse.ts`
- `apps/web/src/api/sse.test.ts`
- `apps/web/src/api/agentEventDispatcher.ts`
- `apps/web/src/api/agentEventDispatcher.test.ts`
- `apps/web/src/features/Session/store.test.ts`

**Modified files (web):**
- `apps/web/src/features/Session/store.ts` (calls `closeAllAgentEventStreams()` before `setProjectId` state transition)
- `apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.test.tsx` (opportunistic fix: `getByTestId` → `findByTestId` for 2 pre-existing race failures)

**Modified files (shared):** None.

**Deleted files:** None.

**Outside app trees:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1.6 → review)
- `_bmad-output/implementation-artifacts/deferred-work.md` (close AC7(d); add fastify-sse-v2 re-eval)

### Change Log

| Date       | Version | Change                                                                                      | Author |
|------------|---------|---------------------------------------------------------------------------------------------|--------|
| 2026-04-23 | 0.1.0   | Story created — status: ready-for-dev                                                       | sm     |
| 2026-04-23 | 0.2.0   | Implementation complete; all 11 ACs satisfied; tests + gate green; status: review           | dev    |
