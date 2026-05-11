import { describe, it, expect } from 'vitest';
import { isOk, isErr } from '@bp-agent/domain';
import { createApiClient } from './api-client';

const BASE = 'http://127.0.0.1:4317';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient defaults', () => {
  it('falls back to globalThis.fetch when no fetch arg is provided', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ status: 'ok', activeStrategy: null }))) as typeof fetch;
    try {
      const client = createApiClient({ baseUrl: BASE });
      const result = await client.getHealth();
      expect(isOk(result)).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('createApiClient.getHealth', () => {
  it('returns ok with the parsed snapshot on 200', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(_input)).toBe(`${BASE}/api/health`);
      expect(init?.signal).toBeDefined();
      return Promise.resolve(jsonResponse({ status: 'ok', activeStrategy: 'alpha' }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.getHealth();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ status: 'ok', activeStrategy: 'alpha' });
  });

  it('returns ok with activeStrategy null', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ status: 'ok', activeStrategy: null }));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.getHealth();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.activeStrategy).toBeNull();
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.getHealth();
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns NetworkError on 5xx with no parseable body', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(new Response('not json', { status: 502 }));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.getHealth();
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.getHealth();
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });

  it("returns RequestTimeout when the caller's signal aborts", async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const callerCtl = new AbortController();
    const pending = client.getHealth({ signal: callerCtl.signal });
    callerCtl.abort();
    const result = await pending;
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });

  it('returns NetworkError when 200 body fails schema parsing', async () => {
    const fetchStub = (): Promise<Response> => Promise.resolve(jsonResponse({ wrong: 'shape' }));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.getHealth();
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });
});

describe('createApiClient.listStrategies', () => {
  it('returns ok with the parsed items array', async () => {
    const fetchStub = (input: RequestInfo | URL): Promise<Response> => {
      expect(String(input)).toBe(`${BASE}/api/strategies`);
      return Promise.resolve(
        jsonResponse({
          items: [
            { name: 'alpha', status: 'active', isActive: true },
            { name: 'bravo', status: 'active', isActive: false },
          ],
        }),
      );
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.name).toBe('alpha');
  });

  it('appends ?all=true when all is set', async () => {
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL): Promise<Response> => {
      seenUrl = String(input);
      return Promise.resolve(jsonResponse({ items: [] }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    await client.listStrategies({ all: true });
    expect(seenUrl).toBe(`${BASE}/api/strategies?all=true`);
  });

  it('maps RepositoryError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'RepositoryError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RepositoryError');
  });

  it('maps ConfigError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'ConfigError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('ConfigError');
  });

  it('maps StrategyNotFound tag (404) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyNotFound' }, 404));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyNotFound');
  });

  it('collapses unknown error tags to InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'SomethingNew' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('returns NetworkError when error body is not a tagged object', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(new Response('plain text', { status: 400 }));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('strips trailing slashes from baseUrl', async () => {
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL): Promise<Response> => {
      seenUrl = String(input);
      return Promise.resolve(jsonResponse({ items: [] }));
    };
    const client = createApiClient({ baseUrl: `${BASE}/`, fetch: fetchStub });
    await client.listStrategies({});
    expect(seenUrl).toBe(`${BASE}/api/strategies`);
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.listStrategies({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });
});

describe('createApiClient.createStrategy', () => {
  it('POSTs the name as JSON and returns ok with the parsed strategy', async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(input);
      seenInit = init;
      return Promise.resolve(
        jsonResponse({ strategy: { name: 'gamma', status: 'active', isActive: true } }, 201),
      );
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(seenUrl).toBe(`${BASE}/api/strategies`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.body).toBe(JSON.stringify({ name: 'gamma' }));
    expect(seenInit?.signal).toBeDefined();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ name: 'gamma', status: 'active', isActive: true });
  });

  it('maps NameInvalid tag (400) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'NameInvalid' }, 400));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NameInvalid');
  });

  it('maps StrategyAlreadyExists tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyAlreadyExists' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyAlreadyExists');
  });

  it('maps RepositoryError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'RepositoryError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RepositoryError');
  });

  it('maps ConfigError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'ConfigError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('ConfigError');
  });

  it('collapses unknown error tags to InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'WhoKnows' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('rejects StrategyNotFound (not a create-side tag) as InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyNotFound' }, 404));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.createStrategy({ name: 'gamma' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });
});

