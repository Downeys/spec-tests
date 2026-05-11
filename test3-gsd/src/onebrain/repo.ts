// src/onebrain/repo.ts
// The append-only OneBrain repository. SINGLE coercive boundary for all writes.
// ⚠ NO delete*/remove*/drop*/destroy* exports — DATA-06 architectural commitment.
// Supersede is the only mutation surface for claims (PITFALLS P2 prevention).

import { eq, and } from 'drizzle-orm';
import { db } from './db.js';
import * as s from './schema.js';
import { embed } from './embed.js';
import { ulid } from './ids.js';
import { hashRawText } from '@/lib/hash.js';
import { canonicalizeTag } from '@/lib/tag-canonicalize.js';
import { matchesQuantitativePattern } from './quant-pattern.js';
import {
  NewSourceSchema,
  NewClaimSchema,
  NewEdgeSchema,
  NewEntitySchema,
  type NewSource,
  type Source,
  type NewClaim,
  type Claim,
  type NewEdge,
  type Edge,
  type NewEntity,
  type Entity,
} from './types.js';

/**
 * Thrown by writeClaim() when a claim's text matches the AGENT-08 quantitative
 * pattern (TAM/SAM/SOM keywords or $-prefixed M/B/T amounts) AND
 * cites_source_ids is empty/absent. This is the Layer 1 (schema-coercive) defense
 * for AGENT-08 / Pitfall 19; it fires regardless of caller (CLI, agent, future
 * ingest sub-agent). The protocol-layer wrapper at src/agents/tools/onebrain.ts
 * (Layer 2) catches forward-references (D-05); this guard catches the
 * schema-level violation. RESEARCH §3.5 + AI-SPEC §6 guardrail #2.
 */
export class QuantitativeClaimRequiresSourceError extends Error {
  constructor(public readonly text: string) {
    super(
      `quantitative claim requires cites_source_ids: ${text.slice(0, 80)}…`,
    );
    this.name = 'QuantitativeClaimRequiresSourceError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function rowToClaim(row: typeof s.claims.$inferSelect): Claim {
  return {
    ...row,
    confidence: Number(row.confidence),
    // Drizzle returns numeric as string; coerce to number
  } as unknown as Claim;
}
function rowToSource(row: typeof s.sources.$inferSelect): Source {
  return row as unknown as Source;
}

// ─── Sources ─────────────────────────────────────────────────────────────
/**
 * Write a source row. If raw_text_hash already exists, returns existing row with skipped=true.
 * D-04: idempotent re-ingest.
 */
export async function writeSource(
  input: NewSource,
): Promise<{ source: Source; skipped: boolean }> {
  const validated = NewSourceSchema.parse(input);
  const hash = hashRawText(validated.raw_text);

  const existing = await db
    .select()
    .from(s.sources)
    .where(eq(s.sources.raw_text_hash, hash))
    .limit(1);
  if (existing.length > 0) {
    return { source: rowToSource(existing[0]), skipped: true };
  }

  const embedding = await embed(validated.raw_text.slice(0, 4000));
  const id = ulid();
  const [row] = await db
    .insert(s.sources)
    .values({
      id,
      kind: validated.kind,
      url: validated.url,
      title: validated.title,
      author: validated.author ?? null,
      published_at: validated.published_at ?? null,
      raw_text: validated.raw_text,
      raw_text_hash: hash,
      metadata: validated.metadata ?? {},
      embedding,
    })
    .returning();
  return { source: rowToSource(row), skipped: false };
}

// ─── Claims ──────────────────────────────────────────────────────────────
export async function writeClaim(input: NewClaim): Promise<Claim> {
  const validated = NewClaimSchema.parse(input);
  // Layer 1 (AGENT-08 / Pitfall 19): TAM-shaped or ≥$1M numeric claims require a source row.
  // The protocol-layer wrapper in src/agents/tools/onebrain.ts catches forward-references (D-05);
  // this guard catches the schema-level violation regardless of caller (CLI, agent, future ingest sub-agent).
  // RESEARCH §3.5 + AI-SPEC §6 guardrail #2.
  if (
    matchesQuantitativePattern(validated.text) &&
    (!validated.cites_source_ids || validated.cites_source_ids.length === 0)
  ) {
    throw new QuantitativeClaimRequiresSourceError(validated.text);
  }
  // Embed OUTSIDE transaction (slow network call; don't hold row lock — P16)
  const embedText =
    validated.text + (validated.rationale ? ' — ' + validated.rationale : '');
  const embedding = await embed(embedText);
  const id = ulid();

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.claims)
      .values({
        id,
        kind: validated.kind,
        status: validated.status ?? 'hypothesis', // CRIT-02 belt
        confidence: String(validated.confidence), // numeric stored as string in Drizzle
        text: validated.text,
        rationale: validated.rationale ?? null,
        topic_tags: (validated.topic_tags ?? []).map(canonicalizeTag), // DATA-10
        framework_tags: (validated.framework_tags ?? []).map(canonicalizeTag),
        business_plan_id: validated.business_plan_id ?? 'default-plan',
        created_by: validated.created_by,
        embedding,
      })
      .returning();

    // Sequential edge inserts (P16 — no Promise.all)
    if (validated.cites_source_ids) {
      for (const sid of validated.cites_source_ids) {
        await tx.insert(s.edges).values({
          id: ulid(),
          kind: 'cites_source',
          from_table: 'claims',
          from_id: id,
          to_table: 'sources',
          to_id: sid,
        });
      }
    }
    if (validated.about_entity_ids) {
      for (const eid of validated.about_entity_ids) {
        await tx.insert(s.edges).values({
          id: ulid(),
          kind: 'about_entity',
          from_table: 'claims',
          from_id: id,
          to_table: 'entities',
          to_id: eid,
        });
      }
    }
    return rowToClaim(row);
  });
}

