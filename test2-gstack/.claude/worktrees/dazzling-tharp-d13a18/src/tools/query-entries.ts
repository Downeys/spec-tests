// query_entries — filter entries by tags / type / since / FTS, return
// summaries ordered by created_at DESC. The agent's primary recall tool;
// pair with get_entry to drill into full content.
//
// Indexes used (from migrations/1745539200000_initial-schema.sql):
//   - entries_type_idx           (type filter)
//   - entries_metadata_gin       (tags filter via JSONB containment)
//   - entries_content_fts        (full-text search)
//
// All filters are optional. With no filters, the tool returns the most
// recent N entries (ORDER BY created_at DESC LIMIT $n). Filters compose
// as AND.
//
// SQL is built parameterized — never string-interpolate user input.

import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';

const ENTRY_TYPES = [
  'raw_source',
  'search_result',
  'user_observation',
  'finding',
  'contradiction',
] as const;

const SNIPPET_LEN = 200;

interface EntryRow {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

interface EntrySummary {
  id: string;
  type: string;
  content_snippet: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function snippet(content: string): string {
  if (content.length <= SNIPPET_LEN) return content;
  return content.slice(0, SNIPPET_LEN) + '...';
}

export const queryEntries = defineDbTool({
  name: 'query_entries',
  description:
    'Filter entries by tags / type / since-date / full-text search. Returns up to ' +
    'limit entry summaries (default 20, max 100), ordered by created_at DESC. ' +
    'Use this to recall what oneBrain knows. Each result includes the entry id; ' +
    'use get_entry to drill into the full content.',
  inputShape: {
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    type: z.enum(ENTRY_TYPES).optional(),
    since: z.string().datetime().optional(),
    search: z.string().min(2).max(500).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  handler: async (input, { db }) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (input.tags && input.tags.length > 0) {
      params.push(JSON.stringify(input.tags));
      where.push(`metadata->'tags' @> $${params.length}::jsonb`);
    }

    if (input.type) {
      params.push(input.type);
      where.push(`type = $${params.length}`);
    }

    if (input.since) {
      params.push(input.since);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }

    if (input.search) {
      // plainto_tsquery (not to_tsquery) so multi-word queries work without
      // forcing the agent to construct boolean operator strings. plainto
      // tokenizes "music licensing" as 'music & licensing' under the hood.
      params.push(input.search);
      where.push(
        `to_tsvector('english', content) @@ plainto_tsquery('english', $${params.length})`,
      );
    }

    const limit = input.limit ?? 20;
    params.push(limit);
    const limitParam = `$${params.length}`;

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT id, type, content, metadata, created_at
      FROM entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam}
    `;

    const { rows } = await db.query<EntryRow>(sql, params);

    const entries: EntrySummary[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      content_snippet: snippet(r.content),
      metadata: r.metadata,
      created_at: r.created_at.toISOString(),
    }));

    return { entries };
  },
});
