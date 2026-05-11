// store_entry — idempotent insert of an entry into oneBrain.
//
// Decisions captured:
//   A3   — UNIQUE(type, content_hash); INSERT ... ON CONFLICT DO NOTHING
//          RETURNING id. If the conflict skipped the insert, fall back to a
//          SELECT to fetch the existing id.
//   CMT6 — entries are IMMUTABLE post-insert. NEVER use ON CONFLICT DO UPDATE.
//          The metadata of the original entry must be preserved exactly;
//          mutable per-citation context belongs in entry_relations.metadata.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

const ENTRY_TYPES = [
  'raw_source',
  'search_result',
  'user_observation',
  'finding',
  'contradiction',
] as const;

const CREATED_BY = ['agent', 'user'] as const;

export const storeEntry = defineDbTool({
  name: 'store_entry',
  description:
    'Insert an entry into oneBrain. Idempotent: same (type, content_hash) ' +
    'returns the existing id without modifying the row (entries are immutable ' +
    'post-insert). Most callers use the wrapper tools (tavily_search, ' +
    'fetch_and_archive, add_user_observation); use store_entry directly when ' +
    "you have a finding to record that doesn't fit those.",
  inputShape: {
    type: z.enum(ENTRY_TYPES),
    content: z.string().min(1).max(1_000_000),
    metadata: z.record(z.string(), z.unknown()).optional(),
    created_by: z.enum(CREATED_BY).optional(),
  },
  handler: async (input, { db }) => {
    const metadata = input.metadata ?? {};
    const createdBy = input.created_by ?? 'agent';
    const contentHash = createHash('sha256').update(input.content).digest('hex');

    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (type, content_hash) DO NOTHING
       RETURNING id`,
      [input.type, input.content, contentHash, metadata, createdBy],
    );

    if (insertResult.rows.length > 0) {
      const id = insertResult.rows[0]?.id;
      if (!id) throw permanent('insert returned a row without id');
      return { id, was_new: true };
    }

    // Conflict skipped the insert — fetch the existing id. The original
    // metadata is preserved (CMT6); we never overwrite it.
    const selectResult = await db.query<{ id: string }>(
      `SELECT id FROM entries WHERE type = $1 AND content_hash = $2`,
      [input.type, contentHash],
    );

    const existingId = selectResult.rows[0]?.id;
    if (!existingId) {
      // Should not happen — conflict means a row exists. Treat as permanent
      // so the agent surfaces it rather than retrying blindly.
      throw permanent('conflict skipped insert but no existing row found');
    }

    return { id: existingId, was_new: false };
  },
});
