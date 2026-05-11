import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { buildApp } from '../buildApp.js';
import type { Env } from '../config/env.js';
import { AppError } from './AppError.js';

const silentLogger = pino({ level: 'silent' });

describe('error hook', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataRoot: string;

  beforeAll(async () => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-errhook-${randomUUID()}-`));
    const fakeEnv: Env = {
      ANTHROPIC_API_KEY: 'sk-test',
      PINECONE_INDEX: 'business-planner-intelligence',
      DATA_ROOT: dataRoot,
      PORT: 3000,
      WEB_PORT: 5173,
      NODE_ENV: 'test',
    };
    app = await buildApp(fakeEnv, silentLogger, {
      pineconeOverride: {
        describeIndex: () => Promise.resolve({ status: { ready: true } }),
        createIndex: () => Promise.resolve(undefined),
      },
    });
    app.get('/__throw_app_error', () => {
      throw new AppError('rate_limited', 'slow down', {
        status: 429,
        retryable: true,
      });
    });
    app.get('/__throw_generic', () => {
      throw new Error('boom');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('serializes AppError into the shared envelope with the right status', async () => {
    const res = await app.inject({ method: 'GET', url: '/__throw_app_error' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'slow down',
        retryable: true,
      },
    });
  });

  it('masks unknown exceptions behind a generic 500 envelope and never leaks the message or stack', async () => {
    const res = await app.inject({ method: 'GET', url: '/__throw_generic' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: {
        code: 'internal',
        message: 'internal_error',
        retryable: false,
      },
    });
    expect(res.body).not.toContain('boom');
    expect(res.body).not.toContain('at ');
  });

  it('returns the same envelope shape on 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('not_found');
    expect(body.error.retryable).toBe(false);
    expect(typeof body.error.message).toBe('string');
  });
});
