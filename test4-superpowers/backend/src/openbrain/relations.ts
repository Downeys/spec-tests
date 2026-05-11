import type pg from "pg";
import { getPool } from "../db/pool.js";
import {
  type ContradictionPair,
  type Relation,
  type RelationType,
  DuplicateError,
  ValidationError
} from "./types.js";
import { getSourceMeta } from "./sources.js";
import { getClaim } from "./claims.js";

const VALID_TYPES: readonly RelationType[] = [
  "supports",
  "contradicts",
  "refines",
  "supersedes",
  "related_to"
];

interface CreateRelationInput {
  fromClaim: string;
  toClaim: string;
  type: RelationType;
  note?: string | null;
  createdBy?: string | null;
}

interface RelationRow {
  id: string;
  from_claim: string;
  to_claim: string;
  type: RelationType;
  note: string | null;
  created_at: Date;
  created_by: string | null;
}

function rowToRelation(row: RelationRow): Relation {
  return {
    id: row.id,
    fromClaim: row.from_claim,
    toClaim: row.to_claim,
    type: row.type,
    note: row.note,
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function createRelation(
  input: CreateRelationInput,
  c?: pg.PoolClient
): Promise<Relation> {
  if (!VALID_TYPES.includes(input.type)) {
    throw new ValidationError(
      "type",
      `must be one of ${VALID_TYPES.join(", ")}`
    );
  }
  if (input.fromClaim === input.toClaim) {
    throw new ValidationError(
      "from_claim/to_claim",
      "self-loops are not allowed"
    );
  }

  // Normalize contradicts relations: always store with smaller UUID as from_claim
  let { fromClaim, toClaim } = input;
  if (input.type === "contradicts" && fromClaim > toClaim) {
    [fromClaim, toClaim] = [toClaim, fromClaim];
  }

  try {
    const result = await client(c).query<RelationRow>(
      `INSERT INTO relations (from_claim, to_claim, type, note, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, from_claim, to_claim, type, note, created_at, created_by`,
      [
        fromClaim,
        toClaim,
        input.type,
        input.note ?? null,
        input.createdBy ?? null
      ]
    );
    return rowToRelation(result.rows[0]!);
  } catch (err) {
    if (err instanceof Error && /relations_unique_edge/.test(err.message)) {
      throw new DuplicateError(
        "relation",
        `${fromClaim} -[${input.type}]-> ${toClaim}`
      );
    }
    throw err;
  }
}

export interface GetRelationsFilter {
  fromClaim?: string;
  toClaim?: string;
  type?: RelationType;
}

export async function getRelations(
  filter: GetRelationsFilter = {},
  c?: pg.PoolClient
): Promise<Relation[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.fromClaim) {
    params.push(filter.fromClaim);
    conditions.push(`from_claim = $${params.length}`);
  }
  if (filter.toClaim) {
    params.push(filter.toClaim);
    conditions.push(`to_claim = $${params.length}`);
  }
  if (filter.type) {
    params.push(filter.type);
    conditions.push(`type = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await client(c).query<RelationRow>(
    `SELECT id, from_claim, to_claim, type, note, created_at, created_by
     FROM relations ${where}
     ORDER BY created_at ASC`,
    params
  );
  return result.rows.map(rowToRelation);
}

export async function getContradictionPairs(
  c?: pg.PoolClient
): Promise<ContradictionPair[]> {
  // Symmetric dedup: keep only rows where from_claim < to_claim lexicographically.
  const result = await client(c).query<RelationRow>(
    `SELECT r.id, r.from_claim, r.to_claim, r.type, r.note, r.created_at, r.created_by
     FROM relations r
     JOIN claims a ON a.id = r.from_claim
     JOIN claims b ON b.id = r.to_claim
     WHERE r.type = 'contradicts'
       AND a.status NOT IN ('retired','superseded')
       AND b.status NOT IN ('retired','superseded')
       AND r.from_claim < r.to_claim
     ORDER BY r.created_at ASC`
  );
  const pairs: ContradictionPair[] = [];
  for (const row of result.rows) {
    const relation = rowToRelation(row);
    const [claimA, claimB] = await Promise.all([
      getClaim(relation.fromClaim, c),
      getClaim(relation.toClaim, c)
    ]);
    if (!claimA || !claimB) continue;
    const [sourceA, sourceB] = await Promise.all([
      claimA.sourceId ? getSourceMeta(claimA.sourceId, c) : Promise.resolve(null),
      claimB.sourceId ? getSourceMeta(claimB.sourceId, c) : Promise.resolve(null)
    ]);
    pairs.push({ relation, claimA, claimB, sourceA, sourceB });
  }
  return pairs;
}
