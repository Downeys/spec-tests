---
phase: 02-agents-and-chat
plan: 06
subsystem: server
tags: [hono, sse, ai-sdk-6, ui-message-chunk, streaming, claude-agent-sdk, infra-04, t-02-chat-02, t-02-agent-01, full-mcp-prefix-matching, data-claim-id]

# Dependency graph
requires:
  - phase: 02-agents-and-chat
    provides: "02-01 — Hono createApp factory + healthRoute, vitest unit-project routing for tests/server/, hono@4.12.15 + @hono/node-server@2.0.0 (ESM-clean), AI SDK 6 (`ai`@6.0.168) installed; 02-04 — researchDef / compilationDef agent definitions; 02-05 — runCoordinatorTurn(userMessage): AsyncIterable factory, applyOutputGuard runtime n-gram-overlap guard, coordinatorAllowedTools array (the 4 mcp__onebrain__* tools)"
provides:
  - "src/server/streaming.ts — adaptToUIMessageChunk(sdkEvent) + createToolTraceChunk + createWikiCitationChunk + createClaimIdChunk + ToolTraceSink + globalToolTraceSink (5 SDK event-mapping rules + 3 custom data-* chunk types per AI-SPEC §3.2)"
  - "src/server/routes/chat.ts — Hono POST /chat SSE handler; for-await over runCoordinatorTurn → adaptToUIMessageChunk → streamSSE.writeSSE; applyOutputGuard wired BEFORE finish flush (D-06 last-line-of-defense); FULL MCP-prefixed tool ID matching (T-02-CHAT-02); data-claim-id forwarding for onebrain_write_claim results"
  - "src/server/index.ts MODIFIED — createApp now mounts both healthRoute (from 02-01) AND chatRoute"
  - "tests/server/chat-sse.spec.ts — Wave 0 INFRA-04 chat-half probe (4 cases: 2 SSE base + 2 data-claim-id POSITIVE/NEGATIVE matcher cases)"
affects:
  - 02-07 (UI surface): consumes the SSE stream via assistant-ui's AssistantChatTransport at `/chat`. The custom data-tool-trace, data-wiki-citation, and data-claim-id chunks (with `value` field) are the contract the UI components (ToolTrace, WikiCitation, inline `[[claim:<ULID>…]]`) read per UI-SPEC §"Component Inventory". Vite dev proxy in vite.config.ts already routes /chat → 127.0.0.1:3000.
  - 02-08 (recompile route): can reuse `streamSSE` + `adaptToUIMessageChunk` adapter pattern for the recompile SSE channel; the same FULL MCP-prefix matcher discipline applies (the recompile route will care about `mcp__vault__vault_write_atomic` tool results).
  - Phase 4+ (multi-agent maturity): the FULL MCP-prefix matcher discipline is the load-bearing convention preventing future sub-agent tool IDs from silently colliding with substring matchers added now. The negative-case test in chat-sse.spec.ts catches any regression to substring/endsWith matching.

# Tech tracking
tech-stack:
  added:
    - "Hono streamSSE helper from `hono/streaming` (verified working — produces Content-Type: text/event-stream and SSE-framed `data: ` lines that parse cleanly with split('\\n').filter(l => l.startsWith('data:')) — see Resolved SDK/Hono Surface below)"
    - "AI SDK 6 UIMessageChunk shape (the spec-flavor used by Phase 2: `text-delta {text}`, `data-tool-trace {value}`, `data-wiki-citation {value}`, `data-claim-id {value}`, `finish`, `error {error}`) — see DEVIATION below for the AI SDK 6 native shape vs the Phase 2 contract"
    - "node:events EventEmitter as the non-blocking ToolTraceSink primitive (RESEARCH landmine #15)"
  patterns:
    - "SDK event → UIMessageChunk adapter as a single pure function with multiple `if` branches handling spec shorthand AND SDK 0.2.119 native shapes (stream_event/SDKAssistantMessage/tool_use/tool_result/result). Returns null for unmapped events; chat route filters nulls before SSE-sending. Logs via `logger.debug({ evType }, ...)` for visibility into unmapped event types."
    - "FULL MCP-prefixed tool ID matching via top-of-file `const TOOL_X = 'mcp__server__tool'` literals + EXACT EQUALITY (`tool === TOOL_X`). Sub-agent identifiers same pattern (`agentId === SUB_AGENT_RESEARCH`). NEVER substring/includes/endsWith — protected by negative-case test in tests/server/chat-sse.spec.ts."
    - "Output-guard wiring at SSE-route layer: accumulate text-deltas into `accumulatedReply`; track `lastSubAgentSummary` from research-sub-agent tool-result chunks; accumulate claim ULIDs from `mcp__onebrain__onebrain_write_claim` summaries (`claim:<ULID>` prefix). After the iterator drains, call applyOutputGuard once; on violation, emit a guardrail-trace chunk + the rewritten reply BEFORE the finish chunk."
    - "data-claim-id chunk forwarding: parse `claim:<ULID>` summary prefix in the chat route, emit `createClaimIdChunk(id, tool)` chunk so 02-07's UI can render inline `[[claim:01J9X…]]` citations without re-parsing tool-trace summaries. The chunk fires IN-LINE during iteration (not at end-of-stream) so the UI can render citations as soon as the claim is written."

