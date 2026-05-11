// fetch_and_archive — pull a URL's body and archive it as a `raw_source` entry.
//
// Why this tool exists (CMT2): Tavily snippets are NOT preserved verbatim
// sources, and URLs rot. fetch_and_archive pulls the full body so that
// citations remain valid even if the source disappears. When a
// `search_result_id` is supplied, we link the archive to its originating
// search_result via a `cites` relation, making the chain
//   search_result --cites--> raw_source
// traversable by traverse_provenance.
//
// Decisions captured:
//   A3 / CMT6  — entries are immutable; we use the same INSERT ... ON CONFLICT
//                DO NOTHING / SELECT-on-miss pattern as store_entry.
//   CMT2       — raw_source preserves the body verbatim. Metadata records
//                the fetch context (url, fetched_at, content_type, etc).
//   CQ2        — error envelope: 4xx/5xx upstream, missing search_result_id,
//                unsupported content type, oversize body → PERMANENT.
//                Fetch timeouts → PERMANENT (the URL is hung; immediate
//                retry won't help — see Ambiguity policy in the assignment).
//   v1 scope   — text/html, text/plain, application/xhtml+xml only. PDFs
//                return PERMANENT 'unsupported content type' (TODO 6 in v1).
//
// Transaction integrity: the raw_source insert and the entry_relations
// insert run inside a single BEGIN/COMMIT. If the search_result_id is
// missing (FK or explicit pre-check), we ROLLBACK so no orphan
// raw_source row remains.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

const DEFAULT_MAX_BYTES = 5_000_000; // 5MB
const DEFAULT_TIMEOUT_MS = 15_000; // 15s

// Accepted MIME types (v1). PDFs are explicitly rejected (TODO 6).
const ACCEPTED_CONTENT_TYPES = new Set<string>([
  'text/html',
  'text/plain',
  'application/xhtml+xml',
]);

function parseContentType(header: string | null): string {
  if (!header) return '';
  // Strip parameters (charset, boundary, etc.) and lowercase.
  const semi = header.indexOf(';');
  const base = semi >= 0 ? header.slice(0, semi) : header;
  return base.trim().toLowerCase();
}

interface FetchedBody {
  bytes: Uint8Array;
  text: string;
  byteSize: number;
  contentType: string;
  status: number;
}

// Read the response body up to maxBytes. If the stream exceeds the cap, we
// abort the underlying request via the AbortController and throw PERMANENT.
async function readBodyCapped(
  response: Response,
  maxBytes: number,
  controller: AbortController,
): Promise<{ bytes: Uint8Array; byteSize: number }> {
  const reader = response.body?.getReader();
  if (!reader) {
    // Empty body (e.g., 204) — return zero-length buffer.
    return { bytes: new Uint8Array(0), byteSize: 0 };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      // Abort the underlying connection so we don't keep streaming.
      try {
        controller.abort();
      } catch {
        // ignore — best-effort cancel
      }
      throw permanent(`content exceeds max_bytes (${maxBytes})`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, byteSize: total };
}

async function fetchUrl(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<FetchedBody> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError = timeout (we control the only AbortController).
    // Per CMT2 / CQ2 ambiguity policy: fetch timeouts → PERMANENT. The URL
    // is slow or hung; an immediate retry from the agent won't help. The
    // user can re-run with a larger timeout_ms if appropriate.
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw permanent(`fetch timeout after ${timeoutMs}ms`, err);
    }
    if (err instanceof Error) {
      throw permanent(`fetch failed: ${err.message}`, err);
    }
    throw permanent(`fetch failed: ${String(err)}`, err);
  }

  if (response.status >= 400) {
    clearTimeout(timer);
    throw permanent(`upstream ${response.status} ${response.statusText || ''}`.trim());
  }

  const contentType = parseContentType(response.headers.get('content-type'));

  if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
    clearTimeout(timer);
    // Drain so the connection can be reused / closed cleanly.
    try {
      controller.abort();
    } catch {
      // ignore
    }
    throw permanent(
      `unsupported content type: ${contentType || '(missing)'}`,
    );
  }

  let body: { bytes: Uint8Array; byteSize: number };
  try {
    body = await readBodyCapped(response, maxBytes, controller);
  } finally {
    clearTimeout(timer);
  }

  // Decode as UTF-8 (works for text/html, text/plain, xhtml). If the
  // upstream is a different charset the agent will see lossy text — v1
  // accepts this; charset-aware decoding is a follow-up.
  const text = new TextDecoder('utf-8').decode(body.bytes);

  return {
    bytes: body.bytes,
    text,
    byteSize: body.byteSize,
    contentType,
    status: response.status,
  };
}

