// tests/server/streaming-adapter.spec.ts
// CR-01 regression guard at the adapter level.
//
// adaptToUIMessageChunks is the SDK-event → UIMessageChunk translation layer.
// Pre-CR-01 it had three interlocking bugs that masked broken production
// behavior because the Wave 0 probes used "shorthand" events that hit a
// different code branch:
//
//   1. user/tool_result branch put tool_use_id (toolu_xyz123) into chunk.tool;
//      production downstream consumers match on the canonical full tool name
//      (mcp__onebrain__onebrain_write_claim, etc.) and silently missed.
//   2. summarizeResult truncated to 80 chars, breaking parseRunCompileSummary
//      in the recompile route.
//   3. Multi-block assistant messages dropped tool_use blocks when text was
//      present (returned only the first block; WR-05 fix folded into CR-01).
//
// These tests drive PRODUCTION-shape events directly:
//   - SDKAssistantMessage with mcp_tool_use content
//   - SDKUserMessage with mcp_tool_result content
//   - parent_tool_use_id chains for sub-agent attribution (D-06 / WR-02)
// and assert the adapter resolves tool_use_id → real name, surfaces agentId
// from the parent_tool_use_id → subagent_type chain, and does NOT truncate
// the summary.

import { describe, it, expect } from 'vitest';

import {
  adaptToUIMessageChunks,
  createStreamContext,
} from '@/server/streaming';

