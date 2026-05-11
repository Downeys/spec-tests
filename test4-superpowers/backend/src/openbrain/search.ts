import type pg from "pg";
import { getPool } from "../db/pool.js";
import { getEmbeddingProvider } from "../embeddings/index.js";
import type { Claim, ClaimStatus, ClaimType, SourceMeta, Tag } from "./types.js";

export interface RankedClaim {
  claim: Claim;
  similarity: number;
  source: SourceMeta | null;
  tags: Tag[];
}

export interface SearchClaimsFilter {
  tags?: string[];
  status?: ClaimStatus[];
  type?: ClaimType[];
  sourceId?: string;
}

export interface SearchClaimsOptions {
  topK?: number;
  filter?: SearchClaimsFilter;
}

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function searchClaims(
  query: string,
  opts: SearchClaimsOptions = {},
  c?: pg.PoolClient
): Promise<RankedClaim[]> {
  const topK = opts.topK ?? 8;
  const filter = opts.filter ?? {};

  const provider = getEmbeddingProvider();
  const [vec] = await provider.embed([query]);
  if (!vec) return [];

  const conditions: string[] = [`c.embedding IS NOT NULL`];
  const params: unknown[] = [vectorLiteral(vec)];
  let join = "";

  if (filter.tags && filter.tags.length > 0) {
    join += `
      JOIN claim_tags ct_filter ON ct_filter.claim_id = c.id
      JOIN tags t_filter ON t_filter.id = ct_filter.tag_id
    `;
    params.push(filter.tags);
    conditions.push(`t_filter.slug = ANY($${params.length}::text[])`);
  }
  if (filter.status && filter.status.length > 0) {
    params.push(filter.status);
    conditions.push(`c.status = ANY($${params.length}::text[])`);
  }
  if (filter.type && filter.type.length > 0) {
    params.push(filter.type);
    conditions.push(`c.type = ANY($${params.length}::text[])`);
  }
  if (filter.sourceId) {
    params.push(filter.sourceId);
    conditions.push(`c.source_id = $${params.length}`);
  }

  params.push(topK);

  const sql = `
    SELECT c.id, c.statement, c.type, c.status, c.confidence,
           c.source_id, c.source_excerpt, c.source_locator,
           c.created_at, c.created_by, c.status_changed_at, c.status_reason,
           c.metadata,
           1 - (c.embedding <=> $1::vector) AS similarity,
           s.id AS s_id, s.type AS s_type, s.url AS s_url, s.title AS s_title,
           s.author AS s_author, s.published_at AS s_published_at,
           s.content_hash AS s_content_hash, s.ingested_at AS s_ingested_at,
           s.ingested_by AS s_ingested_by, s.metadata AS s_metadata
    FROM claims c
    ${join}
    LEFT JOIN sources s ON s.id = c.source_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY c.id, s.id
    ORDER BY MIN(c.embedding <=> $1::vector)
    LIMIT $${params.length}
  `;

  const pool = client(c) as pg.Pool;
  const result = await pool.query<Record<string, unknown>>(sql, params);

  // Fetch tags for each claim in one round trip
  const ids = result.rows.map((r) => r["id"] as string);
  const tagsByClaimId = new Map<string, Tag[]>();
  if (ids.length > 0) {
    const tagRows = await (client(c) as pg.Pool).query<{
      claim_id: string;
      id: string;
      slug: string;
      display: string;
      description: string | null;
      created_at: Date;
    }>(
      `SELECT ct.claim_id, t.id, t.slug, t.display, t.description, t.created_at
       FROM claim_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.claim_id = ANY($1::uuid[])`,
      [ids]
    );
    for (const row of tagRows.rows) {
      const t: Tag = {
        id: row.id,
        slug: row.slug,
        display: row.display,
        description: row.description,
        createdAt: row.created_at
      };
      const list = tagsByClaimId.get(row.claim_id) ?? [];
      list.push(t);
      tagsByClaimId.set(row.claim_id, list);
    }
  }

  return result.rows.map((row) => {
    const claim: Claim = {
      id: row["id"] as string,
      statement: row["statement"] as string,
      type: row["type"] as ClaimType,
      status: row["status"] as ClaimStatus,
      confidence: (row["confidence"] as number | null) ?? null,
      sourceId: (row["source_id"] as string | null) ?? null,
      sourceExcerpt: (row["source_excerpt"] as string | null) ?? null,
      sourceLocator: (row["source_locator"] as string | null) ?? null,
      createdAt: row["created_at"] as Date,
      createdBy: (row["created_by"] as string | null) ?? null,
      statusChangedAt: (row["status_changed_at"] as Date | null) ?? null,
      statusReason: (row["status_reason"] as string | null) ?? null,
      metadata: (row["metadata"] as Record<string, unknown> | null) ?? null
    };
    const sId = row["s_id"] as string | null;
    const source: SourceMeta | null = sId
      ? {
          id: sId,
          type: row["s_type"] as SourceMeta["type"],
          url: row["s_url"] as string | null,
          title: row["s_title"] as string,
          author: row["s_author"] as string | null,
          publishedAt: row["s_published_at"] as Date | null,
          contentHash: row["s_content_hash"] as string | null,
          ingestedAt: row["s_ingested_at"] as Date,
          ingestedBy: row["s_ingested_by"] as string | null,
          metadata: row["s_metadata"] as Record<string, unknown> | null
        }
      : null;
    return {
      claim,
      similarity: row["similarity"] as number,
      source,
      tags: tagsByClaimId.get(claim.id) ?? []
    };
  });
}
