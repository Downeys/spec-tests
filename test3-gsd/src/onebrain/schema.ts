// src/onebrain/schema.ts
// Drizzle schema MIRROR (query-only — NEVER pushed). Source of truth is migrations/*.sql.
// Regenerate via `npm run drizzle:pull` if migrations change. Schema-parity test guards drift.

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  customType,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// pgvector type (Drizzle doesn't have native; custom type bridge)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1024)';
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return JSON.parse(value as string) as number[];
  },
});

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // source_kind enum
  url: text('url'),
  title: text('title').notNull(),
  author: text('author'),
  published_at: timestamp('published_at', { withTimezone: true }),
  ingested_at: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  raw_text: text('raw_text').notNull(),
  raw_text_hash: text('raw_text_hash').notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  embedding: vector('embedding'),
  embedding_model: text('embedding_model').notNull().default('voyage-3.5-1024'),
});

export const claims = pgTable('claims', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('hypothesis'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull().default('0.50'),
  text: text('text').notNull(),
  rationale: text('rationale'),
  topic_tags: text('topic_tags').array().notNull().default(sql`'{}'::text[]`),
  framework_tags: text('framework_tags').array().notNull().default(sql`'{}'::text[]`),
  business_plan_id: text('business_plan_id').notNull().default('default-plan'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  superseded_by: text('superseded_by'),
  embedding: vector('embedding').notNull(),
  embedding_model: text('embedding_model').notNull().default('voyage-3.5-1024'),
  supporting_count: integer('supporting_count').notNull().default(0),
  contradicting_count: integer('contradicting_count').notNull().default(0),
});

export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  description: text('description'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  embedding: vector('embedding'),
  embedding_model: text('embedding_model').notNull().default('voyage-3.5-1024'),
});

export const edges = pgTable('edges', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  from_id: text('from_id').notNull(),
  from_table: text('from_table').notNull(),
  to_id: text('to_id').notNull(),
  to_table: text('to_table').notNull(),
  weight: numeric('weight', { precision: 3, scale: 2 }).notNull().default('1.00'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  rationale: text('rationale').notNull(),
  decided_at: timestamp('decided_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('active'),
  superseded_by: text('superseded_by'),
  topic_tags: text('topic_tags').array().notNull().default(sql`'{}'::text[]`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable('tags', {
  name: text('name').primaryKey(),
  category: text('category').notNull(),
  description: text('description'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const event_log = pgTable('event_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  kind: text('kind').notNull(),
  actor: text('actor').notNull(),
  summary: text('summary').notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
});

export const compile_runs = pgTable('compile_runs', {
  id: text('id').primaryKey(),
  trigger: text('trigger').notNull(),
  started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finished_at: timestamp('finished_at', { withTimezone: true }),
  pages_planned: integer('pages_planned'),
  pages_written: integer('pages_written'),
  pages_skipped: integer('pages_skipped'),
  error: text('error'),
});

export const compile_artifacts = pgTable('compile_artifacts', {
  id: text('id').primaryKey(),
  run_id: text('run_id').notNull(),
  page_path: text('page_path').notNull(),
  page_kind: text('page_kind').notNull(),
  source_claim_ids: text('source_claim_ids').array().notNull(),
  content_hash: text('content_hash').notNull(),
  written: boolean('written').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
