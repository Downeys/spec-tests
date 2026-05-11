// Integration tests for fetch_and_archive.
//
// HTTP test approach: spin up a real http.createServer on 127.0.0.1:0 in
// beforeAll. Each test routes off req.url. Tearing down in afterAll. This
// matches end-to-end behavior (real fetch path, real headers, real status
// codes, real timeouts) and is more reliable than monkey-patching global
// fetch — Node 20+ undici doesn't always cooperate with vi.stubGlobal('fetch').

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { fetchAndArchive } from '../../src/tools/fetch-and-archive.js';
import { closePool } from '../../src/lib/db.js';

let fixture: PgFixture;
let server: http.Server;
let baseUrl: string;

// Per-test state controlling server behavior. Reset in beforeEach.
let lastRequestPath: string | null = null;

beforeAll(async () => {
  fixture = await pgFixture();
  process.env.DATABASE_URL = fixture.url;

  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    lastRequestPath = url;

    // /html — 200 OK, text/html
    if (url === '/html') {
      const body = '<html><body><h1>Hello, oneBrain</h1><p>verbatim body</p></body></html>';
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    // /html-alt — different body, used for "second URL with same path"
    if (url === '/html-alt') {
      const body = '<html><body>different verbatim body</body></html>';
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    // /plain — 200 OK, text/plain
    if (url === '/plain') {
      const body = 'plain text content from the upstream';
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(body);
      return;
    }

    // /404 — not found
    if (url === '/404') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html>not found</html>');
      return;
    }

    // /pdf — application/pdf, should be rejected
    if (url === '/pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(Buffer.from([0x25, 0x50, 0x44, 0x46])); // %PDF
      return;
    }

    // /huge — 10MB body
    if (url === '/huge') {
      const big = Buffer.alloc(10 * 1024 * 1024, 'x');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Length': big.byteLength,
      });
      res.end(big);
      return;
    }

    // /slow — never responds (until socket closed by abort).
    if (url === '/slow') {
      // Intentionally never write/end — the AbortController times out.
      // Keep the response object alive by storing nothing; close on socket
      // error so we don't leak handles after the test aborts.
      req.socket.on('close', () => {
        try {
          res.end();
        } catch {
          // ignore
        }
      });
      return;
    }

    res.writeHead(500);
    res.end('unknown route');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
  await fixture?.teardown();
});

beforeEach(async () => {
  lastRequestPath = null;
  await fixture.pool.query('TRUNCATE entries RESTART IDENTITY CASCADE');
});

interface ToolResultEnvelope {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
  errorCategory?: 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';
}

interface SuccessPayload {
  id: string;
  was_new: boolean;
  content_type: string;
  byte_size: number;
  relation_inserted: boolean;
}

function parseSuccess(result: ToolResultEnvelope): SuccessPayload {
  if (result.isError) {
    throw new Error(`expected success, got error: ${result.content[0]?.text}`);
  }
  return JSON.parse(result.content[0]?.text ?? '') as SuccessPayload;
}

