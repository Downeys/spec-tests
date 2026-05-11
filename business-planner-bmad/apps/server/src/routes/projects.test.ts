import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { buildApp } from '../buildApp.js';
import type { Env } from '../config/env.js';

const silentLogger = pino({ level: 'silent' });

describe('/api/projects routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataRoot: string;

  beforeAll(async () => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-projroutes-${randomUUID()}-`));
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

  it('POST returns 201 with snake_case body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'radio-app', description: 'test' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      project_id: string;
      name: string;
      description: string;
      namespace: string;
      created_at: string;
    }>();
    expect(body.name).toBe('radio-app');
    expect(body.namespace).toBe(body.project_id);
    expect(typeof body.created_at).toBe('string');
  });

  it('POST with missing name returns 400 + invalid_input envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { description: 'only desc' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; retryable: boolean } }>();
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.retryable).toBe(false);
  });

  it('POST with empty string name returns 400 + invalid_input envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: '', description: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('invalid_input');
  });

  it('GET returns an array sorted by created_at desc', async () => {
    // create two more for ordering
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'alpha', description: '' },
    });
    await new Promise((r) => setTimeout(r, 5));
    const latest = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'beta', description: '' },
    });
    const latestId = latest.json<{ project_id: string }>().project_id;

    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ project_id: string; name: string; created_at: string }>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]?.project_id).toBe(latestId);
    for (let i = 1; i < body.length; i++) {
      const prev = body[i - 1];
      const curr = body[i];
      if (!prev || !curr) throw new Error('unexpected gap');
      expect(prev.created_at >= curr.created_at).toBe(true);
    }
  });

  it('DELETE existing project returns 204 and excludes from list', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'to-delete', description: '' },
    });
    const id = created.json<{ project_id: string }>().project_id;

    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${id}` });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/api/projects' });
    const body = list.json<Array<{ project_id: string }>>();
    expect(body.find((p) => p.project_id === id)).toBeUndefined();
  });

  it('DELETE unknown id returns 404 + not_found envelope', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${randomUUID()}`,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  });
});
