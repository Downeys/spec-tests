// tests/server/recompile-route.spec.ts
// Wave 0 probe — VALIDATION row COMP-11 (route half).
// Spec authority:
//   .planning/phases/02-agents-and-chat/02-VALIDATION.md row COMP-11 (line 267)
//   .planning/phases/02-agents-and-chat/02-RESEARCH.md §COMP-11 (lines 90-91)
//
// Stubs the SDK `query` so no real Anthropic call. Captures the call options to
// assert that `agents.compilation` is present and `agents.research` is undefined
// — this is the structural defense for COMP-11 (recompile route invokes
// compilation sub-agent ONLY; coordinator/research are NOT in the agents map).
//
// Stubs the DB so the status endpoint returns deterministic data without a real
// Postgres connection (mirrors chat-sse.spec.ts's DB stub pattern).
//
// THREE DESCRIBES:
//   (a) POST /recompile — SSE base plumbing + agents-map structural assertion
//   (b) POST /recompile — invokes SDK with compilationDef but NOT researchDef
//   (c) GET /recompile/status — JSON shape with three documented fields

import { describe, it, expect, vi } from 'vitest';

// Module-level state for capturing the SDK query() options across calls.
// vi.mock factories run once at module-load time; the spy needs to live in
// hoisted scope so the test can read what was captured per-test.
const { capturedOpts, stubbedEvents, dbExecuteCalls } = vi.hoisted(() => ({
  capturedOpts: { value: undefined as unknown },
  stubbedEvents: { value: [] as unknown[] },
  dbExecuteCalls: { value: [] as string[] },
}));

// Stub the SDK BEFORE importing createApp. The query() spy captures opts and
// returns an async generator yielding fake events including a vault_write_atomic
// tool-result with the runCompile camelCase shape.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (opts: unknown) => {
    capturedOpts.value = opts;
    return (async function* () {
      for (const ev of stubbedEvents.value) yield ev;
    })();
  },
  // tool() and createSdkMcpServer() are also imported transitively via
  // src/agents/tools/{onebrain,vault}.ts; provide passthrough stubs so the
  // module loads.
  tool: (name: string, _description: string, _schema: unknown, handler: unknown) => ({
    name,
    handler,
  }),
  createSdkMcpServer: (cfg: unknown) => cfg,
}));

// Stub the DB so health-route + status endpoints don't try to connect at
// module-load. db.execute is called twice by /recompile/status (last-compiled
// query + dirty-count query); record the calls for inspection if needed.
vi.mock('@/onebrain/db', () => ({
  db: {
    execute: vi.fn(async (q: { queryChunks?: unknown }) => {
      // Drizzle's sql template tag wraps the SQL into a queryChunks structure.
      // We don't need to inspect the SQL itself — just return shape-compatible
      // rows for the two queries the status endpoint runs.
      dbExecuteCalls.value.push(JSON.stringify(q));
      // First call: SELECT MAX(finished_at) → return null (never compiled).
      // Second call: SELECT count(*) → return n=0.
      const callIdx = dbExecuteCalls.value.length;
      if (callIdx % 2 === 1) {
        return { rows: [{ last_compiled: null }] };
      }
      return { rows: [{ n: 0 }] };
    }),
  },
}));

import { createApp } from '@/server/index';

// SSE body reader (mirrors chat-sse.spec.ts pattern). Reads up to maxChunks or
// until we see a finish frame, whichever comes first.
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

