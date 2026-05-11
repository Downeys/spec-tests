import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { AgentEvent, IsoUtcTimestamp, Project, ProjectId } from '@bp/shared';
import { registerMessageRoutes } from './messages.js';
import { registerErrorHooks } from '../errors/index.js';
import { createMessageStore } from '../domain/messageStore.js';
import { createSseRegistry } from '../events/registry.js';
import type { ProjectService } from '../domain/projectService.js';

const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const VALID_PROJECT = '11111111-1111-4111-8111-111111111111';

function buildTestApp(deps: Parameters<typeof registerMessageRoutes>[1]): FastifyInstance {
  const app = Fastify({ logger: false });
  registerErrorHooks(app);
  registerMessageRoutes(app, deps);
  return app;
}

function stubProjectService(exists: boolean, project?: Partial<Project>): ProjectService {
  const full: Project = {
    project_id: VALID_PROJECT as ProjectId,
    name: project?.name ?? 'test',
    description: project?.description ?? '',
    namespace: VALID_PROJECT,
    created_at: new Date().toISOString() as IsoUtcTimestamp,
  };
  const svc: ProjectService = {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn(),
    getById: vi.fn().mockResolvedValue(exists ? full : null),
  };
  return svc;
}

async function consumeStream(res: {
  stream: () => NodeJS.ReadableStream;
}): Promise<string> {
  const payload = res.stream();
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
  return chunks.join('');
}

describe('messages route validation', () => {
  let dataRoot: string;
  let app: FastifyInstance;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-msg-route-${randomUUID()}-`));
    app = buildTestApp({
      projectService: stubProjectService(true),
      messageStore: createMessageStore({ dataRoot }),
      sseRegistry: createSseRegistry(),
      runOrchestrator: vi.fn().mockResolvedValue({
        messageId: randomUUID(),
        usage: { input_tokens: 0, output_tokens: 0 },
        content: '',
        totalCostUsd: 0,
      }),
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('POST rejects missing sse_token with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${VALID_PROJECT}/messages`,
      payload: { content: 'hi' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('invalid_input');
  });

  it('POST rejects non-uuid sse_token with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${VALID_PROJECT}/messages`,
      payload: { content: 'hi', sse_token: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects non-uuid project_id with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/nope/messages',
      payload: { content: 'hi', sse_token: VALID_TOKEN },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects unknown sse_token with 404 not_found', async () => {
    // Valid shape; never registered via GET /api/sse/messages
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${VALID_PROJECT}/messages`,
      payload: { content: 'hi', sse_token: VALID_TOKEN },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  });
});

describe('messages route project lookup', () => {
  it('POST returns 404 when project does not exist', async () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-msg-missing-${randomUUID()}-`));
    const app = buildTestApp({
      projectService: stubProjectService(false),
      messageStore: createMessageStore({ dataRoot }),
      sseRegistry: createSseRegistry(),
      runOrchestrator: vi.fn(),
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${VALID_PROJECT}/messages`,
        payload: { content: 'hi', sse_token: VALID_TOKEN },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });
});

describe('GET /api/sse/messages', () => {
  it('rejects missing/invalid token with 400', async () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-sse-msg-400-${randomUUID()}-`));
    const app = buildTestApp({
      projectService: stubProjectService(true),
      messageStore: createMessageStore({ dataRoot }),
      sseRegistry: createSseRegistry(),
      runOrchestrator: vi.fn(),
    });
    try {
      const r1 = await app.inject({ method: 'GET', url: '/api/sse/messages' });
      expect(r1.statusCode).toBe(400);
      const r2 = await app.inject({ method: 'GET', url: '/api/sse/messages?token=nope' });
      expect(r2.statusCode).toBe(400);
    } finally {
      await app.close();
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });
});

describe('end-to-end happy path (unit, mocked orchestrator)', () => {
  let dataRoot: string;
  let app: FastifyInstance;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-msg-e2e-${randomUUID()}-`));
  });

  afterEach(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('registers SSE token, accepts POST 202, emits events through the stream, persists messages', async () => {
    const store = createMessageStore({ dataRoot });
    const registry = createSseRegistry();

    const runOrchestrator = vi.fn((params: {
      onEvent: (e: AgentEvent) => void;
      userMessage: { message_id: string };
    }) => {
      const mid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      params.onEvent({ type: 'message.delta', message_id: mid as never, delta: 'Hi' });
      params.onEvent({ type: 'message.delta', message_id: mid as never, delta: ' there' });
      params.onEvent({
        type: 'cost.update',
        session_cost_usd: 0.01,
        project_cost_usd_cumulative: 0.01,
      });
      params.onEvent({
        type: 'done',
        message_id: mid as never,
        usage: { input_tokens: 1, output_tokens: 2 },
      });
      return Promise.resolve({ messageId: mid as never, usage: { input_tokens: 1, output_tokens: 2 }, content: 'Hi there', totalCostUsd: 0.01 });
    });

    app = buildTestApp({
      projectService: stubProjectService(true),
      messageStore: store,
      sseRegistry: registry,
      runOrchestrator,
    });

    // Start SSE stream
    const ssePromise = app.inject({
      method: 'GET',
      url: `/api/sse/messages?token=${VALID_TOKEN}`,
      payloadAsStream: true,
    });

    // Give the SSE route a tick to register.
    await new Promise((r) => setTimeout(r, 20));
    expect(registry.size()).toBe(1);

    // Fire the POST
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${VALID_PROJECT}/messages`,
      payload: { content: 'hello', sse_token: VALID_TOKEN },
    });
    expect(postRes.statusCode).toBe(202);
    const postBody = postRes.json<{
      user_message: { content: string; role: string };
      assistant_message_id: string;
    }>();
    expect(postBody.user_message.content).toBe('hello');
    expect(postBody.user_message.role).toBe('user');
    expect(postBody.assistant_message_id).toMatch(/^[0-9a-f-]{36}$/);

    // Registry must be consumed
    expect(registry.size()).toBe(0);

    // Read the SSE stream to EOF (orchestrator will close it)
    const sseRes = await ssePromise;
    const raw = await consumeStream(sseRes);

    expect(sseRes.statusCode).toBe(200);
    expect(sseRes.headers['content-type']).toBe('text/event-stream');

    const events = raw
      .split('\n\n')
      .map((block) => block.split('\n').find((l) => l.startsWith('event: '))?.slice('event: '.length))
      .filter(Boolean);

    expect(events).toEqual(['message.delta', 'message.delta', 'cost.update', 'done']);

    // User message persisted (assistant persistence is the orchestrator's job in real runs)
    const rows = await store.list(VALID_PROJECT, 'default');
    expect(rows[0]?.role).toBe('user');
    expect(rows[0]?.content).toBe('hello');

    // Sanity check: raw content on disk is valid JSONL
    const raw2 = await readFile(
      path.join(dataRoot, 'sessions', VALID_PROJECT, 'default.jsonl'),
      'utf8',
    );
    expect(raw2.split('\n').filter(Boolean)).toHaveLength(1);
  });
});