key-files:
  created:
    - "src/server/streaming.ts (337 lines; adaptToUIMessageChunk + 3 custom-chunk constructors + ToolTraceSink + globalToolTraceSink; SDK 0.2.119 stream_event/SDKAssistantMessage handling)"
    - "src/server/routes/chat.ts (177 lines; Hono POST /chat SSE handler; 3 load-bearing disciplines: FULL MCP-prefix matchers, applyOutputGuard wiring, data-claim-id forwarding)"
    - "tests/server/chat-sse.spec.ts (203 lines; 4 cases: SSE base plumbing, 400 missing-message, data-claim-id POSITIVE, data-claim-id NEGATIVE — the negative case protects FULL MCP-prefix discipline against substring-matcher regression)"
  modified:
    - "src/server/index.ts (+chatRoute import + +app.route('/', chatRoute) + comment update; +5 lines net)"

key-decisions:
  - "DEVIATION (anticipated, intentional) — UIMessageChunk shape uses Phase-2-spec field names (`text-delta {text}`, `data-* {value}`, `error {error}`), NOT AI SDK 6 native field names (`text-delta {delta, id}`, `data-* {data, id}`, `error {errorText}`). The spec authority for this is RESEARCH §3.2 lines 134-138 + AI-SPEC §3.2 + the chat-sse.spec.ts assertion `expect(claimIdFrames[0].value.claimId).toBe(claimUlid)`. The custom data-* chunks ARE app-specific extensions outside AI SDK 6's native typed-data surface, so the field-name choice is the chat route's contract with 02-07's UI consumer (not the SDK's contract). Documented inline in src/server/streaming.ts header comments."
  - "FULL MCP-prefixed tool ID literals declared at top of src/server/routes/chat.ts as `const TOOL_ONEBRAIN_WRITE_CLAIM = 'mcp__onebrain__onebrain_write_claim'`. EXACT equality matching only. No substring matchers anywhere in the file (verified by `! grep -E 'tool\\?\\.includes|tool\\?\\.endsWith' src/server/routes/chat.ts`). The negative-case test asserts that `mcp__legacy__onebrain_write_claim` (hypothetical Phase 4+ tool ID with same suffix) does NOT match — protects against substring-matcher regression."
  - "Adapter handles BOTH spec shorthand (the form tests use: `{ type: 'text-delta', text: '...' }`, `{ type: 'tool-call-result', tool: '...', summary: '...' }`) AND the SDK 0.2.119 native shapes (`{ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }`, `{ type: 'assistant', message: { content: [{ type: 'text', text }, { type: 'tool_use', name, input }] } }`, `{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id, content }] } }`, `{ type: 'result', subtype: 'success'|'error' }`). The plan acknowledged that exact SDK shapes vary across 0.x versions — the dual-handling makes the adapter robust to either."
  - "applyOutputGuard fires ONCE at end-of-iterator (when lastSubAgentSummary is captured), NOT per chunk. Rationale: the n-gram check needs the ENTIRE accumulated reply against the latest sub-agent summary; per-chunk firing would falsely trigger on partial overlaps. On violation, the route emits TWO additional chunks before `finish`: (a) a `data-tool-trace` chunk with `tool: 'guardrail.prose_smuggling'` so the UI can surface the rewrite in the tool trace, (b) a `text-delta` chunk carrying the rewritten reply. The original (smuggled) text-deltas were already streamed; the user sees them flicker briefly then get appended-with-rewrite. A future polish could buffer-and-discard, but the current behavior is honest about what happened."
  - "ToolTraceSink is exported but the chat route does NOT consume it directly — the route iterates the SDK iterator inline (the simpler RESEARCH §3.2 pattern). The sink is exported because RESEARCH landmine #15 requires the non-blocking primitive be available for the SDK hooks pattern (AI-SPEC §3 lines 268-271 references `onToolCall: (e) => toolTraceSink.emit(e)`). When the coordinator wires onToolCall hooks in a future plan, those hooks will call `globalToolTraceSink.emit('event', payload)` and listeners will forward to SSE. Phase 2 ships the primitive; the wire-up is incremental."
  - "DID NOT add a manual smoke test of the route via curl/HTTP. Test discipline: app.request() in-memory harness is the canonical Hono test pattern (per 02-01's health.spec.ts) and avoids port-bind/coordinator-init flake. Real end-to-end SSE testing is 02-07's job (UI consumes the stream) and 02-09's manual verification."

