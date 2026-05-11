import type pg from "pg";
import { getPool } from "../db/pool.js";
import {
  type Claim,
  type ClaimDetail,
  type ClaimStatus,
  type ClaimType,
  NotFoundError,
  ValidationError
} from "./types.js";
import { getSourceMeta } from "./sources.js";
import { getTagsForClaim } from "./tags.js";
import { getRelations } from "./relations.js";
import { embedClaim } from "../embeddings/pipeline.js";

const VALID_TYPES: readonly ClaimType[] = [
  "finding",
  "hypothesis",
  "decision",
  "observation",
  "estimate"
];
const VALID_STATUSES: readonly ClaimStatus[] = [
  "open",
  "validated",
  "refuted",
  "superseded",
  "retired"
];

interface CreateClaimInput {
  statement: string;
  type: ClaimType;
  status?: ClaimStatus;
  confidence?: number | null;
  sourceId?: string | null;
  sourceExcerpt?: string | null;
  sourceLocator?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ClaimRow {
  id: string;
  statement: string;
  type: ClaimType;
  status: ClaimStatus;
  confidence: number | null;
  source_id: string | null;
  source_excerpt: string | null;
  source_locator: string | null;
  created_at: Date;
  created_by: string | null;
  status_changed_at: Date | null;
  status_reason: string | null;
  metadata: Record<string, unknown> | null;
}

const COLS =
  "id, statement, type, status, confidence, source_id, source_excerpt, source_locator, created_at, created_by, status_changed_at, status_reason, metadata";

function rowToClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    statement: row.statement,
    type: row.type,
    status: row.status,
    confidence: row.confidence,
    sourceId: row.source_id,
    sourceExcerpt: row.source_excerpt,
    sourceLocator: row.source_locator,
    createdAt: row.created_at,
    createdBy: row.created_by,
    statusChangedAt: row.status_changed_at,
    statusReason: row.status_reason,
    metadata: row.metadata
  };
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function createClaim(
  input: CreateClaimInput,
  c?: pg.PoolClient
): Promise<Claim> {
  if (!input.statement.trim()) {
    throw new ValidationError("statement", "must be non-empty");
  }
  if (!VALID_TYPES.includes(input.type)) {
    throw new ValidationError(
      "type",
      `must be one of ${VALID_TYPES.join(", ")}`
    );
  }
  if (input.status && !VALID_STATUSES.includes(input.status)) {
    throw new ValidationError("status", "invalid value");
  }

  const result = await client(c).query<ClaimRow>(
    `INSERT INTO claims (statement, type, status, confidence, source_id,
                         source_excerpt, source_locator, created_by, metadata)
     VALUES ($1,$2,COALESCE($3,'open'),$4,$5,$6,$7,$8,$9)
     RETURNING ${COLS}`,
    [
      input.statement,
      input.type,
      input.status ?? null,
      input.confidence ?? null,
      input.sourceId ?? null,
      input.sourceExcerpt ?? null,
      input.sourceLocator ?? null,
      input.createdBy ?? null,
      input.metadata ?? null
    ]
  );
  const claim = rowToClaim(result.rows[0]!);
  // Fire-and-forget: do not block the insert on Voyage availability
  void embedClaim(claim.id).catch((err) => {
    console.warn(`[claim ${claim.id}] embedding failed:`, err);
  });
  return claim;
}

export async function getClaim(
  id: string,
  c?: pg.PoolClient
): Promise<Claim | null> {
  const result = await client(c).query<ClaimRow>(
    `SELECT ${COLS} FROM claims WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToClaim(result.rows[0]) : null;
}

export interface GetClaimsFilter {
  tag?: string;
  status?: ClaimStatus;
  type?: ClaimType;
  sourceId?: string;
  since?: Date;
}

export async function getClaims(
  filter: GetClaimsFilter = {},
  c?: pg.PoolClient
): Promise<Claim[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let join = "";

  if (filter.tag) {
    join = `JOIN claim_tags ct ON ct.claim_id = c.id
            JOIN tags t ON t.id = ct.tag_id`;
    params.push(filter.tag);
    conditions.push(`t.slug = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`c.status = $${params.length}`);
  }
  if (filter.type) {
    params.push(filter.type);
    conditions.push(`c.type = $${params.length}`);
  }
  if (filter.sourceId) {
    params.push(filter.sourceId);
    conditions.push(`c.source_id = $${params.length}`);
  }
  if (filter.since) {
    params.push(filter.since);
    conditions.push(`c.created_at >= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await client(c).query<ClaimRow>(
    `SELECT ${COLS.split(", ").map((col) => `c.${col}`).join(", ")}
     FROM claims c ${join} ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  return result.rows.map(rowToClaim);
}

export async function updateClaimStatus(
  id: string,
  newStatus: ClaimStatus,
  reason: string,
  c?: pg.PoolClient
): Promise<Claim> {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new ValidationError("status", "invalid value");
  }
  if (
    (newStatus === "validated" ||
      newStatus === "refuted" ||
      newStatus === "superseded") &&
    !reason.trim()
  ) {
    throw new ValidationError("reason", "must be non-empty");
  }

  if (newStatus === "superseded") {
    const conn = client(c);
    const check = await conn.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM relations
       WHERE to_claim = $1 AND type = 'supersedes'`,
      [id]
    );
    if (Number(check.rows[0]?.count ?? "0") === 0) {
      throw new ValidationError(
        "supersedes-relation",
        "cannot promote to 'superseded' without an inbound 'supersedes' relation"
      );
    }
  }

  const result = await client(c).query<ClaimRow>(
    `UPDATE claims
       SET status = $2,
           status_reason = $3,
           status_changed_at = now()
     WHERE id = $1
     RETURNING ${COLS}`,
    [id, newStatus, reason]
  );
  if (!result.rows[0]) {
    throw new NotFoundError("claim", id);
  }
  return rowToClaim(result.rows[0]);
}

export async function getClaimWithProvenance(
  id: string,
  c?: pg.PoolClient
): Promise<ClaimDetail> {
  const claim = await getClaim(id, c);
  if (!claim) throw new NotFoundError("claim", id);
  const [source, tags, outgoing, incoming] = await Promise.all([
    claim.sourceId ? getSourceMeta(claim.sourceId, c) : Promise.resolve(null),
    getTagsForClaim(id, c),
    getRelations({ fromClaim: id }, c),
    getRelations({ toClaim: id }, c)
  ]);
  return { claim, source, tags, outgoing, incoming };
}
