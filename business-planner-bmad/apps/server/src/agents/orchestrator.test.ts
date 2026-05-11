import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  ChatMessage,
  IsoUtcTimestamp,
  MessageId,
  ProjectId,
  SessionId,
} from '@bp/shared';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createOrchestrator } from './orchestrator.js';
import { createMessageStore } from '../domain/messageStore.js';
import type { ClaudeClient } from '../clients/claude.js';

function makeUserMsg(content: string): ChatMessage {
  return {
    message_id: randomUUID() as MessageId,
    project_id: 'p1' as ProjectId,
    session_id: 'default' as SessionId,
    role: 'user',
    content,
    created_at: new Date().toISOString() as IsoUtcTimestamp,
    status: 'complete',
  };
}

function textDelta(text: string): SDKMessage {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
  } as unknown as SDKMessage;
}

function thinkingDelta(text: string): SDKMessage {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: text },
    },
  } as unknown as SDKMessage;
}

function resultSuccess(input = 10, output = 20, totalCostUsd?: number): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    usage: { input_tokens: input, output_tokens: output },
    total_cost_usd: totalCostUsd ?? undefined,
  } as unknown as SDKMessage;
}

function frames(...items: SDKMessage[]): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<SDKMessage>> {
          const value = items[i];
          if (value === undefined) {
            return Promise.resolve({ value: undefined, done: true });
          }
          i += 1;
          return Promise.resolve({ value, done: false });
        },
      };
    },
  };
}

function throwingFrames(err: Error): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(err),
      };
    },
  };
}

function midStreamFrames(
  preItems: SDKMessage[],
  err: Error,
): AsyncIterable<SDKMessage> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<SDKMessage>> {
          const value = preItems[i];
          if (value === undefined) {
            return Promise.reject(err);
          }
          i += 1;
          return Promise.resolve({ value, done: false });
        },
      };
    },
  };
}

function mockClient(invokeFn: (opts: unknown) => AsyncIterable<SDKMessage>): ClaudeClient {
  return { invoke: invokeFn as ClaudeClient['invoke'] };
}

function collect(events: AgentEvent[]): (e: AgentEvent) => void {
  return (e): void => {
    events.push(e);
  };
}

const NO_SLEEP = (): Promise<void> => Promise.resolve();

describe('orchestrator happy path', () => {
  let dataRoot: string;
  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-orch-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('emits thinking.delta, message.delta+, cost.update, done and persists the assistant message', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hello');
    await store.append('p1', 'default', user);

    const client = mockClient(() =>
      frames(
        thinkingDelta('thinking…'),
        textDelta('Hi '),
        textDelta('there'),
        resultSuccess(10, 20, 0.0025),
      ),
    );

    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    const events: AgentEvent[] = [];
    const ac = new AbortController();
    const result = await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: ac.signal,
      onEvent: collect(events),
    });

    const sequence = events.map((e) => e.type);
    expect(sequence).toEqual([
      'thinking.delta',
      'message.delta',
      'message.delta',
      'cost.update',
      'done',
    ]);

    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected done terminal');
    expect(done.message_id).toBe(result.messageId);
    expect(done.usage).toEqual({ input_tokens: 10, output_tokens: 20 });

    const cost = events.at(-2);
    if (cost?.type !== 'cost.update') throw new Error('expected cost.update');
    expect(cost.session_cost_usd).toBeCloseTo(0.0025, 6);
    expect(cost.project_cost_usd_cumulative).toBeCloseTo(0.0025, 6);

    const rows = await store.list('p1', 'default');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.role).toBe('user');
    expect(rows[1]?.role).toBe('assistant');
    expect(rows[1]?.content).toBe('Hi there');
    expect(rows[1]?.status).toBe('complete');
    expect(rows[1]?.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
  });

  it('falls back to Opus pricing formula when total_cost_usd is absent', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('x');
    await store.append('p1', 'default', user);

    const client = mockClient(() =>
      frames(textDelta('ok'), resultSuccess(1_000_000, 0)),
    );

    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    const events: AgentEvent[] = [];
    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    const cost = events.find((e) => e.type === 'cost.update');
    if (!cost) throw new Error('expected cost.update');
    // 1_000_000 input tokens × $15/M = $15
    expect(cost.session_cost_usd).toBeCloseTo(15, 5);
  });
});

