// traverse_provenance — walk the entry_relations graph from a seed entry to
// return its chain of provenance. The agent uses this to answer "show me the
// source for this claim."
//
// Decision A4 (eng review, joint source of truth):
//   Implementation is a single recursive CTE with a path-array cycle guard.
//   The recursive arm carries an ARRAY[]::uuid[] of every node visited so
//   far on the current branch; before extending the path with a neighbor,
//   we assert NOT (neighbor = ANY(path)). This makes the walk finite and
//   duplicate-free even when entries form mutual or self-referential cycles
//   (which CAN happen in practice: a `contradiction` entry that links two
//   findings, where one of the findings later cites the contradiction back).
//
// Direction semantics:
//   - 'upstream'   — walk FROM the seed TO its sources. Follow edges where
//                    from_id = current node, return to_id neighbors.
//                    Example: a finding → its raw_sources.
//   - 'downstream' — walk FROM the seed TO things that reference it. Follow
//                    edges where to_id = current node, return from_id
//                    neighbors. Example: a raw_source → all findings that
//                    cite it.
//
// Anchor row:
//   The CTE's anchor (depth 0) is the seed itself. We FILTER it out of the
//   final result set (WHERE depth > 0) so callers see only neighbors. The
//   seed's existence is verified separately and surfaced as a PERMANENT
//   not-found error if missing — that way "seed exists but has no edges"
//   and "seed doesn't exist" are distinguishable.
//
// SQL injection: `direction` selects between two pre-built parameterized SQL
// strings; user input is never interpolated into SQL.

import { z } from 'zod';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent } from '../lib/errors.js';

interface WalkRow {
  id: string;
  relation_type: string | null;
  depth: number;
  path: string[];
}

interface WalkNode {
  entry_id: string;
  relation_type: string | null;
  depth: number;
  path: string[];
}

// Upstream: from seed → sources. Edge condition r.from_id = w.id; neighbor = r.to_id.
const UPSTREAM_SQL = `
  WITH RECURSIVE walk AS (
    SELECT
      e.id::uuid                AS id,
      NULL::text                AS relation_type,
      0                         AS depth,
      ARRAY[e.id]::uuid[]       AS path
    FROM entries e
    WHERE e.id = $1::uuid
    UNION ALL
    SELECT
      r.to_id::uuid             AS id,
      r.relation_type           AS relation_type,
      w.depth + 1                AS depth,
      w.path || r.to_id          AS path
    FROM walk w
    JOIN entry_relations r ON r.from_id = w.id
    WHERE w.depth < $2
      AND NOT (r.to_id = ANY(w.path))
  )
  SELECT id, relation_type, depth, path
  FROM walk
  WHERE depth > 0
  ORDER BY depth ASC, id ASC
`;

// Downstream: from seed → referrers. Edge condition r.to_id = w.id; neighbor = r.from_id.
const DOWNSTREAM_SQL = `
  WITH RECURSIVE walk AS (
    SELECT
      e.id::uuid                AS id,
      NULL::text                AS relation_type,
      0                         AS depth,
      ARRAY[e.id]::uuid[]       AS path
    FROM entries e
    WHERE e.id = $1::uuid
    UNION ALL
    SELECT
      r.from_id::uuid           AS id,
      r.relation_type           AS relation_type,
      w.depth + 1                AS depth,
      w.path || r.from_id        AS path
    FROM walk w
    JOIN entry_relations r ON r.to_id = w.id
    WHERE w.depth < $2
      AND NOT (r.from_id = ANY(w.path))
  )
  SELECT id, relation_type, depth, path
  FROM walk
  WHERE depth > 0
  ORDER BY depth ASC, id ASC
`;

export const traverseProvenance = defineDbTool({
  name: 'traverse_provenance',
  description:
    "Walk the entry_relations graph from a seed entry to return its chain " +
    "of provenance. Use this for 'show me the source for this claim.' " +
    'Cycle-safe: a recursive SQL CTE tracks visited paths and never revisits ' +
    'a node, even with self-referential or mutually-referential entries.',
  inputShape: {
    entry_id: z.string().uuid(),
    direction: z.enum(['upstream', 'downstream']).optional(),
    depth: z.number().int().min(1).max(10).optional(),
  },
  handler: async (input, { db }) => {
    const direction = input.direction ?? 'upstream';
    const depth = input.depth ?? 3;

    // Verify seed exists. Without this, a missing seed returns an empty walk
    // (the anchor SELECT yields 0 rows), which is indistinguishable from a
    // seed that exists but has no edges. The contract says the latter is
    // success ({nodes: []}) and the former is PERMANENT not-found.
    const { rows: seedRows } = await db.query<{ id: string }>(
      `SELECT id FROM entries WHERE id = $1::uuid`,
      [input.entry_id],
    );
    if (seedRows.length === 0) {
      throw permanent(`entry not found: ${input.entry_id}`);
    }

    const sql = direction === 'upstream' ? UPSTREAM_SQL : DOWNSTREAM_SQL;
    const { rows } = await db.query<WalkRow>(sql, [input.entry_id, depth]);

    const nodes: WalkNode[] = rows.map((r) => ({
      entry_id: r.id,
      relation_type: r.relation_type,
      depth: r.depth,
      path: r.path,
    }));

    return { nodes };
  },
});