async function insertSearchResult(content: string): Promise<string> {
  const { rows } = await fixture.pool.query<{ id: string }>(
    `INSERT INTO entries (type, content, content_hash, metadata, created_by)
     VALUES ('search_result', $1, $2, '{}'::jsonb, 'agent')
     RETURNING id`,
    [content, `hash-${content}`],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to seed search_result');
  return id;
}

describe('fetch_and_archive', () => {
  it('happy path (HTML): 200 -> raw_source entry with verbatim content + metadata', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/html`,
    })) as ToolResultEnvelope;
    const payload = parseSuccess(result);

    expect(payload.was_new).toBe(true);
    expect(payload.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(payload.content_type).toBe('text/html');
    expect(payload.byte_size).toBeGreaterThan(0);
    expect(payload.relation_inserted).toBe(false);

    const { rows } = await fixture.pool.query<{
      type: string;
      content: string;
      metadata: Record<string, unknown>;
      created_by: string;
    }>(`SELECT type, content, metadata, created_by FROM entries WHERE id = $1`, [
      payload.id,
    ]);

    expect(rows[0]?.type).toBe('raw_source');
    expect(rows[0]?.created_by).toBe('agent');
    expect(rows[0]?.content).toContain('Hello, oneBrain');
    expect(rows[0]?.content).toContain('verbatim body');

    const md = rows[0]?.metadata ?? {};
    expect(md.url).toBe(`${baseUrl}/html`);
    expect(md.content_type).toBe('text/html');
    expect(md.status).toBe(200);
    expect(typeof md.byte_size).toBe('number');
    expect(typeof md.fetched_at).toBe('string');
    expect(md.fetched_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('text/plain is accepted', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/plain`,
    })) as ToolResultEnvelope;
    const payload = parseSuccess(result);
    expect(payload.was_new).toBe(true);
    expect(payload.content_type).toBe('text/plain');
  });

  it('with search_result_id: cites relation is inserted, relation_inserted=true', async () => {
    const searchResultId = await insertSearchResult('seed-search-result-A');

    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/html`,
      search_result_id: searchResultId,
    })) as ToolResultEnvelope;
    const payload = parseSuccess(result);

    expect(payload.relation_inserted).toBe(true);

    const { rows } = await fixture.pool.query<{
      from_id: string;
      to_id: string;
      relation_type: string;
    }>(
      `SELECT from_id, to_id, relation_type FROM entry_relations
        WHERE from_id = $1 AND to_id = $2`,
      [searchResultId, payload.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.relation_type).toBe('cites');
  });

  it('without search_result_id: relation_inserted=false, no relation rows', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/html`,
    })) as ToolResultEnvelope;
    const payload = parseSuccess(result);

    expect(payload.relation_inserted).toBe(false);

    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(0);
  });

  it('idempotent: re-fetching same URL/content returns same id, was_new=false', async () => {
    const first = parseSuccess(
      (await fetchAndArchive.invoke({ url: `${baseUrl}/html` })) as ToolResultEnvelope,
    );
    expect(first.was_new).toBe(true);

    const second = parseSuccess(
      (await fetchAndArchive.invoke({ url: `${baseUrl}/html` })) as ToolResultEnvelope,
    );
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);

    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries WHERE type = 'raw_source'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('idempotent re-fetch with same search_result_id: relation_inserted=false (already exists)', async () => {
    const searchResultId = await insertSearchResult('seed-search-result-B');

    const first = parseSuccess(
      (await fetchAndArchive.invoke({
        url: `${baseUrl}/html`,
        search_result_id: searchResultId,
      })) as ToolResultEnvelope,
    );
    expect(first.was_new).toBe(true);
    expect(first.relation_inserted).toBe(true);

    const second = parseSuccess(
      (await fetchAndArchive.invoke({
        url: `${baseUrl}/html`,
        search_result_id: searchResultId,
      })) as ToolResultEnvelope,
    );
    expect(second.was_new).toBe(false);
    expect(second.relation_inserted).toBe(false);

    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('404 response: PERMANENT envelope mentioning 404', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/404`,
    })) as ToolResultEnvelope;

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0]?.text).toMatch(/404/);
  });

  it(
    'timeout: server delays past timeout_ms -> PERMANENT (timeout)',
    async () => {
      const result = (await fetchAndArchive.invoke({
        url: `${baseUrl}/slow`,
        timeout_ms: 1_000,
      })) as ToolResultEnvelope;

      expect(result.isError).toBe(true);
      // Classification: PERMANENT. Justification — see fetch-and-archive.ts:
      // a hung URL won't recover on immediate retry; the agent should surface
      // to the user (who can retry with a larger timeout if appropriate).
      expect(result.errorCategory).toBe('PERMANENT');
      expect(result.content[0]?.text).toMatch(/timeout/i);
    },
    20_000,
  );

  it('exceeds max_bytes: 10MB body with max_bytes=1024 -> PERMANENT', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/huge`,
      max_bytes: 1024,
    })) as ToolResultEnvelope;

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0]?.text).toMatch(/max_bytes/);
  });

  it('PDF Content-Type: PERMANENT unsupported content type', async () => {
    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/pdf`,
    })) as ToolResultEnvelope;

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0]?.text).toMatch(/unsupported content type/);
    expect(result.content[0]?.text).toMatch(/application\/pdf/);
  });

  it('dangling search_result_id: PERMANENT and raw_source row is rolled back', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const beforeRows = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries WHERE type = 'raw_source'`,
    );
    const before = Number(beforeRows.rows[0]?.count ?? '0');

    const result = (await fetchAndArchive.invoke({
      url: `${baseUrl}/html`,
      search_result_id: fakeId,
    })) as ToolResultEnvelope;

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0]?.text).toMatch(/search_result_id not found/);

    // Transaction integrity: the raw_source insert must have been rolled
    // back. Otherwise we'd have an orphan archive with no relation.
    const afterRows = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries WHERE type = 'raw_source'`,
    );
    const after = Number(afterRows.rows[0]?.count ?? '0');
    expect(after).toBe(before);
  });

  it('malformed URL: INVALID_INPUT (Zod url())', async () => {
    const result = (await fetchAndArchive.invoke({
      url: 'not a url',
    })) as ToolResultEnvelope;

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe('INVALID_INPUT');
    // The HTTP server must NOT have been hit.
    expect(lastRequestPath).toBeNull();
  });
});