/**
 * Supersede a claim: insert new, mark old as superseded, link via edge.
 * Old row is PRESERVED (DATA-06 — no delete; audit trail intact).
 */
export async function supersede(oldClaimId: string, newClaim: NewClaim): Promise<Claim> {
  const replacement = await writeClaim(newClaim); // own transaction
  await db.transaction(async (tx) => {
    await tx
      .update(s.claims)
      .set({
        status: 'superseded',
        superseded_by: replacement.id,
        updated_at: new Date(),
      })
      .where(eq(s.claims.id, oldClaimId));
    await tx.insert(s.edges).values({
      id: ulid(),
      kind: 'supersedes',
      from_table: 'claims',
      from_id: replacement.id,
      to_table: 'claims',
      to_id: oldClaimId,
    });
  });
  return replacement;
}

/**
 * Promote a claim's status. Requires an evidence edge id (CRIT-06).
 * Verifies the edge exists AND points to/from this claim.
 */
export async function promoteClaimStatus(
  claimId: string,
  newStatus: 'tested' | 'validated' | 'refuted',
  evidenceEdgeId: string,
): Promise<void> {
  if (!evidenceEdgeId) {
    throw new Error('CRIT-06: promoteClaimStatus requires an evidenceEdgeId');
  }
  const edge = await db
    .select()
    .from(s.edges)
    .where(eq(s.edges.id, evidenceEdgeId))
    .limit(1);
  if (edge.length === 0) {
    throw new Error(`CRIT-06: evidence edge ${evidenceEdgeId} does not exist`);
  }
  const e = edge[0];
  const involves =
    (e.from_table === 'claims' && e.from_id === claimId) ||
    (e.to_table === 'claims' && e.to_id === claimId);
  if (!involves) {
    throw new Error(`CRIT-06: edge ${evidenceEdgeId} does not involve claim ${claimId}`);
  }
  await db
    .update(s.claims)
    .set({ status: newStatus, updated_at: new Date() })
    .where(eq(s.claims.id, claimId));
}

// ─── Entities & Edges ────────────────────────────────────────────────────
export async function writeEntity(input: NewEntity): Promise<Entity> {
  const validated = NewEntitySchema.parse(input);
  const embedding = await embed(validated.name + ' ' + (validated.description ?? ''));
  const id = ulid();
  const [row] = await db
    .insert(s.entities)
    .values({
      id,
      kind: validated.kind,
      name: validated.name,
      aliases: validated.aliases ?? [],
      description: validated.description ?? null,
      metadata: validated.metadata ?? {},
      embedding,
    })
    .returning();
  return row as unknown as Entity;
}

export async function writeEdge(input: NewEdge): Promise<Edge> {
  const validated = NewEdgeSchema.parse(input);
  const id = ulid();
  const [row] = await db
    .insert(s.edges)
    .values({
      id,
      kind: validated.kind,
      from_id: validated.from_id,
      from_table: validated.from_table,
      to_id: validated.to_id,
      to_table: validated.to_table,
      weight: String(validated.weight ?? 1.0),
      metadata: validated.metadata ?? {},
    })
    .returning();
  return { ...row, weight: Number(row.weight) } as unknown as Edge;
}

// ─── Event log ────────────────────────────────────────────────────────────
export async function logEvent(
  kind: string,
  actor: string,
  summary: string,
  payload: object = {},
): Promise<void> {
  await db.insert(s.event_log).values({ kind, actor, summary, payload });
}

// ─── Readers ─────────────────────────────────────────────────────────────
export async function findClaim(id: string): Promise<Claim | undefined> {
  const rows = await db.select().from(s.claims).where(eq(s.claims.id, id)).limit(1);
  return rows[0] ? rowToClaim(rows[0]) : undefined;
}
export async function findSource(id: string): Promise<Source | undefined> {
  const rows = await db.select().from(s.sources).where(eq(s.sources.id, id)).limit(1);
  return rows[0] ? rowToSource(rows[0]) : undefined;
}
export async function findSourceByHash(hash: string): Promise<Source | undefined> {
  const rows = await db
    .select()
    .from(s.sources)
    .where(eq(s.sources.raw_text_hash, hash))
    .limit(1);
  return rows[0] ? rowToSource(rows[0]) : undefined;
}
export async function findEdgesFrom(fromTable: string, fromId: string): Promise<Edge[]> {
  const rows = await db
    .select()
    .from(s.edges)
    .where(and(eq(s.edges.from_table, fromTable), eq(s.edges.from_id, fromId)));
  return rows.map((r) => ({ ...r, weight: Number(r.weight) })) as unknown as Edge[];
}
export async function findAllClaims(): Promise<Claim[]> {
  const rows = await db.select().from(s.claims);
  return rows.map(rowToClaim);
}
export async function findAllSources(): Promise<Source[]> {
  const rows = await db.select().from(s.sources);
  return rows.map(rowToSource);
}
export async function findAllEntities(): Promise<Entity[]> {
  const rows = await db.select().from(s.entities);
  return rows as unknown as Entity[];
}
export async function findAllEdges(): Promise<Edge[]> {
  const rows = await db.select().from(s.edges);
  return rows.map((r) => ({ ...r, weight: Number(r.weight) })) as unknown as Edge[];
}