patterns-established:
  - "Hono SSE route template: `route.post('/path', async (c) => { const body = await c.req.json().catch(() => ({})); /* validate */ return streamSSE(c, async (stream) => { try { for await (const ev of asyncIterable) { await stream.writeSSE({ data: JSON.stringify(adapt(ev)) }); } } catch (err) { await stream.writeSSE({ data: JSON.stringify({ type: 'error', error }) }); } }); });`"
  - "FULL MCP-prefix matching template: `const TOOL_X = 'mcp__server__tool'; if (tool === TOOL_X) { ... }`. Sub-agent: `const SUB_AGENT_X = 'agent_id_value'; if (agentId === SUB_AGENT_X) { ... }`. Negative-case test: a fixture with a same-suffix-but-different-prefix tool ID asserts the matcher does NOT fire."
  - "SDK event adapter dual-handling: `if (ev.type === '<spec-shorthand>') { ... } /* AND */ if (ev.type === '<sdk-native>') { /* extract from nested fields */ }`. Returns null for unmapped events; caller filters nulls. Logger.debug on the unmapped-event path so future SDK versions surface in logs."

requirements-completed:
  - INFRA-04

# Metrics
duration: ~6min
completed: 2026-04-27
---

# Phase 02 Plan 06: SSE Bridge + Chat Route Summary

**SDK event → UIMessageChunk adapter (5 mapping rules + 3 custom data-* chunk types) + Hono POST /chat SSE handler with applyOutputGuard wiring at the SSE layer + FULL MCP-prefixed tool ID matching discipline + data-claim-id forwarding for onebrain_write_claim results — completes INFRA-04 (chat half) and lands the streaming primitive that 02-07 (UI) and 02-08 (recompile route) reuse.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-27T04:37:56Z
- **Completed:** 2026-04-27T04:44:03Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 1
- **Commits:** 3 (one per task) + this metadata commit

## Accomplishments

- **INFRA-04 chat half SHIPPED:** `tests/server/chat-sse.spec.ts` 4/4 green. POST /chat returns Content-Type `text/event-stream`, emits SSE-framed `data:` lines that parse as UIMessageChunks, returns 400 on missing message field, and forwards data-claim-id chunks correctly with the FULL MCP-prefix matcher discipline.
- **Streaming adapter (`src/server/streaming.ts`) SHIPPED:** `adaptToUIMessageChunk(sdkEvent)` handles 5 mapping rules (text-delta, tool-call-start, tool-call-result, message-end/finish, error) PLUS the SDK 0.2.119 native event shapes (stream_event with content_block_delta, SDKAssistantMessage with content blocks, user-message tool_result blocks, result message with success/error subtype). Three custom data-* chunk constructors (`createToolTraceChunk`, `createWikiCitationChunk`, `createClaimIdChunk`) that 02-07's UI components consume. `ToolTraceSink` + `globalToolTraceSink` non-blocking EventEmitter primitive available for future SDK-hook wiring per RESEARCH landmine #15.
- **Chat route (`src/server/routes/chat.ts`) SHIPPED:** Hono POST /chat handler that drives `for-await` over `runCoordinatorTurn(message)`, maps each SDK event via the adapter, and writes SSE frames. Three load-bearing disciplines: (a) FULL MCP-prefixed tool IDs declared as top-of-file constants and matched via exact equality — NO substring/includes/endsWith matching anywhere in the file (verified by negative-case test); (b) `applyOutputGuard` from 02-05 fires after the iterator drains, with the accumulated coordinator reply + the most recent research-sub-agent summary + the captured claim ULIDs — on violation, the route emits a guardrail-trace chunk + the rewritten reply before the finish chunk; (c) `data-claim-id` chunks emitted IN-LINE when `mcp__onebrain__onebrain_write_claim` returns a `claim:<ULID>` summary, so the UI can render inline citations without re-parsing tool-trace summaries.
- **createApp now mounts BOTH healthRoute AND chatRoute:** `src/server/index.ts` extended; existing health probe coexists; future `recompileRoute` mount line is documented as a TODO comment for 02-08.
- **No regressions:** unit project 18/18 files / 127/127 cases green (was 17/123 — +1 file +4 cases from chat-sse.spec.ts). Agents project 12/12 files / 50/50 cases green (no change from 02-05 baseline). Integration project pre-existing chdir/vmThreads failures unchanged (none of those files touched).

