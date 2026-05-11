// tests/server/chat-sse.spec.ts
// Wave 0 probe — VALIDATION row INFRA-04 (chat half).
// Spec authority:
//   .planning/phases/02-agents-and-chat/02-VALIDATION.md row INFRA-04 (line 252)
//   .planning/phases/02-agents-and-chat/02-RESEARCH.md §INFRA-04 + §3.2
//   .planning/phases/02-agents-and-chat/02-AI-SPEC.md §3.2 (UIMessageChunk contract)
//
// Uses Hono's app.request() with stubbed coordinator — no port bind required,
// no real Anthropic API call. Lives in tests/server/ so it runs in the unit
// project (per 02-01 Task 3's vitest.config extension).
//
// FOUR DESCRIBE BLOCKS:
//   (a) Base SSE plumbing: Content-Type, ≥1 data: frame, body parses as UIMessageChunk
//   (b) Validation: 400 on missing body.message
//   (c) data-claim-id POSITIVE: onebrain_write_claim with `claim:<ULID>` summary
//       MUST cause the route to forward a data-claim-id chunk carrying the ULID
//   (d) data-claim-id NEGATIVE: an unrelated tool ID whose suffix matches
//       `onebrain_write_claim` (e.g., a hypothetical `mcp__legacy__onebrain_write_claim`)
//       MUST NOT produce a data-claim-id chunk — protects the FULL MCP-prefix
//       matcher discipline (T-02-CHAT-02). A substring matcher would fail this case.

import { describe, it, expect, vi } from 'vitest';

// Module-level holder — individual tests overwrite stubbedEvents to drive the
// stubbed coordinator's event sequence. The vi.mock factory runs once at
// module-load time and the generator function reads stubbedEvents at iteration
// time (closes over the live binding).
let stubbedEvents: unknown[] = [];

// Stub coordinator BEFORE importing createApp so the route's
// `import { runCoordinatorTurn } from '@/agents/coordinator.js'` resolves to
// our generator (no real SDK init, no Anthropic API call).
vi.mock('@/agents/coordinator', () => ({
  runCoordinatorTurn: async function* () {
    for (const ev of stubbedEvents) yield ev;
  },
  coordinatorAllowedTools: [],
}));

// Stub DB so the health-route mount doesn't try to connect at module load.
// (createApp() mounts both healthRoute and chatRoute; healthRoute imports db.)
vi.mock('@/onebrain/db', () => ({
  db: { execute: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) },
}));

import { createApp } from '@/server/index';

// SSE body reader — Hono app.request() returns a Fetch Response whose body is
// a ReadableStream. Read up to maxChunks (safety cap to avoid hanging) or
// until we see a `"type":"finish"` frame (whichever comes first).
async function readSse(res: Response, maxChunks = 30): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let count = 0;
  while (count < maxChunks) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    count += 1;
    if (raw.includes('"type":"finish"')) break;
  }
  return raw;
}

// Parse SSE `data: <json>` lines into JS objects. Drops non-data lines and
// unparseable payloads (which we'd rather see as a clear assertion failure
// than silently ignore — record __unparseable so the test message names them).
function parseFrames(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice('data:'.length).trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return JSON.parse(s) as Record<string, unknown>;
      } catch {
        return { __unparseable: s };
      }
    });
}

describe('POST /chat SSE (INFRA-04)', () => {
  it('returns Content-Type text/event-stream and emits ≥1 data: frame', async () => {
    stubbedEvents = [
      { type: 'text-delta', text: 'Hello, ' },
      { type: 'text-delta', text: 'world.' },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/event-stream/);

    const raw = await readSse(res);
    expect(raw).toMatch(/data:/);

    const frames = parseFrames(raw);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]?.type).toBeDefined();

    // AI SDK 6 native shape: text-delta carries `delta` (not `text`) and an
    // `id` linking it to text-start/text-end bookends.
    const textStartFrames = frames.filter((f) => f.type === 'text-start');
    expect(
      textStartFrames.length,
      `expected exactly 1 text-start frame, got: ${JSON.stringify(frames)}`,
    ).toBe(1);
    const streamId = textStartFrames[0]?.id as string | undefined;
    expect(streamId, 'text-start must carry a string id').toBeTypeOf('string');

    const textDeltas = frames.filter((f) => f.type === 'text-delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(2);
    // Every text-delta MUST carry the same id as the text-start AND its
    // text content MUST be on the `delta` field (not `text`).
    for (const td of textDeltas) {
      expect(td.id).toBe(streamId);
      expect(typeof td.delta).toBe('string');
      expect(td.text).toBeUndefined();
    }

    const textEndFrames = frames.filter((f) => f.type === 'text-end');
    expect(
      textEndFrames.length,
      `expected exactly 1 text-end frame, got: ${JSON.stringify(frames)}`,
    ).toBe(1);
    expect(textEndFrames[0]?.id).toBe(streamId);

    const finishFrames = frames.filter((f) => f.type === 'finish');
    expect(finishFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when body lacks message field', async () => {
    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/message/);
  });
});

