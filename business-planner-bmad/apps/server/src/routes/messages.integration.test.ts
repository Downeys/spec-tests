import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { buildApp } from '../buildApp.js';
import type { Env } from '../config/env.js';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

const INTEGRATION = process.env.INTEGRATION === '1' || process.env.INTEGRATION === 'true';
const describeIntegration = INTEGRATION ? describe : describe.skip;

const silentLogger = pino({ level: 'silent' });

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

function resultSuccess(input: number, output: number, totalCostUsd = 0.0025): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    usage: { input_tokens: input, output_tokens: output },
    total_cost_usd: totalCostUsd,
  } as unknown as SDKMessage;
}

function framesFrom(items: SDKMessage[]): AsyncIterable<SDKMessage> {
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

interface ParsedFrame {
  event: string;
  data: unknown;
}

function parseSseStream(raw: string): ParsedFrame[] {
  const frames: ParsedFrame[] = [];
  const blocks = raw.split('\n\n').filter((b) => b.length > 0);
  for (const block of blocks) {
    const lines = block.split('\n');
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event: ')) eventName = line.slice('event: '.length);
      else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length));
    }
    if (eventName && dataLines.length > 0) {
      frames.push({ event: eventName, data: JSON.parse(dataLines.join('\n')) });
    }
  }
  return frames;
}

async function consumeStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return raw;
}

function seedProject(dataRoot: string, projectId: string): void {
  mkdirSync(dataRoot, { recursive: true });
  const store = {
    projects: [
      {
        project_id: projectId,
        name: 'integration',
        description: 'seeded for integration test',
        namespace: projectId,
        created_at: new Date().toISOString(),
      },
    ],
  };
  writeFileSync(path.join(dataRoot, 'projects.json'), JSON.stringify(store, null, 2), 'utf8');
}

describeIntegration('messages route integration (live app.listen + real SSE)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataRoot: string;
  let baseUrl: string;
  const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    queryMock.mockReset();
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-msg-int-${randomUUID()}-`));
    seedProject(dataRoot, PROJECT_ID);

    const env: Env = {
      ANTHROPIC_API_KEY: 'sk-test-integration',
      PINECONE_INDEX: 'business-planner-intelligence',
      PINECONE_API_KEY: 'pc-stub',
      DATA_ROOT: dataRoot,
      PORT: 0,
      WEB_PORT: 5173,
      NODE_ENV: 'test',
    };

    app = await buildApp(env, silentLogger, {
      pineconeOverride: {
        describeIndex: () => Promise.resolve({ status: { ready: true } }),
        createIndex: () => Promise.resolve(undefined),
      },
    });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('streams the full event sequence over a real SSE connection and persists messages', async () => {
    queryMock.mockImplementation(() =>
      framesFrom([textDelta('Hello'), textDelta(' world'), resultSuccess(7, 5, 0.0033)]),
    );

    const token = randomUUID();
    const sseResponse = await fetch(`${baseUrl}/api/sse/messages?token=${token}`);
    expect(sseResponse.status).toBe(200);
    expect(sseResponse.headers.get('content-type')).toBe('text/event-stream');

    // Give the SSE handler a tick to register with the registry.
    await new Promise((r) => setTimeout(r, 30));

    const postRes = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'ping', sse_token: token }),
    });
    expect(postRes.status).toBe(202);
    const postBody = (await postRes.json()) as {
      user_message: { content: string; role: string };
      assistant_message_id: string;
    };
    expect(postBody.user_message.role).toBe('user');
    expect(postBody.user_message.content).toBe('ping');
    expect(postBody.assistant_message_id).toMatch(/^[0-9a-f-]{36}$/);

    const body = sseResponse.body;
    if (!body) throw new Error('expected SSE response body');
    const raw = await consumeStream(body);

    const frames = parseSseStream(raw);
    const sequence = frames.map((f) => f.event);
    expect(sequence).toEqual(['message.delta', 'message.delta', 'cost.update', 'done']);

    const deltas = frames
      .filter((f) => f.event === 'message.delta')
      .map((f) => (f.data as { delta: string }).delta);
    expect(deltas).toEqual(['Hello', ' world']);

    const done = frames.at(-1);
    expect(done?.event).toBe('done');
    const doneData = done?.data as { usage: { input_tokens: number; output_tokens: number } };
    expect(doneData.usage).toEqual({ input_tokens: 7, output_tokens: 5 });

    const cost = frames.at(-2);
    expect(cost?.event).toBe('cost.update');
    const costData = cost?.data as {
      session_cost_usd: number;
      project_cost_usd_cumulative: number;
    };
    expect(costData.session_cost_usd).toBeGreaterThan(0);
    expect(costData.project_cost_usd_cumulative).toBeGreaterThanOrEqual(costData.session_cost_usd);

    // Give the orchestrator's updateLast+persist a tick to finish after `done` emits.
    await new Promise((r) => setTimeout(r, 30));

    const jsonl = await readFile(
      path.join(dataRoot, 'sessions', PROJECT_ID, 'default.jsonl'),
      'utf8',
    );
    const rows = jsonl
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { role: string; content: string; usage?: unknown });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.role).toBe('user');
    expect(rows[0]?.content).toBe('ping');
    expect(rows[1]?.role).toBe('assistant');
    expect(rows[1]?.content).toBe('Hello world');
    expect(rows[1]?.usage).toEqual({ input_tokens: 7, output_tokens: 5 });
  });
});
