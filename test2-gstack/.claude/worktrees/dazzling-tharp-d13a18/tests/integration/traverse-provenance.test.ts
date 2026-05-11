// Integration test for the traverse_provenance MCP tool.
//
// Runs the recursive-CTE walk against a real Postgres (Testcontainers) so we
// exercise PG's actual array semantics + cycle guard, not a mock.
//
// Graph seeded in beforeAll (linear / branching / cyclic):
//
//   Acyclic subgraph:
//                 A (raw_source)
//                / \
//      cites    /   \  cites
//              B     D (finding)
//        finding    /
//        observes_on
//             |
//             C (user_observation)
//
//   Edges (from → to, relation_type):
//     B --cites-->        A
//     C --observes_on-->  B
//     D --cites-->        A
//     D --paraphrases-->  B
//
//   So upstream from C: B (depth 1), A (depth 2 via B).
//      Downstream from A: B (depth 1), D (depth 1), C (depth 2 via B).
//      Downstream from B: C, D (both depth 1). Upstream from B: A (depth 1).
//
//   Cycle subgraph (separate from above to avoid polluting other assertions):
//     E (finding) --cites-->        F (raw_source)
//     F           --observes_on-->  E
//   This is a 2-node cycle. The path-array guard is the only thing keeping
//   the recursive CTE finite. (A4 invariant.)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { traverseProvenance } from '../../src/tools/traverse-provenance.js';

let fixture: PgFixture;

// Seed-graph entry IDs, populated in beforeAll.
let A: string;
let B: string;
let C: string;
let D: string;
let E: string;
let F: string;
// Isolated entry — exists but has no edges.
let ISOLATED: string;

beforeAll(async () => {
  fixture = await pgFixture();
  // The tool acquires its own pg client via withClient(), which reads
  // DATABASE_URL from the environment. Point it at the testcontainers
  // instance for the duration of this file.
  process.env.DATABASE_URL = fixture.url;

  // Insert entries one at a time so we capture each id deterministically.
  async function insertEntry(
    type: string,
    content: string,
    contentHash: string,
    createdBy: 'agent' | 'user',
  ): Promise<string> {
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [type, content, contentHash, createdBy],
    );
    return rows[0]!.id;
  }

  async function insertRelation(
    fromId: string,
    toId: string,
    relationType: string,
  ): Promise<void> {
    await fixture.pool.query(
      `INSERT INTO entry_relations (from_id, to_id, relation_type)
       VALUES ($1, $2, $3)`,
      [fromId, toId, relationType],
    );
  }

  A = await insertEntry('raw_source', 'A: blanket-license PRO rate sheet', 'tp-A', 'agent');
  B = await insertEntry('finding', 'B: PRO rates depend on revenue tier', 'tp-B', 'agent');
  C = await insertEntry('user_observation', 'C: tiers exclude small businesses', 'tp-C', 'user');
  D = await insertEntry('finding', 'D: tiered rates create cliff effects', 'tp-D', 'agent');

  await insertRelation(B, A, 'cites');
  await insertRelation(C, B, 'observes_on');
  await insertRelation(D, A, 'cites');
  await insertRelation(D, B, 'paraphrases');

  // Cycle subgraph.
  E = await insertEntry('finding', 'E: cycle node finding', 'tp-E', 'agent');
  F = await insertEntry('raw_source', 'F: cycle node source', 'tp-F', 'agent');
  await insertRelation(E, F, 'cites');
  await insertRelation(F, E, 'observes_on');

  // Isolated entry.
  ISOLATED = await insertEntry('finding', 'isolated finding', 'tp-iso', 'agent');
}, 120_000);

afterAll(async () => {
  await fixture?.teardown();
});

interface SuccessEnvelope {
  content: [{ type: 'text'; text: string }];
}

interface FailureEnvelope extends SuccessEnvelope {
  isError: true;
  errorCategory: 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';
}