describe('POST /chat — AI SDK chat-protocol body shape (Bug B fix)', () => {
  // The real AssistantChatTransport (extending DefaultChatTransport from `ai`)
  // sends the chat-protocol body shape:
  //   { id, messages: [{ id, role, parts: [{ type: 'text', text }] }], trigger }
  // Pre-fix the route only looked at body.message / body.prompt / body.userMessage
  // — none matched, so production POST /chat returned 400 from the UI.
  //
  // This case locks in the contract — if anyone reverts the body parser to the
  // legacy-only shape, this test fails immediately.

  it('accepts AI SDK chat-protocol body (messages[].parts[].text) and streams SSE', async () => {
    stubbedEvents = [
      { type: 'text-delta', text: 'Hello back.' },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'thread-1',
        messages: [
          {
            id: 'm1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello, ping the system.' }],
          },
        ],
        trigger: 'submit-message',
      }),
    });

    // The route accepted the body (NO 400) and streamed back SSE.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/event-stream/);

    const raw = await readSse(res);
    const frames = parseFrames(raw);

    // The stubbed coordinator's text-delta surfaced as a text-delta chunk +
    // a finish chunk at the end — proves the body extracted "Hello, ping the
    // system." and called runCoordinatorTurn (the stubbed one).
    const textDeltas = frames.filter((f) => f.type === 'text-delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);

    const finishFrames = frames.filter((f) => f.type === 'finish');
    expect(finishFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('picks the LAST user message from the messages array (multi-turn convos)', async () => {
    // Drive the stub with a sentinel echo so we can verify the route forwarded
    // the right message text. We use two stubbed coordinator events that don't
    // depend on the message content — the assertion is purely "the route did
    // not 400; it accepted the multi-turn body shape and reached the streaming
    // path." (The route doesn't currently echo the input back through the
    // stream, so we can't byte-compare; the 200 + finish chunk is sufficient.)
    stubbedEvents = [
      { type: 'text-delta', text: 'ack' },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'thread-2',
        messages: [
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'first turn' }] },
          { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'first reply' }] },
          { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'second turn' }] },
        ],
        trigger: 'submit-message',
      }),
    });

    expect(res.status).toBe(200);
    const raw = await readSse(res);
    expect(raw).toMatch(/data:/);
  });

  it('falls back to the legacy AI SDK shape (message.content as string)', async () => {
    stubbedEvents = [
      { type: 'text-delta', text: 'ack' },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'thread-3',
        messages: [
          { id: 'm1', role: 'user', content: 'legacy content string' },
        ],
        trigger: 'submit-message',
      }),
    });

    expect(res.status).toBe(200);
  });

  it('still returns 400 when messages exists but contains no user message', async () => {
    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'thread-4',
        messages: [
          { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /chat — full MCP-prefixed tool-ID matching + data-claim-id forwarding', () => {
  it('forwards a data-claim-id chunk with the literal ULID when the coordinator emits an mcp__onebrain__onebrain_write_claim tool-call-result (shorthand path)', async () => {
    const claimUlid = '01J9X1111111111111111111A1';
    stubbedEvents = [
      { type: 'text-delta', text: 'Logging the claim now. ' },
      {
        type: 'tool-call-result',
        tool: 'mcp__onebrain__onebrain_write_claim',
        agentId: 'coordinator',
        summary: `claim:${claimUlid}`,
      },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'TAM is $1B (https://example.com)' }),
    });

    expect(res.status).toBe(200);

    const raw = await readSse(res);
    const frames = parseFrames(raw);

    // The route MUST emit a data-claim-id chunk carrying the literal ULID.
    const claimIdFrames = frames.filter((f) => f.type === 'data-claim-id');
    expect(
      claimIdFrames.length,
      `expected ≥1 data-claim-id frame, got frames: ${JSON.stringify(frames)}`,
    ).toBeGreaterThanOrEqual(1);

    // AI SDK 6 DataUIMessageChunk shape: payload lives on `data` (not `value`).
    const dataField = claimIdFrames[0]?.data as
      | { claimId: string; sourceTool: string }
      | undefined;
    expect(dataField?.claimId).toBe(claimUlid);
    expect(dataField?.sourceTool).toBe('mcp__onebrain__onebrain_write_claim');
  });

  it('does NOT emit a data-claim-id chunk for an unrelated tool whose name happens to contain "onebrain_write_claim" as a substring', async () => {
    // Hypothetical Phase 4 tool ID with the same suffix but a different MCP
    // server name. A substring matcher (`.includes('onebrain_write_claim')`,
    // `.endsWith('onebrain_write_claim')`) would match this; the exact-equality
    // matcher must NOT.
    stubbedEvents = [
      {
        type: 'tool-call-result',
        tool: 'mcp__legacy__onebrain_write_claim', // wrong MCP server name
        agentId: 'research',
        summary: 'claim:01J9X2222222222222222222B2',
      },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'check' }),
    });

    const raw = await readSse(res);
    const frames = parseFrames(raw);

    const claimIdFrames = frames.filter((f) => f.type === 'data-claim-id');
    expect(
      claimIdFrames.length,
      `expected 0 data-claim-id frames for unrelated tool, got: ${JSON.stringify(claimIdFrames)}`,
    ).toBe(0);
  });
});

