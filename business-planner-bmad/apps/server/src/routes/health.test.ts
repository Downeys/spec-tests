import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { buildApp } from '../buildApp.js';
import type { Env } from '../config/env.js';
import pkg from '../../package.json' with { type: 'json' };

const silentLogger = pino({ level: 'silent' });

describe('GET /healthz', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataRoot: string;

  beforeAll(async () => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-health-${randomUUID()}-`));
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
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('returns 200 with the snake_case health envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      status: string;
      uptime_seconds: number;
      version: string;
    }>();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime_seconds).toBe('number');
    expect(Number.isInteger(body.uptime_seconds)).toBe(true);
    expect(body.version).toBe(pkg.version);
    expect(Object.keys(body).sort()).toEqual(['status', 'uptime_seconds', 'version'].sort());
  });
});
