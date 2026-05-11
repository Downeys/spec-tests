// get_entry — fetch a single entry by UUID. Used after query_entries to
// drill into the full content of a result, or after store_entry /
// tavily_search to verify what was just persisted.
//
// Behavior:
//   - Zod's .uuid() rejects malformed UUIDs at the boundary (INVALID_INPUT).
//   - 0 rows → permanent('entry not found: <id>'); the agent should not
//     retry, it should surface to the user.
//   - 1 row → return the row's fields, renamed to camelCase so the tool
//     result is consistent with other tool surfaces (contentHash,
//     createdAt, createdBy).

import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

interface EntryRow {
  id: string;
  type: string;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  created_by: string;
}

export const getEntry = defineDbTool({
  name: 'get_entry',
  description:
    'Fetch a single entry by UUID. Returns full content + metadata. ' +
    'Use after query_entries to drill into the full content of a result, ' +
    'or after store_entry / tavily_search to verify what was just persisted.',
  inputShape: {
    id: z.string().uuid(),
  },
  handler: async (input, { db }) => {
    const { rows } = await db.query<EntryRow>(
      `SELECT id, type, content, content_hash, metadata, created_at, created_by
       FROM entries
       WHERE id = $1`,
      [input.id],
    );

    const row = rows[0];
    if (!row) {
      throw permanent(`entry not found: ${input.id}`);
    }

    return {
      id: row.id,
      type: row.type,
      content: row.content,
      contentHash: row.content_hash,
      metadata: row.metadata,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      createdBy: row.created_by,
    };
  },
});
