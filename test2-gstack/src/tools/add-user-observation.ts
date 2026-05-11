// add_user_observation — first-class user synthesis, treated as a peer source
// alongside agent research. Optionally links to one or more existing entries
// via `observes_on` relations.
//
// Decisions captured:
//   A3   — UNIQUE(type, content_hash); INSERT ... ON CONFLICT DO NOTHING
//          RETURNING id, with a SELECT-on-miss fallback (entries are
//          immutable post-insert, mirrors store-entry).
//   CMT6 — entries are immutable; the user_observation row never gets
//          rewritten on dedup.
//
// Transactional behavior: the entry insert + every relation insert run in
// the same BEGIN/COMMIT. If any related_entry_id is dangling, the FK
// violation (Postgres 23503) bubbles up classified as PERMANENT by the
// factory; we ROLLBACK first so a bad reference does NOT leave a dangling
// user_observation row behind.
//
// Idempotency:
//   - same content + same relations → same id (was_new=false), related_count=0.
//   - one new related_entry_id added on a re-call → same id, related_count=1.
//   - relations are deduped via PRIMARY KEY (from_id, to_id, relation_type)
//     using ON CONFLICT DO NOTHING.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

export const addUserObservation = defineDbTool({
  name: 'add_user_observation',
  description:
    'Insert a user_observation entry — first-class user synthesis treated as ' +
    'a peer source alongside agent research. Optionally link to one or more ' +
    'existing entries via observes_on relations. Use this whenever the user ' +
    'shares synthesis, judgment, or framing that should be cite-able later.',
  inputShape: {
    content: z.string().min(1).max(1_000_000),
    related_entry_ids: z.array(z.string().uuid()).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  },
  handler: async (input, { db }) => {
    const metadata = input.metadata ?? {};
    const relatedIds = input.related_entry_ids ?? [];
    const contentHash = createHash('sha256').update(input.content).digest('hex');

    await db.query('BEGIN');
    try {
      // 1. Insert the user_observation entry. ON CONFLICT DO NOTHING so a
      //    re-call with identical content reuses the existing row (A3).
      const insertEntry = await db.query<{ id: string }>(
        `INSERT INTO entries (type, content, content_hash, metadata, created_by)
         VALUES ('user_observation', $1, $2, $3, 'user')
         ON CONFLICT (type, content_hash) DO NOTHING
         RETURNING id`,
        [input.content, contentHash, metadata],
      );

      let id: string;
      let wasNew: boolean;

      if (insertEntry.rows.length > 0) {
        const newId = insertEntry.rows[0]?.id;
        if (!newId) throw permanent('insert returned a row without id');
        id = newId;
        wasNew = true;
      } else {
        // Conflict — fetch the existing id. Original metadata stays put (CMT6).
        const select = await db.query<{ id: string }>(
          `SELECT id FROM entries WHERE type = 'user_observation' AND content_hash = $1`,
          [contentHash],
        );
        const existingId = select.rows[0]?.id;
        if (!existingId) {
          throw permanent('conflict skipped insert but no existing row found');
        }
        id = existingId;
        wasNew = false;
      }

      // 2. Insert observes_on relations. Each one is idempotent via the
      //    composite primary key. Count newly inserted rows to expose dedup
      //    state to the caller. A dangling related_entry_id raises 23503;
      //    that bubbles up to the catch below and triggers ROLLBACK.
      let relatedCount = 0;
      for (const toId of relatedIds) {
        const rel = await db.query<{ from_id: string }>(
          `INSERT INTO entry_relations (from_id, to_id, relation_type)
           VALUES ($1, $2, 'observes_on')
           ON CONFLICT (from_id, to_id, relation_type) DO NOTHING
           RETURNING from_id`,
          [id, toId],
        );
        if (rel.rows.length > 0) relatedCount += 1;
      }

      await db.query('COMMIT');
      return { id, was_new: wasNew, related_count: relatedCount };
    } catch (err) {
      // Best-effort rollback. If ROLLBACK itself throws, prefer surfacing
      // the original error to the factory's classifier.
      try {
        await db.query('ROLLBACK');
      } catch {
        // swallow — original error is the interesting one
      }
      throw err;
    }
  },
});
