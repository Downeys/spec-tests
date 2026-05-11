import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileStrategyRepository, JsonFileRuntimeConfig } from '@bp-agent/external';
import { createApp } from './server.js';
import { bindAndServe } from './bind.js';
import { isOk } from '@bp-agent/domain';
import type { ServerHandle } from './bind.js';

function bootTmpServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-api-test-'));
  const dataDir = path.join(tmpDir, 'data');
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });

  const repo = new JsonFileStrategyRepository(path.join(dataDir, 'strategies.json'));
  const config = new JsonFileRuntimeConfig(path.join(configDir, 'runtime.json'));
  const app = createApp({ repo, config });

  return { tmpDir, app };
}

describe('API integration', () => {
  let handle: ServerHandle | undefined;
  let tmpDir: string;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('boots a real Hono server and serves GET /api/health', async () => {
    const server = bootTmpServer();
    tmpDir = server.tmpDir;

    const result = await bindAndServe(server.app, { host: '127.0.0.1', port: 0 });
    expect(result.tag).toBe('ok');
    if (!isOk(result)) throw new Error('bind failed');
    handle = result.value;

    const res = await fetch(`${handle.url}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ok', activeStrategy: null });
  });

  it('returns 400 MalformedJsonBody for invalid JSON over real fetch', async () => {
    const server = bootTmpServer();
    tmpDir = server.tmpDir;

    const result = await bindAndServe(server.app, { host: '127.0.0.1', port: 0 });
    expect(result.tag).toBe('ok');
    if (!isOk(result)) throw new Error('bind failed');
    handle = result.value;

    const res = await fetch(`${handle.url}/api/strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe('MalformedJsonBody');
  });

  it('e2e: create → list → switch → archive lifecycle over real fetch', async () => {
    const server = bootTmpServer();
    tmpDir = server.tmpDir;

    const result = await bindAndServe(server.app, { host: '127.0.0.1', port: 0 });
    expect(result.tag).toBe('ok');
    if (!isOk(result)) throw new Error('bind failed');
    handle = result.value;
    const base = handle.url;

    // 1. Create strategy "alpha"
    const createAlpha = await fetch(`${base}/api/strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alpha' }),
    });
    expect(createAlpha.status).toBe(201);
    const alphaBody = (await createAlpha.json()) as {
      strategy: { name: string; status: string; isActive: boolean };
    };
    expect(alphaBody.strategy.name).toBe('alpha');
    expect(alphaBody.strategy.status).toBe('active');
    expect(alphaBody.strategy.isActive).toBe(true);

    // 2. Create strategy "bravo" — becomes active
    const createBravo = await fetch(`${base}/api/strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bravo' }),
    });
    expect(createBravo.status).toBe(201);
    const bravoBody = (await createBravo.json()) as {
      strategy: { name: string; isActive: boolean };
    };
    expect(bravoBody.strategy.name).toBe('bravo');
    expect(bravoBody.strategy.isActive).toBe(true);

    // 3. List — both exist, bravo is active
    const listRes = await fetch(`${base}/api/strategies`);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      items: { name: string; status: string; isActive: boolean }[];
    };
    expect(listBody.items).toHaveLength(2);
    expect(listBody.items).toContainEqual({ name: 'alpha', status: 'active', isActive: false });
    expect(listBody.items).toContainEqual({ name: 'bravo', status: 'active', isActive: true });

    // 4. Switch back to alpha
    const switchRes = await fetch(`${base}/api/strategies/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alpha' }),
    });
    expect(switchRes.status).toBe(200);
    const switchBody = (await switchRes.json()) as { strategy: { name: string } };
    expect(switchBody.strategy.name).toBe('alpha');

    // 5. Archive bravo (not active, so allowed)
    const archiveRes = await fetch(`${base}/api/strategies/bravo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true, reason: 'pivoting' }),
    });
    expect(archiveRes.status).toBe(200);
    const archiveBody = (await archiveRes.json()) as {
      strategy: { name: string; status: string };
    };
    expect(archiveBody.strategy.name).toBe('bravo');
    expect(archiveBody.strategy.status).toBe('archived');

    // 6. List again — only alpha visible (bravo archived)
    const listAfter = await fetch(`${base}/api/strategies`);
    expect(listAfter.status).toBe(200);
    const listAfterBody = (await listAfter.json()) as {
      items: { name: string; isActive: boolean }[];
    };
    expect(listAfterBody.items).toHaveLength(1);
    expect(listAfterBody.items[0]?.name).toBe('alpha');
    expect(listAfterBody.items[0]?.isActive).toBe(true);

    // 7. List with all=true — bravo shows as archived
    const listAll = await fetch(`${base}/api/strategies?all=true`);
    expect(listAll.status).toBe(200);
    const listAllBody = (await listAll.json()) as {
      items: { name: string; status: string; isActive: boolean }[];
    };
    expect(listAllBody.items).toHaveLength(2);
    expect(listAllBody.items).toContainEqual({
      name: 'bravo',
      status: 'archived',
      isActive: false,
    });
  });
});
