// tests/integration/schema-shape.test.ts
// Verifies the live DB schema matches what the migrations declare.
// Uses information_schema and pg_indexes — no Drizzle dependency.

import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

describe('Schema shape (DATA-01..04, DATA-07, DATA-10)', () => {
  it('sources table exists with required columns (DATA-01)', async () => {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sources'
      ORDER BY ordinal_position;
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'kind',
        'url',
        'title',
        'author',
        'published_at',
        'ingested_at',
        'raw_text',
        'raw_text_hash',
        'metadata',
        'embedding',
        'embedding_model',
      ]),
    );
  });

  it('claims table has confidence numeric(3,2) NOT NULL with default 0.50 (DATA-02, CRIT-03)', async () => {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='claims' AND column_name='confidence';
    `);
    expect(rows[0].data_type).toBe('numeric');
    expect(rows[0].numeric_precision).toBe(3);
    expect(rows[0].numeric_scale).toBe(2);
    expect(rows[0].is_nullable).toBe('NO');
    expect(rows[0].column_default).toMatch(/0\.50/);
  });

  it('claims.status defaults to hypothesis (CRIT-02)', async () => {
    const { rows } = await pool.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name='claims' AND column_name='status';
    `);
    expect(rows[0].column_default).toMatch(/'hypothesis'/);
  });

  it('claims.business_plan_id defaults to default-plan (P18 mitigation)', async () => {
    const { rows } = await pool.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_name='claims' AND column_name='business_plan_id';
    `);
    expect(rows[0].column_default).toMatch(/'default-plan'/);
  });

  it('claims.embedding is vector(1024) NOT NULL (DATA-07, P5)', async () => {
    const { rows } = await pool.query(`
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'claims' AND a.attname = 'embedding';
    `);
    expect(rows[0].type).toBe('vector(1024)');
    expect(rows[0].attnotnull).toBe(true);
  });

  it('entities table exists (DATA-03)', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='entities' AND table_schema='public';
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'kind', 'name', 'aliases', 'description', 'embedding']),
    );
  });

  it('edges enum has all 6 kinds (DATA-04)', async () => {
    const { rows } = await pool.query(`
      SELECT unnest(enum_range(NULL::edge_kind))::text AS kind ORDER BY kind;
    `);
    const kinds = rows.map((r) => r.kind);
    expect(kinds.sort()).toEqual([
      'about_entity',
      'cites_source',
      'contradicts',
      'derived_from',
      'supersedes',
      'supports',
    ]);
  });

  it('claims_embedding_hnsw index exists (DATA-07)', async () => {
    const { rows } = await pool.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE indexname='claims_embedding_hnsw';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/USING hnsw/);
    expect(rows[0].indexdef).toMatch(/m='?16'?/);
    expect(rows[0].indexdef).toMatch(/ef_construction='?64'?/);
  });

  it('tags table exists with controlled vocabulary structure (DATA-10)', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='tags' AND table_schema='public';
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining(['name', 'category', 'description', 'created_at']),
    );
  });

  it('edges_uniq enforces no duplicate edges of same kind+endpoints', async () => {
    const { rows } = await pool.query(`
      SELECT indexdef FROM pg_indexes WHERE indexname='edges_uniq';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/);
  });

  it('pgvector extension installed (INFRA-01)', async () => {
    const { rows } = await pool.query(
      `SELECT extname FROM pg_extension WHERE extname='vector';`,
    );
    expect(rows).toHaveLength(1);
  });
});
