import type pg from "pg";
import { getPool } from "../db/pool.js";
import {
  type Source,
  type SourceMeta,
  type SourceType,
  ValidationError
} from "./types.js";

interface CreateSourceInput {
  type: SourceType;
  title: string;
  url?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  content?: string | null;
  contentHash?: string | null;
  ingestedBy?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface UpsertSourceByHashInput extends CreateSourceInput {
  contentHash: string;
}

interface SourceRow {
  id: string;
  type: SourceType;
  url: string | null;
  title: string;
  author: string | null;
  published_at: Date | null;
  content: string | null;
  content_hash: string | null;
  ingested_at: Date;
  ingested_by: string | null;
  metadata: Record<string, unknown> | null;
}

function rowToSource(row: SourceRow): Source {
  return {
    id: row.id,
    type: row.type,
    url: row.url,
    title: row.title,
    author: row.author,
    publishedAt: row.published_at,
    content: row.content,
    contentHash: row.content_hash,
    ingestedAt: row.ingested_at,
    ingestedBy: row.ingested_by,
    metadata: row.metadata
  };
}

function rowToMeta(row: Omit<SourceRow, "content">): SourceMeta {
  return {
    id: row.id,
    type: row.type,
    url: row.url,
    title: row.title,
    author: row.author,
    publishedAt: row.published_at,
    contentHash: row.content_hash,
    ingestedAt: row.ingested_at,
    ingestedBy: row.ingested_by,
    metadata: row.metadata
  };
}

const META_COLS =
  "id, type, url, title, author, published_at, content_hash, ingested_at, ingested_by, metadata";

const FULL_COLS = `${META_COLS}, content`;

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function createSource(
  input: CreateSourceInput,
  c?: pg.PoolClient
): Promise<Source> {
  if (!input.title.trim()) {
    throw new ValidationError("title", "must be non-empty");
  }
  const result = await client(c).query<SourceRow>(
    `INSERT INTO sources (type, url, title, author, published_at, content,
                          content_hash, ingested_by, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${FULL_COLS}`,
    [
      input.type,
      input.url ?? null,
      input.title,
      input.author ?? null,
      input.publishedAt ?? null,
      input.content ?? null,
      input.contentHash ?? null,
      input.ingestedBy ?? null,
      input.metadata ?? null
    ]
  );
  return rowToSource(result.rows[0]!);
}

export async function upsertSourceByHash(
  input: UpsertSourceByHashInput,
  c?: pg.PoolClient
): Promise<Source> {
  if (!input.contentHash) {
    throw new ValidationError("contentHash", "must be provided");
  }
  const existing = await getSourceByHash(input.contentHash, c);
  if (existing) return existing;
  return createSource(input, c);
}

export async function getSource(
  id: string,
  c?: pg.PoolClient
): Promise<Source | null> {
  const result = await client(c).query<SourceRow>(
    `SELECT ${FULL_COLS} FROM sources WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToSource(result.rows[0]) : null;
}

export async function getSourceMeta(
  id: string,
  c?: pg.PoolClient
): Promise<SourceMeta | null> {
  const result = await client(c).query<Omit<SourceRow, "content">>(
    `SELECT ${META_COLS} FROM sources WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToMeta(result.rows[0]) : null;
}

export async function getSourceByHash(
  hash: string,
  c?: pg.PoolClient
): Promise<Source | null> {
  const result = await client(c).query<SourceRow>(
    `SELECT ${FULL_COLS} FROM sources WHERE content_hash = $1 LIMIT 1`,
    [hash]
  );
  return result.rows[0] ? rowToSource(result.rows[0]) : null;
}

export async function listSourcesByIngestedAt(
  c?: pg.PoolClient
): Promise<SourceMeta[]> {
  const result = await client(c).query<Omit<SourceRow, "content">>(
    `SELECT ${META_COLS} FROM sources ORDER BY ingested_at DESC`
  );
  return result.rows.map(rowToMeta);
}