// CR-01 PRODUCTION-SHAPE COVERAGE — the chat-sse tests above use the
// shorthand `{ type: 'tool-call-result', tool, summary }` events, which take
// a different branch through adaptToUIMessageChunks than the SDK's actual
// production output. Pre-CR-01 the production branch silently no-op'd:
//   - tool_use_id was emitted as the chunk's `tool` field (matchers missed)
//   - the wrapper's JSON-shaped summary did not start with `claim:` (slice missed)
//   - 80-char truncation broke any downstream JSON parser
//
// These tests drive the REAL production event shapes:
//   - assistant message with mcp_tool_use block (records id → name in toolNameMap)
//   - user message with mcp_tool_result block (resolves id → name; emits real summary)
// and assert the chat route's data-claim-id forwarding fires correctly with
// the wrapper's actual JSON-object summary shape.

describe('POST /chat — production SDK event shapes (CR-01 regression guard)', () => {
  it('forwards a data-claim-id chunk on production tool_use → tool_result event pair with JSON-shaped wrapper summary', async () => {
    const claimUlid = '01J9X3333333333333333333C3';
    const toolUseId = 'toolu_prod_abc123';
    // The onebrain_write_claim wrapper's actual emitted shape (per
    // src/agents/tools/onebrain.ts) — a JSON-stringified object containing
    // the full ClaimRow under `claim`, plus per-turn counters.
    const wrapperSummary = JSON.stringify({
      claim: {
        id: claimUlid,
        text: 'TAM is approximately $1B per Gartner 2025.',
        status: 'hypothesis',
        confidence: 0.6,
        cites_source_ids: ['01J9X9999999999999999999Z9'],
        tags: ['tam'],
      },
      claim_count_this_turn: 1,
      elapsed_seconds: 0.42,
    });

    stubbedEvents = [
      // Coordinator emits an mcp_tool_use block invoking onebrain_write_claim.
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: toolUseId,
              name: 'onebrain_write_claim',
              server_name: 'onebrain',
              input: { text: 'TAM is approximately $1B per Gartner 2025.' },
            },
          ],
        },
      },
      // SDK emits the tool_result back as a user message with mcp_tool_result.
      // `tool_use_id` is the only canonical reference back to the tool name —
      // the adapter must resolve it via the per-request StreamContext.
      {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: toolUseId,
              is_error: false,
              content: [{ type: 'text', text: wrapperSummary }],
            },
          ],
        },
      },
      { type: 'result', subtype: 'success' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Log a TAM claim.' }),
    });

    expect(res.status).toBe(200);
    const raw = await readSse(res);
    const frames = parseFrames(raw);

    // Tool-trace chunk for the result MUST carry the resolved canonical name,
    // NOT the raw tool_use_id. (Pre-CR-01 the chunk's `tool` field would have
    // been `toolu_prod_abc123` and every downstream matcher would have missed.)
    const traceResult = frames.find(
      (f) =>
        f.type === 'data-tool-trace' &&
        (f.data as Record<string, unknown> | undefined)?.phase === 'result',
    );
    expect(traceResult, 'expected a data-tool-trace result frame').toBeDefined();
    expect(
      (traceResult?.data as Record<string, unknown>)?.tool,
      'tool field MUST resolve to the canonical mcp__onebrain__onebrain_write_claim name (NOT the raw tool_use_id)',
    ).toBe('mcp__onebrain__onebrain_write_claim');
    // Summary MUST be the FULL wrapper output (no 80-char truncation).
    const summary = (traceResult?.data as Record<string, unknown>)?.summary as
      | string
      | undefined;
    expect(typeof summary).toBe('string');
    expect(summary!.length).toBeGreaterThan(80);
    expect(summary).toContain(claimUlid);

    // The route MUST emit a data-claim-id chunk carrying the FULL ULID
    // extracted from the wrapper's JSON summary.
    const claimIdFrames = frames.filter((f) => f.type === 'data-claim-id');
    expect(
      claimIdFrames.length,
      `expected ≥1 data-claim-id frame, got: ${JSON.stringify(frames)}`,
    ).toBeGreaterThanOrEqual(1);
    const dataField = claimIdFrames[0]?.data as
      | { claimId: string; sourceTool: string }
      | undefined;
    expect(dataField?.claimId).toBe(claimUlid);
    expect(dataField?.sourceTool).toBe('mcp__onebrain__onebrain_write_claim');
  });

  it('captures sub-agent summary on production parent_tool_use_id chain (D-06 / WR-02)', async () => {
    // The SDK invokes a sub-agent via the `Agent` (or `Task`) tool. All
    // subsequent assistant/user messages from inside that sub-agent carry
    // `parent_tool_use_id` referencing the spawn id. The adapter records
    // id → subagent_type so the chunk's agentId field is set; the chat
    // route's D-06 capture gate (agentId === 'research') then fires.
    const agentSpawnId = 'toolu_agent_spawn_1';
    const writeUseId = 'toolu_write_inside_research';

    stubbedEvents = [
      // Coordinator's main thread invokes the Agent tool, naming the
      // research subagent.
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'tool_use',
              id: agentSpawnId,
              name: 'Agent',
              input: { subagent_type: 'research', prompt: 'Research X' },
            },
          ],
        },
      },
      // Inside the research sub-agent: an mcp_tool_use is emitted whose
      // parent_tool_use_id chains back to the Agent invocation.
      {
        type: 'assistant',
        parent_tool_use_id: agentSpawnId,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: writeUseId,
              name: 'onebrain_write_source',
              server_name: 'onebrain',
              input: { url: 'https://example.com' },
            },
          ],
        },
      },
      // The matching tool_result, again under the same parent chain. The
      // adapter MUST stamp `agentId: 'research'` on this trace chunk so the
      // chat route's D-06 capture sees it.
      {
        type: 'user',
        parent_tool_use_id: agentSpawnId,
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: writeUseId,
              is_error: false,
              content: [{ type: 'text', text: '{"source":{"id":"01J9XSRC"}}' }],
            },
          ],
        },
      },
      { type: 'result', subtype: 'success' },
    ];

    const app = createApp();
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Research X.' }),
    });

    expect(res.status).toBe(200);
    const raw = await readSse(res);
    const frames = parseFrames(raw);

    // The result trace chunk for the inner mcp_tool_use MUST carry
    // agentId: 'research' (resolved from parent_tool_use_id chain).
    const innerResult = frames.find(
      (f) =>
        f.type === 'data-tool-trace' &&
        (f.data as Record<string, unknown> | undefined)?.phase === 'result' &&
        (f.data as Record<string, unknown> | undefined)?.tool ===
          'mcp__onebrain__onebrain_write_source',
    );
    expect(innerResult, 'expected the inner write_source result frame').toBeDefined();
    expect(
      (innerResult?.data as Record<string, unknown>)?.agentId,
      'agentId MUST be resolved from parent_tool_use_id → subagent_type chain',
    ).toBe('research');
  });
});
