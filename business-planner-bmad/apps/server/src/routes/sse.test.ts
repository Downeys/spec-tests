import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { Writable } from 'node:stream';
import { buildApp } from '../buildApp.js';
import type { Env } from '../config/env.js';

const silentLogger = pino({ level: 'silent' });

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

interface ParsedFrame {
  event: string;
  data: unknown;
}

function parseSseStream(raw: string): { frames: ParsedFrame[]; comments: string[] } {
  const frames: ParsedFrame[] = [];
  const comments: string[] = [];
  const events = raw.split('\n\n').filter((block) => block.length > 0);
  for (const block of events) {
    const lines = block.split('\n');
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) {
        comments.push(line.slice(1).trimStart());
        continue;
      }
      if (line.startsWith('event: ')) {
        eventName = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice('data: '.length));
      }
    }
    if (eventName && dataLines.length > 0) {
      frames.push({ event: eventName, data: JSON.parse(dataLines.join('\n')) });
    }
  }
  return { frames, comments };
}

describe('/api/sse/echo route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataRoot: string;

  beforeAll(async () => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-sseroute-${randomUUID()}-`));
    const env: Env = {
      ANTHROPIC_API_KEY: 'sk-test',
      PINECONE_INDEX: 'business-planner-intelligence',
      PINECONE_API_KEY: 'pc-stub',
      DATA_ROOT: dataRoot,
      PORT: 3000,
      WEB_PORT: 5173,
      NODE_ENV: 'test',
    };
    app = await buildApp(env, silentLogger, {
      pineconeOverride: {
        describeIndex: () => Promise.resolve({ status: { ready: true } }),
        createIndex: () => Promise.resolve(undefined),
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('emits the full AC7 event sequence with text/event-stream headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sse/echo?token=${VALID_UUID}`,
      payloadAsStream: true,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['connection']).toBe('keep-alive');
    expect(res.headers['x-accel-buffering']).toBe('no');

    const payload = (res as unknown as { stream: () => NodeJS.ReadableStream }).stream();
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk.toString('utf8'));
        cb();
      },
    });
    await new Promise<void>((resolve, reject) => {
      payload.pipe(sink);
      sink.on('finish', resolve);
      sink.on('error', reject);
      payload.on('error', reject);
    });

    const raw = chunks.join('');
    const { frames } = parseSseStream(raw);

    const sequence = frames.map((f) => f.event);
    expect(sequence).toEqual([
      'thinking.start',
      'thinking.delta',
      'thinking.end',
      'message.delta',
      'message.delta',
      'tool_call.start',
      'tool_call.end',
      'cost.update',
      'done',
    ]);

    const deltas = frames
      .filter((f) => f.event === 'message.delta')
      .map((f) => (f.data as { delta: string }).delta);
    expect(deltas).toEqual(['hello ', 'from echo']);

    const toolStart = frames.find((f) => f.event === 'tool_call.start')?.data as {
      tool_name: string;
      input: { ping: number };
    };
    expect(toolStart.tool_name).toBe('echo_tool');
    expect(toolStart.input.ping).toBe(1);

    const toolEnd = frames.find((f) => f.event === 'tool_call.end')?.data as {
      status: string;
      output: { pong: number };
    };
    expect(toolEnd.status).toBe('success');
    expect(toolEnd.output.pong).toBe(1);
  });

  it('starts the response with the "retry: 1000" reconnect hint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sse/echo?token=${VALID_UUID}`,
      payloadAsStream: true,
    });
    const payload = (res as unknown as { stream: () => NodeJS.ReadableStream }).stream();
    const chunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      payload.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString('utf8'));
      });
      payload.on('end', resolve);
      payload.on('error', reject);
    });
    expect(chunks.join('').startsWith('retry: 1000\n\n')).toBe(true);
  });

  it('rejects malformed token with 400 + invalid_input envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sse/echo?token=not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; retryable: boolean } }>();
    expect(body.error.code).toBe('invalid_input');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('rejects missing token with 400 + invalid_input envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sse/echo',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('invalid_input');
  });
});

describe('/api/sse/echo client disconnect', () => {
  it('logs stream.cancelled with reason: client_disconnect when the client drops', async () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-sse-disc-${randomUUID()}-`));

    // Custom destination to capture Pino log lines
    const logLines: string[] = [];
    const captureLogger = pino({ level: 'info' }, {
      write(chunk: string) {
        logLines.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WritableStream);

    const env: Env = {
      ANTHROPIC_API_KEY: 'sk-test',
      PINECONE_INDEX: 'business-planner-intelligence',
      PINECONE_API_KEY: 'pc-stub',
      DATA_ROOT: dataRoot,
      PORT: 0,
      WEB_PORT: 5173,
      NODE_ENV: 'test',
    };
    const app = await buildApp(env, captureLogger, {
      pineconeOverride: {
        describeIndex: () => Promise.resolve({ status: { ready: true } }),
        createIndex: () => Promise.resolve(undefined),
      },
    });
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const url = `${address}/api/sse/echo?token=${VALID_UUID}`;

      const controller = new AbortController();
      const fetchPromise = fetch(url, { signal: controller.signal }).catch((err: unknown) => {
        return err;
      });

      // Let the first chunk arrive so we know the stream is live, then abort
      await new Promise((r) => setTimeout(r, 40));
      controller.abort();
      await fetchPromise;

      // Wait long enough for the server's close listener to fire and log
      await new Promise((r) => setTimeout(r, 200));

      const cancelled = logLines.find((line) => line.includes('"event":"stream.cancelled"'));
      expect(cancelled).toBeDefined();
      expect(cancelled).toContain('"reason":"client_disconnect"');
    } finally {
      await app.close();
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });
});