describe('orchestrator retry path', () => {
  let dataRoot: string;
  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-orch-retry-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('retries twice on 503 then succeeds; client sees no error event', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    let calls = 0;
    const client = mockClient(() => {
      calls += 1;
      if (calls <= 2) {
        const err = new Error('upstream 503 overloaded') as Error & { status?: number };
        err.status = 503;
        return throwingFrames(err);
      }
      return frames(textDelta('ok'), resultSuccess(1, 1));
    });

    const events: AgentEvent[] = [];
    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });
    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    expect(calls).toBe(3);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['message.delta', 'cost.update', 'done']);
  });

  it('after 3 retryable failures emits error + done with retryable:true', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    const client = mockClient(() => {
      const err = new Error('overloaded (rate-limit)') as Error & { status?: number };
      err.status = 503;
      return throwingFrames(err);
    });

    const events: AgentEvent[] = [];
    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (!errorEvent) throw new Error('expected error event');
    expect(errorEvent.retryable).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    // Assistant row persisted with status:error
    const rows = await store.list('p1', 'default');
    const assistant = rows.find((r) => r.role === 'assistant');
    expect(assistant?.status).toBe('error');
  });

  it('non-retryable 400 throws once and emits error + done with retryable:false', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    let calls = 0;
    const client = mockClient(() => {
      calls += 1;
      const err = new Error('bad request') as Error & { status?: number };
      err.status = 400;
      return throwingFrames(err);
    });

    const events: AgentEvent[] = [];
    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    expect(calls).toBe(1);
    const errorEvent = events.find((e) => e.type === 'error');
    if (!errorEvent) throw new Error('expected error');
    expect(errorEvent.retryable).toBe(false);
  });

  it('mid-stream error does NOT retry; emits error + done and keeps streamed content', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    let calls = 0;
    const client = mockClient(() => {
      calls += 1;
      const err = new Error('overloaded') as Error & { status?: number };
      err.status = 503;
      return midStreamFrames([textDelta('partial')], err);
    });

    const events: AgentEvent[] = [];
    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    expect(calls).toBe(1);
    const idx = events.findIndex((e) => e.type === 'error');
    expect(idx).toBeGreaterThan(-1);
    expect(events[idx - 1]?.type).toBe('message.delta');
    expect(events.at(-1)?.type).toBe('done');

    const rows = await store.list('p1', 'default');
    const assistant = rows.find((r) => r.role === 'assistant');
    expect(assistant?.content).toBe('partial');
    expect(assistant?.status).toBe('error');
  });
});

describe('orchestrator abort path', () => {
  let dataRoot: string;
  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-orch-abort-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('AbortError propagates and persisted content equals what streamed before abort', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    const ac = new AbortController();
    const client = mockClient(() => {
      const abortErr = new Error('aborted') as Error & { name: string };
      abortErr.name = 'AbortError';
      // Abort the signal so the orchestrator's AbortError detection fires.
      const preYield = [textDelta('first')];
      return {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next(): Promise<IteratorResult<SDKMessage>> {
              const value = preYield[i];
              if (value === undefined) {
                ac.abort();
                return Promise.reject(abortErr);
              }
              i += 1;
              return Promise.resolve({ value, done: false });
            },
          };
        },
      };
    });

    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    const events: AgentEvent[] = [];
    await expect(
      runOrchestrator({
        projectId: 'p1',
        sessionId: 'default',
        history: [user],
        userMessage: user,
        abortSignal: ac.signal,
        onEvent: collect(events),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // First delta was emitted before abort
    expect(events[0]?.type).toBe('message.delta');
    // No error/done event emitted — caller closes the stream on AbortError
    expect(events.some((e) => e.type === 'error')).toBe(false);

    const rows = await store.list('p1', 'default');
    const assistant = rows.find((r) => r.role === 'assistant');
    expect(assistant?.content).toBe('first');
  });
});

describe('orchestrator cumulative cost', () => {
  let dataRoot: string;
  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-orch-cum-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('cost.update.project_cost_usd_cumulative includes prior turns from the store', async () => {
    const store = createMessageStore({ dataRoot });
    const user = makeUserMsg('hi');
    await store.append('p1', 'default', user);

    const client = mockClient(() => frames(textDelta('ok'), resultSuccess(10, 10, 0.01)));

    // Suppose prior project cost was $1.00
    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(1),
      sleep: NO_SLEEP,
    });

    const events: AgentEvent[] = [];
    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [user],
      userMessage: user,
      abortSignal: new AbortController().signal,
      onEvent: collect(events),
    });

    const cost = events.find((e) => e.type === 'cost.update');
    if (!cost) throw new Error('expected cost.update');
    expect(cost.session_cost_usd).toBeCloseTo(0.01, 6);
    expect(cost.project_cost_usd_cumulative).toBeCloseTo(1.01, 6);
  });
});

describe('orchestrator prompt construction', () => {
  let dataRoot: string;
  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-orch-prompt-${randomUUID()}-`));
  });
  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('builds a Human/Assistant interleaved prompt from history + new user message', async () => {
    const store = createMessageStore({ dataRoot });
    const u1 = makeUserMsg('first question');
    const a1: ChatMessage = {
      ...makeUserMsg(''),
      role: 'assistant',
      content: 'first answer',
    };
    const u2 = makeUserMsg('second question');

    const seen: string[] = [];
    const client = mockClient((opts: unknown) => {
      const o = opts as { prompt: string };
      seen.push(o.prompt);
      return frames(textDelta('ok'), resultSuccess(1, 1));
    });

    const { runOrchestrator } = createOrchestrator({
      claudeClient: client,
      messageStore: store,
      getProjectCumulativeCostUsd: () => Promise.resolve(0),
      sleep: NO_SLEEP,
    });

    await runOrchestrator({
      projectId: 'p1',
      sessionId: 'default',
      history: [u1, a1, u2],
      userMessage: u2,
      abortSignal: new AbortController().signal,
      onEvent: (): void => {},
    });

    const prompt = seen[0] ?? '';
    expect(prompt).toContain('Human: first question');
    expect(prompt).toContain('Assistant: first answer');
    expect(prompt).toContain('Human: second question');
    expect(prompt.trim().endsWith('Assistant:')).toBe(true);
  });
});