function assertSuccess(result: unknown): asserts result is SuccessEnvelope {
  expect(result).toMatchObject({ content: [{ type: 'text' }] });
  expect((result as { isError?: boolean }).isError).toBeUndefined();
}

function assertFailure(result: unknown): asserts result is FailureEnvelope {
  expect((result as { isError?: boolean }).isError).toBe(true);
}

interface Node {
  entry_id: string;
  relation_type: string | null;
  depth: number;
  path: string[];
}

function payload(result: SuccessEnvelope): { nodes: Node[] } {
  return JSON.parse(result.content[0].text) as { nodes: Node[] };
}

describe('traverse_provenance', () => {
  it('walks a linear chain upstream (C → B → A) at depth=3', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: C,
      direction: 'upstream',
      depth: 3,
    });
    assertSuccess(result);
    const { nodes } = payload(result);

    // Should return B (depth 1) and A (depth 2). Anchor (C, depth 0) excluded.
    expect(nodes).toHaveLength(2);

    const b = nodes.find((n) => n.entry_id === B);
    const a = nodes.find((n) => n.entry_id === A);
    expect(b).toBeDefined();
    expect(a).toBeDefined();

    expect(b!.depth).toBe(1);
    expect(b!.relation_type).toBe('observes_on');
    expect(b!.path).toEqual([C, B]);

    expect(a!.depth).toBe(2);
    expect(a!.relation_type).toBe('cites');
    expect(a!.path).toEqual([C, B, A]);

    // Result is ordered by depth ASC.
    expect(nodes[0]!.depth).toBeLessThanOrEqual(nodes[1]!.depth);
  });

  it('walks a branching graph downstream from A (returns B, D at depth 1; C at depth 2)', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: A,
      direction: 'downstream',
      depth: 3,
    });
    assertSuccess(result);
    const { nodes } = payload(result);

    // Expected neighbors:
    //   depth 1: B (B-cites->A), D (D-cites->A)
    //   depth 2 (via B): C (C-observes_on->B), D (D-paraphrases->B)
    // D appears TWICE because it's reached via two distinct edges from A's
    // subgraph: directly (D-cites->A, depth 1) and via B (D-paraphrases->B,
    // depth 2). The cycle guard prevents revisits ON THE SAME PATH, but two
    // independent paths to the same node are NOT revisits — both are valid
    // provenance routes. The agent can dedupe by entry_id if it wants to.
    const ids = nodes.map((n) => n.entry_id);
    expect(ids).toContain(B);
    expect(ids).toContain(D);
    expect(ids).toContain(C);

    const bNode = nodes.find((n) => n.entry_id === B && n.depth === 1);
    const dDirect = nodes.find((n) => n.entry_id === D && n.depth === 1);
    const cNode = nodes.find((n) => n.entry_id === C && n.depth === 2);

    expect(bNode).toBeDefined();
    expect(bNode!.relation_type).toBe('cites');
    expect(bNode!.path).toEqual([A, B]);

    expect(dDirect).toBeDefined();
    expect(dDirect!.relation_type).toBe('cites');
    expect(dDirect!.path).toEqual([A, D]);

    expect(cNode).toBeDefined();
    expect(cNode!.relation_type).toBe('observes_on');
    expect(cNode!.path).toEqual([A, B, C]);

    // No infinite loops, no node repeated within a single path.
    for (const n of nodes) {
      const seen = new Set<string>();
      for (const p of n.path) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
      }
    }
  });

  it('respects the depth limit (depth=1 returns only immediate neighbors)', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: A,
      direction: 'downstream',
      depth: 1,
    });
    assertSuccess(result);
    const { nodes } = payload(result);

    // depth=1 means only direct referrers of A: B and D. NOT C (which is at
    // depth 2 via B).
    expect(nodes).toHaveLength(2);
    const ids = nodes.map((n) => n.entry_id).sort();
    expect(ids).toEqual([B, D].sort());
    for (const n of nodes) expect(n.depth).toBe(1);
  });

  it('terminates on a 2-node cycle (A4 invariant: returns finite, no dupes)', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: E,
      direction: 'upstream',
      depth: 10,
    });
    assertSuccess(result);
    const { nodes } = payload(result);

    // Without the path-array cycle guard, this walk would be infinite:
    //   E -cites-> F -observes_on-> E -cites-> F -observes_on-> E ...
    // With the guard: from E (depth 0, path=[E]), we reach F (depth 1,
    // path=[E,F]). From F we'd want to follow F-observes_on->E, but E is
    // already in the path → blocked. Walk halts. Single result: F.
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.entry_id).toBe(F);
    expect(nodes[0]!.depth).toBe(1);
    expect(nodes[0]!.relation_type).toBe('cites');
    expect(nodes[0]!.path).toEqual([E, F]);

    // Sanity: every node id appears at most once when paired with its path.
    const seen = new Set<string>();
    for (const n of nodes) {
      const key = `${n.entry_id}|${n.path.join(',')}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('returns {nodes: []} for a seed that exists but has no outgoing edges', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: ISOLATED,
      direction: 'upstream',
      depth: 3,
    });
    assertSuccess(result);
    const { nodes } = payload(result);
    expect(nodes).toEqual([]);
  });

  it('returns PERMANENT when seed UUID is well-formed but does not exist', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: '00000000-0000-0000-0000-000000000000',
      direction: 'upstream',
      depth: 3,
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0].text).toMatch(/not found/i);
    expect(result.content[0].text).toContain('00000000-0000-0000-0000-000000000000');
  });

  it('returns INVALID_INPUT when entry_id is malformed', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: 'not-a-uuid',
      direction: 'upstream',
      depth: 3,
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('INVALID_INPUT');
    expect(result.content[0].text).toMatch(/invalid input/i);
  });

  it('returns INVALID_INPUT when depth is out of range', async () => {
    const result = await traverseProvenance.invoke({
      entry_id: A,
      direction: 'upstream',
      depth: 99,
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('INVALID_INPUT');
  });

  it('upstream from B returns A (cited source); downstream from B returns C and D', async () => {
    // Direction respected — different edges, different neighbors.
    const upstream = await traverseProvenance.invoke({
      entry_id: B,
      direction: 'upstream',
      depth: 3,
    });
    assertSuccess(upstream);
    const upNodes = payload(upstream).nodes;
    const upIds = upNodes.map((n) => n.entry_id).sort();
    // B-cites->A, so upstream from B at depth 1 is just [A].
    expect(upIds).toEqual([A].sort());
    expect(upNodes.find((n) => n.entry_id === A)!.depth).toBe(1);
    expect(upNodes.find((n) => n.entry_id === A)!.relation_type).toBe('cites');

    const downstream = await traverseProvenance.invoke({
      entry_id: B,
      direction: 'downstream',
      depth: 3,
    });
    assertSuccess(downstream);
    const downNodes = payload(downstream).nodes;
    const downIds = downNodes.map((n) => n.entry_id).sort();
    // C-observes_on->B, D-paraphrases->B, so downstream from B at depth 1 is [C, D].
    expect(downIds).toEqual([C, D].sort());
    for (const n of downNodes) expect(n.depth).toBe(1);
    expect(downNodes.find((n) => n.entry_id === C)!.relation_type).toBe('observes_on');
    expect(downNodes.find((n) => n.entry_id === D)!.relation_type).toBe('paraphrases');
  });

  it('defaults: missing direction -> upstream, missing depth -> 3', async () => {
    const result = await traverseProvenance.invoke({ entry_id: C });
    assertSuccess(result);
    const { nodes } = payload(result);
    // Same expected result as the explicit linear-chain test above.
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.entry_id === B)!.depth).toBe(1);
    expect(nodes.find((n) => n.entry_id === A)!.depth).toBe(2);
  });
});
