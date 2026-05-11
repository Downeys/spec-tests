import { describe, it, expect } from 'vitest';
import type { StrategyId } from '@bp-agent/domain';
import { err } from '@bp-agent/domain';
import type { StrategyRepository } from '@bp-agent/application';
import { createApp } from '../server.js';
import { stubConfig, stubRepo, makeStrategy, makeArchivedStrategy } from '../test-stubs.js';

const ID_A = 'aaaaaaaa-0000-4000-a000-000000000001' as StrategyId;
const ID_B = 'aaaaaaaa-0000-4000-a000-000000000002' as StrategyId;

interface ListBody {
  items: { name: string; status: string; isActive: boolean }[];
}

interface ErrorBody {
  tag: string;
  message?: string;
  [key: string]: unknown;
}

interface StrategyBody {
  strategy: { name: string; status?: string; isActive?: boolean };
}

function jsonPost(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonPut(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonPatch(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/strategies', () => {
  it('returns non-archived strategies with the active one flagged', async () => {
    const active = makeStrategy(ID_A, 'alpha');
    const other = makeStrategy(ID_B, 'bravo');
    const entries = new Map([
      [ID_A, active],
      [ID_B, other],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request('/api/strategies');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ListBody;
    expect(body.items).toHaveLength(2);
    expect(body.items).toContainEqual({ name: 'alpha', status: 'active', isActive: true });
    expect(body.items).toContainEqual({ name: 'bravo', status: 'active', isActive: false });
  });

  it('excludes archived strategies by default', async () => {
    const active = makeStrategy(ID_A, 'alive');
    const archived = makeArchivedStrategy(ID_B, 'dead');
    const entries = new Map([
      [ID_A, active],
      [ID_B, archived],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request('/api/strategies');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ListBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe('alive');
  });

  it('includes archived strategies when all=true', async () => {
    const active = makeStrategy(ID_A, 'alive');
    const archived = makeArchivedStrategy(ID_B, 'dead');
    const entries = new Map([
      [ID_A, active],
      [ID_B, archived],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request('/api/strategies?all=true');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ListBody;
    expect(body.items).toHaveLength(2);
    expect(body.items).toContainEqual({ name: 'dead', status: 'archived', isActive: false });
  });

  it('returns 500 when the repository fails', async () => {
    const failingRepo: StrategyRepository = {
      save: () => Promise.resolve(err({ tag: 'RepositoryError', kind: 'io', message: 'boom' })),
      loadByName: () =>
        Promise.resolve(err({ tag: 'RepositoryError', kind: 'io', message: 'boom' })),
      loadById: () => Promise.resolve(err({ tag: 'RepositoryError', kind: 'io', message: 'boom' })),
      listAll: () => Promise.resolve(err({ tag: 'RepositoryError', kind: 'io', message: 'boom' })),
    };
    const app = createApp({ repo: failingRepo, config: stubConfig(null) });

    const res = await app.request('/api/strategies');
    expect(res.status).toBe(500);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('RepositoryError');
    expect(body.message).toBe('boom');
  });

  it('returns empty list when no strategies exist', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });

    const res = await app.request('/api/strategies');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ListBody;
    expect(body.items).toEqual([]);
  });
});

describe('POST /api/strategies', () => {
  it('creates a strategy and returns 201 with isActive true', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });

    const res = await app.request(jsonPost('/api/strategies', { name: 'my-strat' }));
    expect(res.status).toBe(201);

    const body = (await res.json()) as StrategyBody;
    expect(body.strategy.name).toBe('my-strat');
    expect(body.strategy.status).toBe('active');
    expect(body.strategy.isActive).toBe(true);
  });

  it('returns content-type application/json; charset=utf-8 on success', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(jsonPost('/api/strategies', { name: 'ct-test' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns 409 StrategyAlreadyExists on duplicate name', async () => {
    const entries = new Map([[ID_A, makeStrategy(ID_A, 'dupe')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPost('/api/strategies', { name: 'dupe' }));
    expect(res.status).toBe(409);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('StrategyAlreadyExists');
  });

  it('returns 400 NameInvalid for bad slug', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });

    const res = await app.request(jsonPost('/api/strategies', { name: 'B' }));
    expect(res.status).toBe(400);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('NameInvalid');
  });
});

describe('PUT /api/strategies/active', () => {
  it('switches active strategy and returns 200', async () => {
    const entries = new Map([
      [ID_A, makeStrategy(ID_A, 'alpha')],
      [ID_B, makeStrategy(ID_B, 'bravo')],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPut('/api/strategies/active', { name: 'bravo' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as StrategyBody;
    expect(body.strategy.name).toBe('bravo');
  });

  it('returns 404 StrategyNotFound for nonexistent strategy', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });

    const res = await app.request(jsonPut('/api/strategies/active', { name: 'ghost' }));
    expect(res.status).toBe(404);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('StrategyNotFound');
  });

  it('returns 409 StrategyIsArchived for archived strategy', async () => {
    const entries = new Map([[ID_A, makeArchivedStrategy(ID_A, 'old')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(null) });

    const res = await app.request(jsonPut('/api/strategies/active', { name: 'old' }));
    expect(res.status).toBe(409);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('StrategyIsArchived');
  });
});

describe('PATCH /api/strategies/:name', () => {
  it('renames a strategy and returns 200', async () => {
    const entries = new Map([[ID_A, makeStrategy(ID_A, 'old-name')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPatch('/api/strategies/old-name', { newName: 'new-name' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as StrategyBody;
    expect(body.strategy.name).toBe('new-name');
    expect(body.strategy.status).toBe('active');
  });

  it('returns 409 StrategyAlreadyExists on rename collision', async () => {
    const entries = new Map([
      [ID_A, makeStrategy(ID_A, 'alpha')],
      [ID_B, makeStrategy(ID_B, 'bravo')],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPatch('/api/strategies/alpha', { newName: 'bravo' }));
    expect(res.status).toBe(409);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('StrategyAlreadyExists');
  });

  it('archives a non-active strategy and returns 200', async () => {
    const entries = new Map([
      [ID_A, makeStrategy(ID_A, 'alpha')],
      [ID_B, makeStrategy(ID_B, 'bravo')],
    ]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPatch('/api/strategies/bravo', { archived: true }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as StrategyBody;
    expect(body.strategy.name).toBe('bravo');
    expect(body.strategy.status).toBe('archived');
  });

  it('returns 409 CannotArchiveActive when archiving active strategy', async () => {
    const entries = new Map([[ID_A, makeStrategy(ID_A, 'alpha')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPatch('/api/strategies/alpha', { archived: true }));
    expect(res.status).toBe(409);

    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('CannotArchiveActive');
  });

  it('returns 400 for mixed body with both newName and archived', async () => {
    const entries = new Map([[ID_A, makeStrategy(ID_A, 'alpha')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(
      jsonPatch('/api/strategies/alpha', { newName: 'beta', archived: true }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const entries = new Map([[ID_A, makeStrategy(ID_A, 'alpha')]]);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(ID_A) });

    const res = await app.request(jsonPatch('/api/strategies/alpha', {}));
    expect(res.status).toBe(400);
  });
});

describe('400 MalformedJsonBody', () => {
  function malformedPost(path: string, rawBody: string) {
    return new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });
  }

  function malformedPut(path: string, rawBody: string) {
    return new Request(`http://localhost${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });
  }

  function malformedPatch(path: string, rawBody: string) {
    return new Request(`http://localhost${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });
  }

  it('POST /api/strategies with malformed JSON returns 400 MalformedJsonBody', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(malformedPost('/api/strategies', '{not json}'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('MalformedJsonBody');
  });

  it('PUT /api/strategies/active with malformed JSON returns 400 MalformedJsonBody', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(malformedPut('/api/strategies/active', '{"name":alpha}'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('MalformedJsonBody');
  });

  it('PATCH /api/strategies/:name with malformed JSON returns 400 MalformedJsonBody', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(malformedPatch('/api/strategies/foo', '{'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('MalformedJsonBody');
  });

  it('POST /api/strategies with empty body returns 400 MalformedJsonBody', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(malformedPost('/api/strategies', ''));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.tag).toBe('MalformedJsonBody');
  });
});

describe('415 Content-Type guard', () => {
  it('returns 415 for POST without application/json', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(
      new Request('http://localhost/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"name":"x"}',
      }),
    );
    expect(res.status).toBe(415);
  });

  it('returns 415 for PUT without application/json', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(
      new Request('http://localhost/api/strategies/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"name":"x"}',
      }),
    );
    expect(res.status).toBe(415);
  });

  it('returns 415 for PATCH without application/json', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request(
      new Request('http://localhost/api/strategies/alpha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"newName":"x"}',
      }),
    );
    expect(res.status).toBe(415);
  });

  it('allows GET without content-type check', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request('/api/strategies');
    expect(res.status).toBe(200);
  });
});