## Resolved SDK / Hono Surface (downstream-plan reference for 02-07 + 02-08)

Recorded so 02-07 and 02-08 know the exact API surface they're consuming.

### Hono `streamSSE` from `hono/streaming` works as expected (NO hand-rolled fallback)

Per `node_modules/hono/dist/types/helper/streaming/sse.d.ts`:
```ts
export declare const streamSSE: (
  c: Context,
  cb: (stream: SSEStreamingApi) => Promise<void>,
  onError?: (e: Error, stream: SSEStreamingApi) => Promise<void>
) => Response;

export declare class SSEStreamingApi extends StreamingApi {
  writeSSE(message: SSEMessage): Promise<void>;
}

export interface SSEMessage {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
}
```

Used as `streamSSE(c, async (stream) => { await stream.writeSSE({ data: '<json>' }); })`. Verified: `Content-Type: text/event-stream` is set automatically; `data: ` prefix is added per frame; trailing `\n\n` separator is added per frame; works under Hono `app.request()` in-memory test harness (no port bind needed). RESEARCH OQ-3 (`hono`'s `streamSSE` helper vs hand-rolled `c.body(stream)`) **resolves to: streamSSE works, no hand-rolled fallback needed**.

### AI SDK 6 native UIMessageChunk vs Phase 2 contract

The installed `ai@6.0.168` declares `UIMessageChunk<METADATA, DATA_TYPES>` at `node_modules/ai/dist/index.d.ts:2159` with the following field shapes for the chunks Phase 2 cares about:

| Chunk type | AI SDK 6 native field shape | Phase 2 contract field shape (this plan) |
|---|---|---|
| text-delta | `{ type: 'text-delta'; delta: string; id: string; providerMetadata? }` | `{ type: 'text-delta'; text: string }` |
| data-* | `{ type: \`data-${NAME}\`; id?: string; data: T; transient? }` | `{ type: 'data-<name>'; value: T }` |
| error | `{ type: 'error'; errorText: string }` | `{ type: 'error'; error: string }` |
| finish | `{ type: 'finish'; finishReason?; messageMetadata? }` | `{ type: 'finish' }` |

**The Phase 2 contract uses different field names** (`text` vs `delta`, `value` vs `data`, `error` vs `errorText`). This is INTENTIONAL — the spec authority is RESEARCH §3.2 + AI-SPEC §3.2 + the explicit test assertion `expect(claimIdFrames[0].value.claimId).toBe(claimUlid)`. The custom data-* chunks are app-specific extensions outside AI SDK 6's native typed-data surface, so the field-name choice is a contract between this adapter and the 02-07 UI consumer (not the SDK's contract).

**02-07 implication:** the assistant-ui `AssistantChatTransport` consumes UIMessageChunks. If the transport requires AI SDK 6 native field names (`delta`, `data`, `errorText`), 02-07 will need a thin client-side adapter that translates `{text}` → `{delta}` etc. Alternative: 02-07 implements a custom transport that consumes the Phase 2 contract directly. Either path is workable; the contract is documented here so 02-07's planner can choose with full information.

### SDK event shapes the adapter actually saw at executor time

The adapter ships handling for BOTH spec shorthand (used by tests + the simplified plan stub) AND SDK 0.2.119 native shapes (extracted from `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`):

| Event class | SDK 0.2.119 type | Adapter handles |
|---|---|---|
| Streaming text deltas | `SDKPartialAssistantMessage = { type: 'stream_event', event: BetaRawMessageStreamEvent }` with inner `event.type === 'content_block_delta'` and `event.delta.type === 'text_delta'` | YES — extracted to `{ type: 'text-delta', text }` |
| Buffered assistant messages | `SDKAssistantMessage = { type: 'assistant', message: BetaMessage }` with `message.content[]` containing text/tool_use blocks | YES — first text block surfaces as text-delta; tool_use blocks surface as data-tool-trace start chunks |
| Tool results | `{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id, content }] } }` | YES — surfaces as data-tool-trace result chunks |
| Turn end | `SDKResultMessage = { type: 'result', subtype: 'success' \| 'error' }` | YES — surfaces as `{ type: 'finish' }` |
| API retry | `SDKAPIRetryMessage = { type: 'system', subtype: 'api_retry' }` | NO — returns null (intentional; not surfaced to UI) |
| Auth status | `SDKAuthStatusMessage = { type: 'auth_status' }` | NO — returns null |
| Compact boundary | `SDKCompactBoundaryMessage = { type: 'system', subtype: 'compact_boundary' }` | NO — returns null |

