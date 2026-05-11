// flag_contradiction — Premise-7 confirmation-bias mitigation.
//
// Decisions captured:
//   Premise 7 (design doc, "Premises (locked)") + "Critical-posture mechanism":
//     The agent MUST elicit a `user_response` BEFORE calling this tool.
//     `user_response` is REQUIRED at the tool boundary; an empty string is
//     rejected by Zod (min(1)). This is the load-bearing guard against the
//     agent silently smoothing over conflicts between findings.
//   A3   — Idempotency. The contradiction entry uses
//          UNIQUE(type, content_hash) + ON CONFLICT DO NOTHING; falls back to
//          a SELECT to fetch the existing id when the conflict skipped.
//   CMT6 — Entries are immutable post-insert. We never overwrite the existing
//          row's metadata / content on re-call; we only insert relations
//          (also idempotent via PRIMARY KEY (from_id, to_id, relation_type)).
//
// Behavior:
//   1. Reject self-flag (entry_a_id == entry_b_id) at the boundary.
//   2. Verify both referenced entries exist (so we never insert a contradiction
//      pointing to a phantom uuid — the FK would catch it, but pre-checking
//      lets us return a clean PERMANENT message instead of a 23xxx envelope).
//   3. Build the contradiction entry's content from a structured template that
//      preserves both the agent's reason AND the user's interpretation, so the
//      disagreement can be parsed back later. Hash that combined string.
//   4. Wrap the entry insert + the two `contradicts` relation inserts in a
//      single transaction. If anything fails after BEGIN, ROLLBACK and bubble
//      the error up to the factory's classifier.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { invalidInput, permanent } from '../lib/errors.js';

function buildContent(reason: string, userResponse: string): string {
  // Stable, machine-parseable layout. The headings are fixed so a future
  // parser can split on them cleanly. Do NOT change without a migration plan
  // — content is hashed and entries are immutable, so the format is part of
  // the dedup key forever.
  return `Reason: ${reason}\n\nUser response: ${userResponse}`;
}

export const flagContradiction = defineDbTool({
  name: 'flag_contradiction',
  description:
    'Flag two findings or sources as contradictory. REQUIRES user_response — ' +
    "call this only AFTER asking the user 'how do you want to interpret this " +
    "contradiction?' and capturing their answer. Inserts a contradiction entry " +
    'plus two `contradicts` relations (one to each side). The user_response is ' +
    'recorded so the disagreement can be revisited later.',
  inputShape: {
    entry_a_id: z.string().uuid(),
    entry_b_id: z.string().uuid(),
    reason: z.string().min(10).max(2000),
    // Premise 7 invariant: REQUIRED, non-empty. min(1) rejects ''.
    user_response: z.string().min(1).max(5000),
  },
  handler: async (input, { db }) => {
    if (input.entry_a_id === input.entry_b_id) {
      throw invalidInput('cannot flag an entry as contradicting itself');
    }

    // Verify both entries exist before we mutate anything. Single round-trip
    // using ANY($1::uuid[]) so we don't pay two latencies.
    const existence = await db.query<{ id: string }>(
      `SELECT id FROM entries WHERE id = ANY($1::uuid[])`,
      [[input.entry_a_id, input.entry_b_id]],
    );
    const present = new Set(existence.rows.map((r) => r.id));
    if (!present.has(input.entry_a_id)) {
      throw permanent(`entry_a_id not found: ${input.entry_a_id}`);
    }
    if (!present.has(input.entry_b_id)) {
      throw permanent(`entry_b_id not found: ${input.entry_b_id}`);
    }

    const content = buildContent(input.reason, input.user_response);
    const contentHash = createHash('sha256').update(content).digest('hex');
    const metadata = {
      entry_a_id: input.entry_a_id,
      entry_b_id: input.entry_b_id,
      user_response_recorded_at: new Date().toISOString(),
    };

    await db.query('BEGIN');
    try {
      // Idempotent entry insert. Same (type, content_hash) returns existing id.
      const insertEntry = await db.query<{ id: string }>(
        `INSERT INTO entries (type, content, content_hash, metadata, created_by)
         VALUES ('contradiction', $1, $2, $3, 'agent')
         ON CONFLICT (type, content_hash) DO NOTHING
         RETURNING id`,
        [content, contentHash, metadata],
      );

      let contradictionId: string;
      let wasNew: boolean;

      if (insertEntry.rows.length > 0) {
        const id = insertEntry.rows[0]?.id;
        if (!id) throw permanent('insert returned a row without id');
        contradictionId = id;
        wasNew = true;
      } else {
        const select = await db.query<{ id: string }>(
          `SELECT id FROM entries WHERE type = 'contradiction' AND content_hash = $1`,
          [contentHash],
        );
        const existingId = select.rows[0]?.id;
        if (!existingId) {
          throw permanent('conflict skipped insert but no existing row found');
        }
        contradictionId = existingId;
        wasNew = false;
      }

      // Two `contradicts` relations: contradiction → entry_a, contradiction → entry_b.
      // ON CONFLICT DO NOTHING so re-call with same identifiers is a no-op.
      const insertRelations = await db.query<{ from_id: string; to_id: string }>(
        `INSERT INTO entry_relations (from_id, to_id, relation_type, metadata)
         VALUES ($1, $2, 'contradicts', '{}'::jsonb),
                ($1, $3, 'contradicts', '{}'::jsonb)
         ON CONFLICT (from_id, to_id, relation_type) DO NOTHING
         RETURNING from_id, to_id`,
        [contradictionId, input.entry_a_id, input.entry_b_id],
      );

      await db.query('COMMIT');
      return {
        id: contradictionId,
        was_new: wasNew,
        relations_inserted: insertRelations.rows.length,
      };
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  },
});