interface FetchAndArchiveResult {
  id: string;
  was_new: boolean;
  content_type: string;
  byte_size: number;
  relation_inserted: boolean;
}

export const fetchAndArchive = defineDbTool({
  name: 'fetch_and_archive',
  description:
    "Fetch a URL and store the full content as a raw_source entry, " +
    "preserving the source verbatim against link rot. Optionally links to " +
    "an existing search_result entry via a 'cites' relation so the chain " +
    '(search_result -> raw_source) is traversable. v1 supports HTML and ' +
    "plain text; PDFs return PERMANENT 'unsupported content type' (TODO 6 " +
    'covers PDF support).',
  inputShape: {
    url: z.string().url(),
    search_result_id: z.string().uuid().optional(),
    max_bytes: z.number().int().min(1024).max(20_000_000).optional(),
    timeout_ms: z.number().int().min(1_000).max(60_000).optional(),
  },
  handler: async (input, { db }): Promise<FetchAndArchiveResult> => {
    const maxBytes = input.max_bytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    // 1-6: fetch + classify + hash. Outside the DB transaction so we don't
    // hold a row lock while waiting on a slow upstream.
    const fetched = await fetchUrl(input.url, maxBytes, timeoutMs);

    const contentHash = createHash('sha256').update(fetched.bytes).digest('hex');

    const metadata = {
      url: input.url,
      fetched_at: new Date().toISOString(),
      content_type: fetched.contentType,
      byte_size: fetched.byteSize,
      status: fetched.status,
    };

    // 7: transactional DB work. If the search_result_id check fails, we
    // ROLLBACK so the raw_source insert is undone and no orphan row remains.
    await db.query('BEGIN');
    try {
      // 8: idempotent raw_source insert (A3 / CMT6).
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO entries (type, content, content_hash, metadata, created_by)
         VALUES ('raw_source', $1, $2, $3::jsonb, 'agent')
         ON CONFLICT (type, content_hash) DO NOTHING
         RETURNING id`,
        [fetched.text, contentHash, JSON.stringify(metadata)],
      );

      let rawSourceId: string;
      let wasNew: boolean;
      if (insertResult.rows.length === 1 && insertResult.rows[0]) {
        rawSourceId = insertResult.rows[0].id;
        wasNew = true;
      } else {
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM entries WHERE type = 'raw_source' AND content_hash = $1`,
          [contentHash],
        );
        const row = existing.rows[0];
        if (!row) {
          throw permanent(
            `fetch_and_archive: failed to resolve entry id for hash ${contentHash}`,
          );
        }
        rawSourceId = row.id;
        wasNew = false;
      }

      // 9: optional cites relation.
      let relationInserted = false;
      if (input.search_result_id) {
        // Validate the search_result_id exists. We check explicitly (rather
        // than relying on the FK error) so we can return a clean PERMANENT
        // message; the FK would also fire but the SQLSTATE 23xxx text is
        // less actionable for the agent.
        const found = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM entries WHERE id = $1`,
          [input.search_result_id],
        );
        const count = Number(found.rows[0]?.count ?? '0');
        if (count === 0) {
          throw permanent(`search_result_id not found: ${input.search_result_id}`);
        }

        const relInsert = await db.query<{ from_id: string }>(
          `INSERT INTO entry_relations (from_id, to_id, relation_type, metadata)
           VALUES ($1, $2, 'cites', '{}'::jsonb)
           ON CONFLICT (from_id, to_id, relation_type) DO NOTHING
           RETURNING from_id`,
          [input.search_result_id, rawSourceId],
        );
        relationInserted = relInsert.rows.length === 1;
      }

      await db.query('COMMIT');

      return {
        id: rawSourceId,
        was_new: wasNew,
        content_type: fetched.contentType,
        byte_size: fetched.byteSize,
        relation_inserted: relationInserted,
      };
    } catch (err) {
      // ROLLBACK is best-effort — if the connection is already broken
      // there's nothing to roll back. The pool will reset the client.
      try {
        await db.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }
  },
});