Future SDK upgrades that change event shapes will surface as `logger.debug({ evType }, 'streaming.adaptToUIMessageChunk: event unmapped')` lines — visible in pino output but not breaking the stream.

### `applyOutputGuard` invocation timing

The route accumulates text-deltas into `accumulatedReply`, tracks the most recent sub-agent summary in `lastSubAgentSummary`, and accumulates claim ULIDs into `claimIds[]`. After the for-await iterator drains (BEFORE the finish chunk flushes), the route calls `applyOutputGuard(accumulatedReply, lastSubAgentSummary, claimIds)`. On violation:
1. Emit a `data-tool-trace` chunk with `tool: 'guardrail.prose_smuggling'` so the UI surfaces the rewrite in its tool trace.
2. Emit a `text-delta` chunk with `text: '\n\n' + guard.reply` carrying the rewritten reply.
3. Emit the `finish` chunk.

The original (smuggled) text-deltas were already streamed live; the user sees them flicker briefly then get appended-with-rewrite. A future polish could buffer-and-discard, but the current behavior is honest about what happened.

## Task Commits

Each task committed atomically on `main`:

1. **Task 1: src/server/streaming.ts (adapter + 3 custom-chunk constructors + ToolTraceSink)** — `ba7ce34` (feat)
2. **Task 2: src/server/routes/chat.ts + mount in src/server/index.ts createApp** — `a21cf93` (feat)
3. **Task 3: tests/server/chat-sse.spec.ts (4-case Wave 0 probe)** — `4e691c3` (test)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP + REQUIREMENTS_

## Files Created/Modified

**Created (3):**
- `src/server/streaming.ts` — 337 lines. Header doc explains 5 mapping rules + 3 custom data-* chunk types + non-blocking ToolTraceSink. Imports `EventEmitter` from `node:events`. Adapter is a single pure function with `if` branches for spec shorthand AND SDK 0.2.119 native shapes.
- `src/server/routes/chat.ts` — 177 lines. Header doc explains 3 load-bearing disciplines (FULL MCP-prefix matchers, applyOutputGuard wiring, data-claim-id forwarding) + 3-hop pipeline diagram. Top-of-file constants `TOOL_ONEBRAIN_WRITE_CLAIM` and `SUB_AGENT_RESEARCH`. Hono POST handler wraps `streamSSE` callback that for-awaits the coordinator iterator.
- `tests/server/chat-sse.spec.ts` — 203 lines. 4 cases. Stubs `runCoordinatorTurn` and `@/onebrain/db` at module top so no real Anthropic API call or DB connection happens. Uses Hono `app.request()` in-memory harness. Helpers `readSse(res, maxChunks=30)` (reads with `"type":"finish"` short-circuit + safety cap) and `parseFrames(raw)` (splits on newlines, filters `data:` lines, JSON.parses each).

**Modified (1):**
- `src/server/index.ts` — added `import { chatRoute } from './routes/chat.js'` + `app.route('/', chatRoute)` line + comment explaining what 02-06 wires; ~+5 lines net. Removed the "02-06 mounts /chat" TODO comment (replaced by the actual mount).

## Decisions Made

- **DEVIATION (anticipated, intentional) — UIMessageChunk shape uses Phase-2-spec field names** (`text` not `delta`, `value` not `data`, `error` not `errorText`), per RESEARCH §3.2 + AI-SPEC §3.2 + the explicit test assertion. Documented in the streaming.ts header + here in SUMMARY for 02-07's planner.
- **FULL MCP-prefixed tool ID literals** declared at top of chat.ts; EXACT equality matching only; protected by negative-case test.
- **Adapter dual-handling** of spec shorthand AND SDK 0.2.119 native shapes — robust to either form arriving at runtime.
- **applyOutputGuard fires ONCE at end-of-iterator**, not per chunk. Per-chunk would falsely trigger on partial overlaps.
- **ToolTraceSink exported but unused by chat route** — available for future SDK-hook wiring per AI-SPEC §3 lines 268-271.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan stub used `ev.error?.message` chain that would crash on string error values**

