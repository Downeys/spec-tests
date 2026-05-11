// tavily_search — web search via Tavily. Each result is auto-stored as a
// `search_result` entry (immutable post-insert per A3/CMT6) so the agent can
// cite the entry id in any downstream finding.
//
// Idempotency: UNIQUE INDEX entries_type_hash_uniq + ON CONFLICT DO NOTHING.
// If a result already exists (same content_hash), we re-fetch its id with a
// SELECT and report `was_new: false`.
//
// Error envelope (CQ2): API key missing -> PERMANENT (user must fix .env).
// Tavily 429 / timeout / 5xx -> TRANSIENT (auto-classified by `classifyError`
// from the SDK's `status` field). Tavily 4xx (other) -> PERMANENT (auto).
// Zod-rejected input -> INVALID_INPUT (factory handles it).

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

const DEFAULT_MAX_RESULTS = 5;

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export const tavilySearch = defineDbTool({
  name: 'tavily_search',
  description:
    'Search the web via Tavily. Each result is auto-stored as a `search_result` ' +
    'entry; returns the entry id alongside content so the agent can cite. Call ' +
    'this before stating any finding sourced from the web.',
  inputShape: {
    query: z.string().min(3).max(500),
    max_results: z.number().int().min(1).max(10).optional(),
  },
  handler: async (input, { db }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || apiKey.length === 0) {
      throw permanent('TAVILY_API_KEY is not configured. Set it in .env and restart.');
    }

    const client = tavily({ apiKey });
    const maxResults = input.max_results ?? DEFAULT_MAX_RESULTS;

    // Let Tavily SDK errors propagate — the factory's classifyError reads
    // `status` and maps 429/5xx -> TRANSIENT, 4xx -> PERMANENT (CQ2).
    const response = await client.search(input.query, { maxResults });

    const fetchedAt = new Date().toISOString();
    const results: Array<{
      entry_id: string;
      title: string;
      url: string;
      snippet: string;
      was_new: boolean;
    }> = [];

    for (const r of response.results) {
      const hash = sha256(r.content);
      const metadata = {
        tavily_query: input.query,
        url: r.url,
        title: r.title,
        score: r.score,
        fetched_at: fetchedAt,
      };

      // A3 / CMT6 — entries are immutable. ON CONFLICT DO NOTHING; if no row
      // is returned the existing row's id is fetched but not updated.
      const insert = await db.query<{ id: string }>(
        `INSERT INTO entries (type, content, content_hash, metadata, created_by)
         VALUES ('search_result', $1, $2, $3::jsonb, 'agent')
         ON CONFLICT (type, content_hash) DO NOTHING
         RETURNING id`,
        [r.content, hash, JSON.stringify(metadata)],
      );

      let entryId: string;
      let wasNew: boolean;
      if (insert.rows.length === 1 && insert.rows[0]) {
        entryId = insert.rows[0].id;
        wasNew = true;
      } else {
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM entries WHERE type = 'search_result' AND content_hash = $1`,
          [hash],
        );
        const row = existing.rows[0];
        if (!row) {
          // Should be unreachable: ON CONFLICT skipped, but no row exists.
          throw permanent(`tavily_search: failed to resolve entry id for hash ${hash}`);
        }
        entryId = row.id;
        wasNew = false;
      }

      results.push({
        entry_id: entryId,
        title: r.title,
        url: r.url,
        snippet: r.content,
        was_new: wasNew,
      });
    }

    return { results };
  },
});