describe('createApiClient.switchActiveStrategy', () => {
  it('PUTs the name as JSON and returns ok with the parsed strategy', async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(input);
      seenInit = init;
      return Promise.resolve(jsonResponse({ strategy: { name: 'alpha' } }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(seenUrl).toBe(`${BASE}/api/strategies/active`);
    expect(seenInit?.method).toBe('PUT');
    expect(seenInit?.body).toBe(JSON.stringify({ name: 'alpha' }));
    expect(seenInit?.signal).toBeDefined();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ name: 'alpha' });
  });

  it('maps NameInvalid tag (400) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'NameInvalid' }, 400));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NameInvalid');
  });

  it('maps StrategyNotFound tag (404) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyNotFound' }, 404));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'ghost' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyNotFound');
  });

  it('maps StrategyIsArchived tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyIsArchived' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'oldname' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyIsArchived');
  });

  it('maps RepositoryError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'RepositoryError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RepositoryError');
  });

  it('maps ConfigError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'ConfigError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('ConfigError');
  });

  it('collapses unknown error tags to InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'WhoKnows' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.switchActiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });
});

describe('createApiClient.renameStrategy', () => {
  it('PATCHes to /api/strategies/:name with newName and returns ok with the parsed strategy', async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(input);
      seenInit = init;
      return Promise.resolve(jsonResponse({ strategy: { name: 'gamma2', status: 'active' } }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'gamma', newName: 'gamma2' });
    expect(seenUrl).toBe(`${BASE}/api/strategies/gamma`);
    expect(seenInit?.method).toBe('PATCH');
    expect(seenInit?.body).toBe(JSON.stringify({ newName: 'gamma2' }));
    expect(seenInit?.signal).toBeDefined();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ name: 'gamma2', status: 'active' });
  });

  it('URL-encodes special characters in the name path segment', async () => {
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL): Promise<Response> => {
      seenUrl = String(input);
      return Promise.resolve(jsonResponse({ strategy: { name: 'b', status: 'active' } }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    await client.renameStrategy({ name: 'a b', newName: 'b' });
    expect(seenUrl).toBe(`${BASE}/api/strategies/a%20b`);
  });

  it('maps NameInvalid tag (400) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'NameInvalid' }, 400));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NameInvalid');
  });

  it('maps StrategyNotFound tag (404) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyNotFound' }, 404));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'ghost', newName: 'g' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyNotFound');
  });

  it('maps StrategyAlreadyExists tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyAlreadyExists' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyAlreadyExists');
  });

  it('maps IllegalTransition tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'IllegalTransition' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('IllegalTransition');
  });

  it('maps RepositoryError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'RepositoryError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RepositoryError');
  });

  it('maps ConfigError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'ConfigError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('ConfigError');
  });

  it('collapses unknown error tags to InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'WhoKnows' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('rejects CannotArchiveActive (not a rename-side tag) as InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'CannotArchiveActive' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.renameStrategy({ name: 'a', newName: 'b' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });
});

describe('createApiClient.archiveStrategy', () => {
  it('PATCHes archived=true (no reason) and returns ok with the parsed strategy', async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = '';
    const fetchStub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(input);
      seenInit = init;
      return Promise.resolve(jsonResponse({ strategy: { name: 'bravo', status: 'archived' } }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(seenUrl).toBe(`${BASE}/api/strategies/bravo`);
    expect(seenInit?.method).toBe('PATCH');
    expect(seenInit?.body).toBe(JSON.stringify({ archived: true }));
    expect(seenInit?.signal).toBeDefined();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ name: 'bravo', status: 'archived' });
  });

  it('PATCHes archived=true with a reason when provided', async () => {
    let seenBody: BodyInit | null | undefined;
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenBody = init?.body;
      return Promise.resolve(jsonResponse({ strategy: { name: 'bravo', status: 'archived' } }));
    };
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    await client.archiveStrategy({ name: 'bravo', reason: 'pivoting' });
    expect(seenBody).toBe(JSON.stringify({ archived: true, reason: 'pivoting' }));
  });

  it('maps NameInvalid tag (400) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'NameInvalid' }, 400));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NameInvalid');
  });

  it('maps StrategyNotFound tag (404) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyNotFound' }, 404));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'ghost' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('StrategyNotFound');
  });

  it('maps CannotArchiveActive tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'CannotArchiveActive' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'alpha' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('CannotArchiveActive');
  });

  it('maps IllegalTransition tag (409) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'IllegalTransition' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('IllegalTransition');
  });

  it('maps RepositoryError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'RepositoryError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RepositoryError');
  });

  it('maps ConfigError tag (500) onto the typed error', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'ConfigError' }, 500));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('ConfigError');
  });

  it('collapses unknown error tags to InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'WhoKnows' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('rejects StrategyAlreadyExists (not an archive-side tag) as InternalError', async () => {
    const fetchStub = (): Promise<Response> =>
      Promise.resolve(jsonResponse({ tag: 'StrategyAlreadyExists' }, 409));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('InternalError');
  });

  it('returns NetworkError when fetch rejects', async () => {
    const fetchStub = (): Promise<Response> => Promise.reject(new Error('boom'));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('NetworkError');
  });

  it('returns RequestTimeout when the request never resolves and timeout fires', async () => {
    const fetchStub = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchStub, timeoutMs: 10 });
    const result = await client.archiveStrategy({ name: 'bravo' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.tag).toBe('RequestTimeout');
  });
});