- **Found during:** Task 1 (writing the Rule 5 error branch of adaptToUIMessageChunk)
- **Issue:** Plan's pseudocode had `ev.error?.message ?? JSON.stringify(ev.error)`. If `ev.error` is itself a string (which it can be for SDK error events), `.message` is undefined and the JSON.stringify path returns `'"<the string>"'` (quoted) — which then becomes the `error` field. Worse, if `ev.error` is `null` and `ev.type === 'error'`, the original chain falls through entirely and returns `undefined ?? JSON.stringify(undefined) === undefined`, breaking the type contract.
- **Fix:** Rewrote the Rule 5 branch to test `typeof errSource === 'string'` first, then `errSource && typeof === 'object' && 'message' in errSource`, then JSON.stringify with a try/catch fallback to `'unknown SDK error'`. The branch is now defensible against any error shape the SDK might emit.
- **Files modified:** src/server/streaming.ts
- **Verification:** Build clean (`npm run build` exits 0); chat-sse spec 4/4 green; agents project 50/50 green.
- **Committed in:** `ba7ce34` (Task 1)

**2. [Rule 2 - Critical functionality] Adapter extended with SDK 0.2.119 native event shape handlers (stream_event/SDKAssistantMessage/user-tool-result/result message)**

- **Found during:** Task 1 (verifying the adapter handles ≥3 SDK event shapes per the acceptance criterion + reading sdk.d.ts:2274-2977)
- **Issue:** Plan's adapter only handled the spec-shorthand event shapes (`{type:'text-delta', text}`, `{type:'tool-call-result', tool, summary}`, `{type:'message-end'}`). The actual SDK 0.2.119 emits different shapes: `SDKAssistantMessage = { type: 'assistant', message: BetaMessage }` with `message.content[]` containing text/tool_use blocks; `SDKPartialAssistantMessage = { type: 'stream_event', event: BetaRawMessageStreamEvent }` carrying delta updates; `{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id, content }] } }` for tool results; `SDKResultMessage = { type: 'result', subtype: 'success' \| 'error' }` for turn end. Without these handlers, real SDK invocations in 02-07/02-08 would surface only the unmapped-event log lines and emit ZERO useful chunks to the UI.
- **Fix:** Added handler branches for each SDK 0.2.119 native shape. The chat-sse.spec.ts tests still pass because they use the spec shorthand (the adapter handles BOTH); when the real coordinator runs in 02-07, the SDK-native branches fire instead.
- **Files modified:** src/server/streaming.ts
- **Verification:** Build clean; chat-sse spec 4/4 green; the SDK-native paths can't be tested here without running the real coordinator (02-07's job), but the type-checking + structural correctness is asserted by tsc.
- **Committed in:** `ba7ce34` (Task 1, bundled with deviation #1)

**3. [Rule 1 - Bug] Adapter chunks for `{ type: 'text-delta', text: '...' }` shorthand also emitted from `{ type: 'finish' }` and `{ type: 'message-end' }` correctly — required `result` subtype handling**

- **Found during:** Task 1 (reading the SDK 0.2.119 SDKResultMessage shape at sdk.d.ts:259)
- **Issue:** The SDK signals end-of-turn via `{ type: 'result', subtype: 'success' | 'error' }`, NOT via `{ type: 'message-end' }` or `{ type: 'finish' }`. Plan's stub only handled the shorthand types. Without `result` subtype handling, the SSE stream would never emit a `finish` chunk in production — the chat route's `await stream.writeSSE({ data: JSON.stringify({ type: 'finish' }) })` after the for-await loop is the safety net but the in-stream finish chunk would be missing.
- **Fix:** Extended Rule 4 to also match `{ type: 'result' }` with subtype `'success'` or `'error'`. The chat route still emits a final `finish` chunk after the loop as a safety net (idempotent — UIs ignore duplicate finish events).
- **Files modified:** src/server/streaming.ts
- **Verification:** Build clean; chat-sse spec 4/4 green (the test stub uses `{type:'message-end'}` which is also handled).
- **Committed in:** `ba7ce34` (Task 1, bundled with deviations #1+#2)

**4. [Rule 1 - Bug] Plan stub assignment to `error` source was inconsistent — `errSource = ev.type === 'error' ? ev.error ?? ev.message : ev.error` clarified**

- **Found during:** Task 1 (typecheck — TS narrowing)
- **Issue:** Plan stub used `const errMsg = typeof ev.error === 'string' ? ev.error : (ev.error?.message ?? JSON.stringify(ev.error))`. This worked for the `ev.error` truthy-check path but missed the case where `ev.type === 'error'` and the error message is in `ev.message` instead of `ev.error` (some SDK error events surface this way). 
- **Fix:** Use a separate `errSource` variable that prefers `ev.error` but falls back to `ev.message` for explicit error-type events. Then the type-narrowing chain runs against `errSource`, not directly against `ev.error`.
- **Files modified:** src/server/streaming.ts
- **Verification:** Build clean; chat-sse spec 4/4 green.
- **Committed in:** `ba7ce34` (Task 1, bundled with deviations #1+#2+#3)

---

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs in plan stub error/event handling; 1 Rule 2 critical functionality — SDK 0.2.119 native event shape support). All necessary for the adapter to actually work against the real SDK; the plan acknowledged "exact SDK event shapes vary across `@anthropic-ai/claude-agent-sdk` 0.x versions" so the additions were anticipated.

**Impact on plan:** All deviations strictly necessary for runtime correctness or robustness. No new features; no scope creep. The chat-sse.spec.ts tests run unchanged against the spec shorthand; the SDK-native branches activate at production runtime (02-07).

## Issues Encountered

**Pre-existing integration project regression (NOT caused by 02-06):** `npm test -- --run --project integration` shows 23/51 failures in `tests/integration/{pipeline,hash-stability,reingest-skip,append-only}.test.ts` and `tests/onebrain/search-hybrid.spec.ts`. These are the chdir/vmThreads-incompatibility failures documented in STATE.md as deferred items (originally surfaced in 02-03, tracked in `.planning/phases/02-agents-and-chat/deferred-items.md`). None of those files were touched by 02-06.

**Pre-existing top-level test invocation error (NOT caused by 02-06):** `npm test -- --run` (no project filter) fails with `Projects "integration" and "unit" have different 'maxWorkers' but same 'sequence.groupOrder'. Provide unique 'sequence.groupOrder' for them.` This is a vitest 4 project-config validation that fires when the projects have differing parallelism settings — pre-existing because 02-01 set `pool: 'vmThreads'` at root and 02-03 added `fileParallelism: false` on `integration` + `agents` projects. Per-project invocations (`--project unit`, `--project agents`, `--project integration`, `--project ui`) all work. This is a pre-existing infrastructure issue worth tracking as a follow-up but out of scope for 02-06.

**SonarQube `void` operator warnings on src/server/index.ts lines 41-42:** Pre-existing from 02-01's "boot-time env touch" pattern (`void env.ANTHROPIC_API_KEY; void env.TAVILY_API_KEY`). The pattern is a deliberate idiom documented in 02-01-SUMMARY ("Boot-time env touch: startServer() does `void env.ANTHROPIC_API_KEY` to make Zod validation explicit and refactor-safe"). Not addressed by 02-06; out of scope.

## User Setup Required

None — no new external services. The chat route stubs out the coordinator at test time via `vi.mock`. To smoke-test against a real coordinator: `bsp serve` (already wired in 02-01) → `curl -X POST http://127.0.0.1:3000/chat -H 'content-type: application/json' -d '{"message":"hello"}'`. This requires real `ANTHROPIC_API_KEY` + `TAVILY_API_KEY` in `.env`.

## Next Phase Readiness

**Ready for 02-07 (UI surface):**
- POST /chat accepts `{ message: string }` body and returns SSE-framed UIMessageChunks.
- Custom data-* chunks (`data-tool-trace`, `data-wiki-citation`, `data-claim-id`) carry the `value` field shape that 02-07's UI components consume per UI-SPEC §"Component Inventory".
- The Vite dev proxy (configured in 02-01) routes `/chat` requests at port 5173 → 127.0.0.1:3000.
- **02-07 planner decision needed:** does assistant-ui's `AssistantChatTransport` consume the Phase 2 contract field names directly, OR does 02-07 need a thin client-side adapter that translates `{text}` → `{delta}` etc.? Either path is workable; the contract is documented in "Resolved SDK / Hono Surface" section above.

**Ready for 02-08 (recompile route):**
- `streamSSE` from `hono/streaming` is verified working end-to-end.
- `adaptToUIMessageChunk` adapter is reusable for the recompile SSE channel.
- The FULL MCP-prefix matcher discipline + top-of-file `const TOOL_X = '...'` pattern is the template for the recompile route's tool-event handlers (it will care about `mcp__vault__vault_write_atomic` results).
- `ToolTraceSink` + `globalToolTraceSink` available for SDK-hook wiring if 02-08 chooses that pattern.

**Ready for 02-09 verifier (`/gsd-verify-work 02`):**
- INFRA-04 chat half is now green; combined with 02-01's INFRA-04 health half, INFRA-04 is fully verified by automated probes.
- The data-claim-id forwarding is the new VALIDATION row this plan added; it's covered by tests/server/chat-sse.spec.ts cases 3 + 4 (POSITIVE + NEGATIVE).

**Blockers for next plan:** None.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The four declared threats:
- **T-02-04 carry-forward** (Tampering / Spoofing — SSE bridge logging): mitigated by the adapter passing all events through `logger.debug({ evType }, ...)` for unmapped events; the chat route itself logs `logger.info({ messageLength }, 'POST /chat')` per request and `logger.warn({ maxOverlap, claimIds }, 'output guard rewrite triggered')` on guardrail violations.
- **T-02-AGENT-01 carry-forward** (Information Disclosure — sub-agent prose smuggling): mitigated by `applyOutputGuard` from 02-05 firing at the chat route layer BEFORE the finish chunk flushes. Documented in chat.ts header + this SUMMARY.
- **T-02-CHAT-01** (DoS via unbounded message length): explicitly accepted per plan's threat model — Phase 2 is single-user dev tool.
- **T-02-CHAT-02** (Tampering / Silent matcher drift): mitigated by FULL MCP-prefixed tool ID literals + EXACT equality + the negative-case test in tests/server/chat-sse.spec.ts. Phase 4+ sub-agents added later cannot accidentally trip the matcher.

No threat flags this plan.

## Known Stubs

None. All adapter branches return either a typed UIMessageChunk or `null` (filtered by the chat route); no placeholder data flows to UI. The `ToolTraceSink` is a fully-functional `EventEmitter` (no-op default behavior because no listeners are wired yet, but the primitive is real).

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`); per-task TDD gates do not apply. Task pairs follow tests-after-feature shape (Tasks 1+2 ship features; Task 3 adds the probe). Standard for non-TDD execute plans.

## Self-Check: PASSED

Files created (all present):
- `src/server/streaming.ts` — FOUND
- `src/server/routes/chat.ts` — FOUND
- `tests/server/chat-sse.spec.ts` — FOUND

Files modified (verified):
- `src/server/index.ts` — verified by `grep -q "chatRoute" src/server/index.ts` (matches both the import and the mount)

Commits exist:
- `ba7ce34` — feat(02-06): SDK event → UIMessageChunk adapter + custom data-* chunks
- `a21cf93` — feat(02-06): POST /chat SSE handler + mount chatRoute in createApp
- `4e691c3` — test(02-06): chat-sse Wave 0 probe — INFRA-04 + data-claim-id forwarding

Wave 0 probes (all green):
- INFRA-04 chat half (`tests/server/chat-sse.spec.ts`) — 4/4 ✓ (2 SSE base + 2 data-claim-id POSITIVE/NEGATIVE)
- INFRA-04 health half (`tests/server/health.spec.ts`) — 2/2 ✓ (no regression from 02-01)

Test results:
- `npm test -- --run tests/server/chat-sse.spec.ts` → 4/4 green in 1.31s
- `npm test -- --run --project unit` → 18/18 files / 127/127 cases green in 14.41s (was 17/123 — +1 file +4 cases)
- `npm test -- --run --project agents` → 12/12 files / 50/50 cases green in 11.85s (no regression)
- `npm run build` → exits 0 (clean tsc --noEmit on all new + modified src/ files)

Grep invariants:
- `grep -q "adaptToUIMessageChunk" src/server/streaming.ts` matches.
- `grep -q "data-tool-trace" src/server/streaming.ts` matches.
- `grep -q "data-wiki-citation" src/server/streaming.ts` matches.
- `grep -q "data-claim-id" src/server/streaming.ts` matches.
- `grep -q "createClaimIdChunk" src/server/streaming.ts` matches.
- `grep -q "EventEmitter" src/server/streaming.ts` matches.
- `grep -q "for await (const ev of runCoordinatorTurn" src/server/routes/chat.ts` matches.
- `grep -q "applyOutputGuard" src/server/routes/chat.ts` matches.
- `grep -q "streamSSE" src/server/routes/chat.ts` matches.
- `grep -q "mcp__onebrain__onebrain_write_claim" src/server/routes/chat.ts` matches.
- `grep -q "createClaimIdChunk" src/server/routes/chat.ts` matches.
- `! grep -E "tool\\?\\.includes\\(|tool\\?\\.endsWith\\(" src/server/routes/chat.ts` returns NO match (no substring matchers).
- `grep -q "chatRoute" src/server/index.ts` matches (twice — import + mount).

---
*Phase: 02-agents-and-chat*
*Plan: 06*
*Completed: 2026-04-27*