describe('POST /recompile (COMP-11 route half)', () => {
  it('returns SSE Content-Type and emits ≥1 data: frame', async () => {
    stubbedEvents.value = [
      { type: 'text-delta', text: 'Compiling...' },
      {
        type: 'tool-call-result',
        tool: 'mcp__vault__vault_write_atomic',
        agentId: 'compilation',
        summary: JSON.stringify({
          runId: '01J9X1111111111111111111A1',
          pagesWritten: 1,
          pagesSkipped: 0,
          pagesPlanned: 1,
        }),
      },
      { type: 'message-end' },
    ];
    capturedOpts.value = undefined;

    const app = createApp();
    const res = await app.request('/recompile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/event-stream/);

    const raw = await readSse(res);
    expect(raw).toMatch(/data:/);
  });

  it('invokes the SDK query() with compilationDef in agents map but NOT researchDef (COMP-11)', async () => {
    stubbedEvents.value = [{ type: 'message-end' }];
    capturedOpts.value = undefined;

    const app = createApp();
    const res = await app.request('/recompile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Drain the SSE stream so the route fully invokes query() before assertions.
    await readSse(res);

    expect(capturedOpts.value, 'query() should have been invoked').toBeDefined();
    const opts = capturedOpts.value as {
      options: { agents: Record<string, unknown> };
    };
    expect(opts.options).toBeDefined();
    expect(opts.options.agents).toBeDefined();
    // STRUCTURAL DEFENSE for T-02-01 + COMP-11: compilation present, research
    // and coordinator absent. A future plan that accidentally adds research to
    // the recompile route's agents map would fail this assertion loudly.
    expect(
      opts.options.agents.compilation,
      'compilation sub-agent must be in agents map per COMP-11',
    ).toBeDefined();
    expect(
      opts.options.agents.research,
      'research sub-agent MUST NOT be in recompile agents map (T-02-01 / COMP-11)',
    ).toBeUndefined();
    expect(
      opts.options.agents.coordinator,
      'coordinator MUST NOT be in recompile agents map per COMP-11 ("compilation sub-agent only — not via the coordinator")',
    ).toBeUndefined();
  });

  it('invokes the SDK query() with permissionMode: "bypassPermissions" + allowDangerouslySkipPermissions: true (Bug A)', async () => {
    // The SDK defaults permissionMode to 'default' (sdk.d.ts:1447 / 3230,
    // PermissionMode union sdk.d.ts:1757), which prompts a human. In a Hono
    // SSE handler with no interactive prompter, those prompts go nowhere →
    // every tool call is silently rejected and runCompile() never executes.
    // The fix is to set permissionMode: 'bypassPermissions' plus the required
    // allowDangerouslySkipPermissions: true acknowledgment per sdk.d.ts:1456-1459
    // / sdk.d.ts:3199-3202. This test locks in the runtime contract — if
    // either field is removed, recompile silently breaks again.
    stubbedEvents.value = [{ type: 'message-end' }];
    capturedOpts.value = undefined;

    const app = createApp();
    const res = await app.request('/recompile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    await readSse(res);

    expect(capturedOpts.value).toBeDefined();
    const opts = capturedOpts.value as {
      options: {
        permissionMode?: string;
        allowDangerouslySkipPermissions?: boolean;
      };
    };
    expect(opts.options.permissionMode).toBe('bypassPermissions');
    expect(opts.options.allowDangerouslySkipPermissions).toBe(true);
  });

  it('forwards the vault_write_atomic result as a data-recompile-result chunk for the UI to render the D-18 system message (shorthand path)', async () => {
    const runUlid = '01J9X1111111111111111111A1';
    stubbedEvents.value = [
      {
        type: 'tool-call-result',
        tool: 'mcp__vault__vault_write_atomic',
        agentId: 'compilation',
        summary: JSON.stringify({
          runId: runUlid,
          pagesWritten: 1,
          pagesSkipped: 0,
          pagesPlanned: 1,
        }),
      },
      { type: 'message-end' },
    ];

    const app = createApp();
    const res = await app.request('/recompile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const raw = await readSse(res);
    const frames = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice('data:'.length).trim())
      .filter(Boolean)
      .map((s) => JSON.parse(s) as Record<string, unknown>);

    const recompileResultFrames = frames.filter(
      (f) => f.type === 'data-recompile-result',
    );
    expect(
      recompileResultFrames.length,
      `expected ≥1 data-recompile-result frame, got: ${JSON.stringify(frames)}`,
    ).toBeGreaterThanOrEqual(1);

    // AI SDK 6 DataUIMessageChunk shape: payload lives on `data` (not `value`).
    const dataField = recompileResultFrames[0]?.data as
      | { pages_written: number; pages_skipped: number; run_id: string }
      | undefined;
    expect(dataField?.pages_written).toBe(1);
    expect(dataField?.pages_skipped).toBe(0);
    expect(dataField?.run_id).toBe(runUlid);
  });

  // CR-01 PRODUCTION-SHAPE COVERAGE — the test above uses the shorthand
  // `{ type: 'tool-call-result', tool, summary }` event, which takes a
  // different branch through adaptToUIMessageChunks than the SDK's actual
  // production output. Pre-CR-01 the production branch silently dropped the
  // D-18 system message because:
  //   - tool_use_id (e.g., toolu_xyz123) was emitted as the chunk's `tool`
  //     field, so the route's `tool === TOOL_VAULT_WRITE_ATOMIC` matcher
  //     never fired
  //   - summarizeResult truncated the JSON to 80 chars, so even if the matcher
  //     had fired, parseRunCompileSummary would have JSON.parsed garbage
  //
  // This case drives the production event shapes end-to-end:
  //   - assistant message with mcp_tool_use block (records id → name)
  //   - user message with mcp_tool_result block (resolves id → name; emits FULL summary)

  it('forwards data-recompile-result on production tool_use → tool_result event pair (no truncation, real tool name resolution)', async () => {
    const runUlid = '01J9X4444444444444444444D4';
    const toolUseId = 'toolu_vault_write_prod_xyz';
    // A realistic >80 character JSON payload to verify summarizeResult does
    // NOT truncate. Pre-CR-01 the truncation broke the JSON parser.
    const wrapperSummary = JSON.stringify({
      runId: runUlid,
      pagesWritten: 7,
      pagesSkipped: 3,
      pagesPlanned: 10,
      startedAt: '2026-04-28T00:00:00.000Z',
      finishedAt: '2026-04-28T00:00:42.000Z',
      version: 'compilation-2026-04',
    });
    expect(
      wrapperSummary.length,
      'wrapperSummary must exceed the legacy 80-char truncation cap to exercise the bug',
    ).toBeGreaterThan(80);

    stubbedEvents.value = [
      // Compilation sub-agent emits an mcp_tool_use block invoking
      // vault_write_atomic.
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: toolUseId,
              name: 'vault_write_atomic',
              server_name: 'vault',
              input: {
                /* large payload omitted — irrelevant to test */
              },
            },
          ],
        },
      },
      // SDK emits the tool_result back as a user message with
      // mcp_tool_result. The adapter MUST resolve tool_use_id → real name
      // via the per-request StreamContext AND must NOT truncate the summary.
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
    const res = await app.request('/recompile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const raw = await readSse(res);
    const frames = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice('data:'.length).trim())
      .filter(Boolean)
      .map((s) => JSON.parse(s) as Record<string, unknown>);

    // The adapter MUST resolve tool_use_id → mcp__vault__vault_write_atomic.
    const traceResult = frames.find(
      (f) =>
        f.type === 'data-tool-trace' &&
        (f.data as Record<string, unknown> | undefined)?.phase === 'result' &&
        (f.data as Record<string, unknown> | undefined)?.tool ===
          'mcp__vault__vault_write_atomic',
    );
    expect(
      traceResult,
      'expected a data-tool-trace result with the resolved canonical tool name',
    ).toBeDefined();
    // Summary MUST be the FULL JSON (no truncation).
    const summary = (traceResult?.data as Record<string, unknown>)?.summary as
      | string
      | undefined;
    expect(typeof summary).toBe('string');
    expect(summary!.length).toBeGreaterThan(80);
    expect(summary).toContain(runUlid);

    // The route MUST emit data-recompile-result with the parsed CompilationResult.
    const recompileResultFrames = frames.filter(
      (f) => f.type === 'data-recompile-result',
    );
    expect(
      recompileResultFrames.length,
      `expected ≥1 data-recompile-result frame, got: ${JSON.stringify(frames)}`,
    ).toBeGreaterThanOrEqual(1);
    const dataField = recompileResultFrames[0]?.data as
      | { pages_written: number; pages_skipped: number; run_id: string }
      | undefined;
    expect(dataField?.pages_written).toBe(7);
    expect(dataField?.pages_skipped).toBe(3);
    expect(dataField?.run_id).toBe(runUlid);
  });
});

describe('GET /recompile/status (D-16)', () => {
  it('returns JSON with lastCompiledAt, dirtyClaimsCount, inFlight fields', async () => {
    const app = createApp();
    const res = await app.request('/recompile/status', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Three documented fields per the route header + D-16.
    expect(body).toHaveProperty('lastCompiledAt');
    expect(body).toHaveProperty('dirtyClaimsCount');
    expect(body).toHaveProperty('inFlight');
    // Phase 2 single-user dev tool — inFlight is always false on this endpoint
    // (the in-flight state is tracked client-side during the SSE stream).
    expect(body.inFlight).toBe(false);
    // Stubbed DB returns null for the never-compiled case.
    expect(body.lastCompiledAt).toBeNull();
    expect(typeof body.dirtyClaimsCount).toBe('number');
  });
});