describe('adaptToUIMessageChunks (CR-01 production-shape correctness)', () => {
  it('records tool_use_id → canonical mcp tool name on assistant.mcp_tool_use blocks', () => {
    const ctx = createStreamContext('stream-1');
    const chunks = adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: 'toolu_abc123',
              name: 'onebrain_write_claim',
              server_name: 'onebrain',
              input: { text: 'a claim' },
            },
          ],
        },
      },
      ctx,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe('data-tool-trace');
    const data = (chunks[0] as { data: Record<string, unknown> }).data;
    expect(data.phase).toBe('start');
    expect(data.tool).toBe('mcp__onebrain__onebrain_write_claim');
    expect(ctx.toolNameMap.get('toolu_abc123')).toBe(
      'mcp__onebrain__onebrain_write_claim',
    );
  });

  it('resolves tool_use_id → real tool name on user.mcp_tool_result blocks (CR-01 Bug 1)', () => {
    const ctx = createStreamContext('stream-2');
    // Prime the map with an earlier tool_use.
    adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: 'toolu_xyz999',
              name: 'vault_write_atomic',
              server_name: 'vault',
              input: {},
            },
          ],
        },
      },
      ctx,
    );

    const chunks = adaptToUIMessageChunks(
      {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: 'toolu_xyz999',
              is_error: false,
              content: [{ type: 'text', text: '{"runId":"01J9X","pagesWritten":1}' }],
            },
          ],
        },
      },
      ctx,
    );

    expect(chunks).toHaveLength(1);
    const data = (chunks[0] as { data: Record<string, unknown> }).data;
    expect(data.phase).toBe('result');
    // Real canonical name, NOT the raw tool_use_id.
    expect(data.tool).toBe('mcp__vault__vault_write_atomic');
    expect(data.summary).toBe('{"runId":"01J9X","pagesWritten":1}');
  });

  it('falls back gracefully to tool_use_id when no matching tool_use was recorded (graceful degradation)', () => {
    const ctx = createStreamContext('stream-3');
    const chunks = adaptToUIMessageChunks(
      {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: 'toolu_orphan',
              is_error: false,
              content: 'bare string result',
            },
          ],
        },
      },
      ctx,
    );
    const data = (chunks[0] as { data: Record<string, unknown> }).data;
    // Falls back to the id (no map entry) — caller's matchers will miss, but
    // the chunk itself still surfaces with a value so the trace UI shows it.
    expect(data.tool).toBe('toolu_orphan');
  });

  it('does NOT truncate the summary at 80 chars (CR-01 Bug 3)', () => {
    const ctx = createStreamContext('stream-4');
    const longJson = JSON.stringify({
      runId: '01J9X1111111111111111111A1',
      pagesWritten: 7,
      pagesSkipped: 3,
      pagesPlanned: 10,
      startedAt: '2026-04-28T00:00:00.000Z',
      finishedAt: '2026-04-28T00:00:42.000Z',
    });
    expect(longJson.length).toBeGreaterThan(80);

    adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: 'toolu_long',
              name: 'vault_write_atomic',
              server_name: 'vault',
              input: {},
            },
          ],
        },
      },
      ctx,
    );

    const chunks = adaptToUIMessageChunks(
      {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: 'toolu_long',
              is_error: false,
              content: [{ type: 'text', text: longJson }],
            },
          ],
        },
      },
      ctx,
    );

    const summary = (chunks[0] as { data: Record<string, unknown> }).data
      .summary as string;
    expect(summary).toBe(longJson);
    expect(summary.length).toBeGreaterThan(80);
    // And it must JSON.parse cleanly downstream (this was the actual breakage).
    expect(() => JSON.parse(summary)).not.toThrow();
  });

  it('emits MULTIPLE chunks for an assistant message with both text AND tool_use blocks (WR-05 fix folded in)', () => {
    const ctx = createStreamContext('stream-5');
    const chunks = adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            { type: 'text', text: 'Calling the tool now.' },
            {
              type: 'mcp_tool_use',
              id: 'toolu_mixed',
              name: 'onebrain_search',
              server_name: 'onebrain',
              input: { q: 'test' },
            },
          ],
        },
      },
      ctx,
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.type).toBe('text-delta');
    expect((chunks[0] as { delta: string }).delta).toBe('Calling the tool now.');
    expect(chunks[1]?.type).toBe('data-tool-trace');
  });

  it('resolves agentId from parent_tool_use_id → subagent_type chain (D-06 / WR-02)', () => {
    const ctx = createStreamContext('stream-6');
    // Step 1: coordinator main thread emits an Agent tool_use spawning research.
    adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'agent_spawn_id',
              name: 'Agent',
              input: { subagent_type: 'research', prompt: 'Research X' },
            },
          ],
        },
      },
      ctx,
    );
    expect(ctx.subAgentByParentId.get('agent_spawn_id')).toBe('research');

    // Step 2: a tool result inside the research sub-agent — its
    // parent_tool_use_id chains back to agent_spawn_id, so agentId resolves.
    // (Use a fresh tool_use first to populate toolNameMap so the result name
    // resolves cleanly.)
    adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: 'agent_spawn_id',
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: 'inner_use_id',
              name: 'tavily_search',
              server_name: 'tavily',
              input: { query: 'pricing' },
            },
          ],
        },
      },
      ctx,
    );
    const innerResultChunks = adaptToUIMessageChunks(
      {
        type: 'user',
        parent_tool_use_id: 'agent_spawn_id',
        message: {
          content: [
            {
              type: 'mcp_tool_result',
              tool_use_id: 'inner_use_id',
              is_error: false,
              content: [{ type: 'text', text: 'search results' }],
            },
          ],
        },
      },
      ctx,
    );
    const data = (innerResultChunks[0] as { data: Record<string, unknown> }).data;
    expect(data.agentId).toBe('research');
    expect(data.tool).toBe('mcp__tavily__tavily_search');
  });

  it('per-request StreamContext isolates concurrent streams', () => {
    // Two independent contexts must not see each other's tool_use entries.
    const ctxA = createStreamContext('a');
    const ctxB = createStreamContext('b');
    adaptToUIMessageChunks(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'mcp_tool_use',
              id: 'toolu_shared_id',
              name: 'tool_in_a',
              server_name: 'srvA',
              input: {},
            },
          ],
        },
      },
      ctxA,
    );
    expect(ctxA.toolNameMap.has('toolu_shared_id')).toBe(true);
    expect(ctxB.toolNameMap.has('toolu_shared_id')).toBe(false);
  });
});
