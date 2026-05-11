// src/onebrain/search.ts
// DATA-09: Hybrid search reader. Weighted-sum FTS + pgvector cosine, with hard tag intersect.
//
// Pure read against OneBrain — does NOT touch the vault, does NOT compute embeddings
// (caller passes a pre-computed 1024-dim vector from `embed()`). Mirrors Phase 1's
// `findClaim()` discipline: this file is the read-side companion to repo.ts.
//
// SQL CTE copied verbatim from .planning/phases/02-agents-and-chat/02-RESEARCH.md §3.3
// (lines 150-173). Weights 0.4 FTS / 0.6 vector are RESEARCH starting defaults — single
// literal in code, easy to audit, easy to swap when claim count grows past ~200 (Phase 4ish).
//
// Drizzle returns Postgres numerics as strings; the row mapper coerces with Number()
// per the `findEdgesFrom` pattern at src/onebrain/repo.ts:262-268.

import { sql } from 'drizzle-orm';
import { db } from './db.js';

export interface ClaimSearchResult {
  id: string;
  text: string;
  confidence: number;
  status: string;
  topic_tags: string[];
  framework_tags: string[];
  score: number;
}

/**
 * Build a Postgres `text[]` literal — `{"val1","val2"}` — from a JS string array.
 * Used by the tag-filter parameter binding: node-postgres' default JS-array →
 * Postgres-array conversion does not produce a literal that the `${tagsParam}::text[]`
 * cast accepts when values contain hyphens (e.g. canonicalized tag slugs). Postgres
 * rejects with "malformed array literal: ..." in that case. Building the literal
 * explicitly with quoted, backslash-escaped values keeps the `::text[]` cast valid.
 */
function toPgArrayLiteral(arr: string[]): string {
  const BACKSLASH = '\\';
  const DOUBLE_BACKSLASH = '\\\\';
  const ESCAPED_QUOTE = '\\"';
  const escaped = arr.map(
    (v) => '"' + v.replaceAll(BACKSLASH, DOUBLE_BACKSLASH).replaceAll('"', ESCAPED_QUOTE) + '"',
  );
  return '{' + escaped.join(',') + '}';
}

export interface SearchClaimsInput {
  /** Query text for FTS (Postgres `plainto_tsquery('english', q)`). */
  q: string;
  /** 1024-dim embedding vector for cosine ranking. Caller computes via embed(). */
  embedding: number[];
  /** Optional hard intersect filter — both topic_tags AND framework_tags considered (OR'd). */
  tags?: string[];
  /** Result cap. Default 20. */
  limit?: number;
}

/**
 * Hybrid search across `claims`. Returns up to `limit` rows ranked by
 * `0.4 * fts_score + 0.6 * vec_score`. Tag filter is HARD (intersect) when provided.
 *
 * Read-only — no DB writes, no embed() call (caller's job). Matches the agent-tool
 * wrapper contract in 02-03's `onebrain_search` tool.
 */
export async function searchClaims(
  input: SearchClaimsInput,
): Promise<ClaimSearchResult[]> {
  const { q, embedding, tags, limit = 20 } = input;

  // pgvector wants the literal '[v1,v2,...]' string for the parameter; Drizzle's
  // template-tag binding for `vector` is fragile across driver versions, so we
  // interpolate the literal directly. Caller-side this is safe because the agent
  // tool wrapper in 02-03 will Zod-validate `embedding: number[]` before calling.
  const embeddingLiteral = `[${embedding.join(',')}]`;

  const tagsParam =
    tags && tags.length > 0 ? toPgArrayLiteral(tags) : null;

  const result = await db.execute(sql`
    WITH fts AS (
      SELECT id,
             ts_rank(
               to_tsvector('english', coalesce(text, '') || ' ' || coalesce(rationale, '')),
               plainto_tsquery('english', ${q})
             ) AS fts_score
      FROM claims
      WHERE to_tsvector('english', coalesce(text, '') || ' ' || coalesce(rationale, ''))
            @@ plainto_tsquery('english', ${q})
        AND (
          ${tagsParam}::text[] IS NULL
          OR topic_tags && ${tagsParam}::text[]
          OR framework_tags && ${tagsParam}::text[]
        )
      ORDER BY fts_score DESC
      LIMIT 50
    ),
    vec AS (
      SELECT id,
             1 - (embedding <=> ${embeddingLiteral}::vector) AS vec_score
      FROM claims
      WHERE (
        ${tagsParam}::text[] IS NULL
        OR topic_tags && ${tagsParam}::text[]
        OR framework_tags && ${tagsParam}::text[]
      )
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT 50
    )
    SELECT c.id,
           c.text,
           c.confidence,
           c.status,
           c.topic_tags,
           c.framework_tags,
           coalesce(f.fts_score, 0) * 0.4 + coalesce(v.vec_score, 0) * 0.6 AS score
    FROM claims c
    LEFT JOIN fts f ON f.id = c.id
    LEFT JOIN vec v ON v.id = c.id
    WHERE f.id IS NOT NULL OR v.id IS NOT NULL
    ORDER BY score DESC
    LIMIT ${limit};
  `);

  // Drizzle's db.execute(sql`...`) return shape varies across drivers — sometimes
  // `{ rows: [...] }`, sometimes the array directly. Handle both per RESEARCH.
  const rows =
    (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
    (result as unknown as Array<Record<string, unknown>>);

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    confidence: Number(r.confidence),
    status: String(r.status),
    topic_tags: (r.topic_tags as string[]) ?? [],
    framework_tags: (r.framework_tags as string[]) ?? [],
    score: Number(r.score),
  }));
}
