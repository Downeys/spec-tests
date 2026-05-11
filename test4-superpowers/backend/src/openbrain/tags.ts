import type pg from "pg";
import { getPool } from "../db/pool.js";
import { type Tag, ValidationError } from "./types.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

interface TagRow {
  id: string;
  slug: string;
  display: string;
  description: string | null;
  created_at: Date;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    slug: row.slug,
    display: row.display,
    description: row.description,
    createdAt: row.created_at
  };
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

function validateSlug(slug: string): void {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new ValidationError(
      "slug",
      "must match [a-z0-9][a-z0-9-]* (lowercase, no spaces)"
    );
  }
}

export async function findOrCreateTag(
  slug: string,
  display: string,
  description?: string,
  c?: pg.PoolClient
): Promise<Tag> {
  validateSlug(slug);
  const result = await client(c).query<TagRow>(
    `INSERT INTO tags (slug, display, description)
     VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id, slug, display, description, created_at`,
    [slug, display, description ?? null]
  );
  return rowToTag(result.rows[0]!);
}

export async function getTagBySlug(
  slug: string,
  c?: pg.PoolClient
): Promise<Tag | null> {
  const result = await client(c).query<TagRow>(
    `SELECT id, slug, display, description, created_at
     FROM tags WHERE slug = $1`,
    [slug]
  );
  return result.rows[0] ? rowToTag(result.rows[0]) : null;
}

export async function listTags(c?: pg.PoolClient): Promise<Tag[]> {
  const result = await client(c).query<TagRow>(
    `SELECT id, slug, display, description, created_at
     FROM tags ORDER BY slug ASC`
  );
  return result.rows.map(rowToTag);
}

export async function addClaimTag(
  claimId: string,
  tagSlug: string,
  c?: pg.PoolClient
): Promise<void> {
  validateSlug(tagSlug);
  const conn = client(c);
  // Ensure tag exists
  await conn.query(
    `INSERT INTO tags (slug, display)
     VALUES ($1,$1)
     ON CONFLICT (slug) DO NOTHING`,
    [tagSlug]
  );
  // Link claim to tag
  await conn.query(
    `INSERT INTO claim_tags (claim_id, tag_id)
     SELECT $1, id FROM tags WHERE slug = $2
     ON CONFLICT (claim_id, tag_id) DO NOTHING`,
    [claimId, tagSlug]
  );
}

export async function getTagsForClaim(
  claimId: string,
  c?: pg.PoolClient
): Promise<Tag[]> {
  const result = await client(c).query<TagRow>(
    `SELECT t.id, t.slug, t.display, t.description, t.created_at
     FROM tags t
     JOIN claim_tags ct ON ct.tag_id = t.id
     WHERE ct.claim_id = $1
     ORDER BY t.slug ASC`,
    [claimId]
  );
  return result.rows.map(rowToTag);
}
