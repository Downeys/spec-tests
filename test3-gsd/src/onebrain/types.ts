// src/onebrain/types.ts
// SINGLE SOURCE OF TRUTH for all OneBrain row types (D-21).
// Frontend, backend, agents, CLI, tests all import from this file.

import { z } from 'zod';

// ─── Enums (mirror migrations/1700000000001_enums.sql) ───────────────────
export const ClaimStatusSchema = z.enum([
  'hypothesis',
  'tested',
  'validated',
  'refuted',
  'superseded',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimKindSchema = z.enum([
  'fact',
  'inference',
  'hypothesis',
  'counter',
  'finance.calc',
  'finance.assumption',
  'decision',
  'question',
]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const EdgeKindSchema = z.enum([
  'supports',
  'contradicts',
  'supersedes',
  'derived_from',
  'about_entity',
  'cites_source',
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const SourceKindSchema = z.enum([
  'web_article',
  'paper',
  'transcript',
  'pdf',
  'user_note',
  'chat_excerpt',
  'web_search_result',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const EntityKindSchema = z.enum([
  'company',
  'product',
  'segment',
  'persona',
  'framework',
  'topic',
  'concept',
  'person',
]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const CompileTriggerSchema = z.enum([
  'schedule',
  'on_demand',
  'source_added',
  'manual_topic',
]);
export type CompileTrigger = z.infer<typeof CompileTriggerSchema>;

// ─── Primitives ──────────────────────────────────────────────────────────
// CRIT-03: confidence required, range [0,1]; numeric(3,2) precision
export const ConfidenceSchema = z.number().min(0).max(1);
// ULID format: 26 chars, Crockford base32 (no I, L, O, U)
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

// ─── Source ──────────────────────────────────────────────────────────────
export const SourceSchema = z.object({
  id: UlidSchema,
  kind: SourceKindSchema,
  url: z.string().url().nullable(),
  title: z.string().min(1),
  author: z.string().nullable(),
  published_at: z.coerce.date().nullable(),
  ingested_at: z.coerce.date(),
  raw_text: z.string(),
  raw_text_hash: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  embedding: z.array(z.number()).length(1024).nullable(),
  embedding_model: z.string().default('voyage-3.5-1024'),
});
export type Source = z.infer<typeof SourceSchema>;

export const NewSourceSchema = SourceSchema.omit({
  id: true,
  ingested_at: true,
  embedding: true,
  raw_text_hash: true,
  embedding_model: true,
}).extend({ raw_text_hash: z.string().optional() });
export type NewSource = z.infer<typeof NewSourceSchema>;

// ─── Claim ───────────────────────────────────────────────────────────────
export const ClaimSchema = z.object({
  id: UlidSchema,
  kind: ClaimKindSchema,
  status: ClaimStatusSchema.default('hypothesis'), // CRIT-02 default
  confidence: ConfidenceSchema, // CRIT-03 required
  text: z.string().min(1),
  rationale: z.string().nullable(),
  topic_tags: z.array(z.string()).default([]),
  framework_tags: z.array(z.string()).default([]),
  business_plan_id: z.string().default('default-plan'),
  created_by: z.string().min(1),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  superseded_by: UlidSchema.nullable(),
  embedding: z.array(z.number()).length(1024),
  embedding_model: z.string().default('voyage-3.5-1024'),
  supporting_count: z.number().int().nonnegative().default(0),
  contradicting_count: z.number().int().nonnegative().default(0),
});
export type Claim = z.infer<typeof ClaimSchema>;

// NewClaim is what writeClaim() accepts — server fills id, timestamps, embedding
export const NewClaimSchema = z.object({
  kind: ClaimKindSchema,
  status: ClaimStatusSchema.default('hypothesis'),
  confidence: ConfidenceSchema,
  text: z.string().min(1),
  rationale: z.string().nullable().optional(),
  topic_tags: z.array(z.string()).default([]),
  framework_tags: z.array(z.string()).default([]),
  business_plan_id: z.string().default('default-plan'),
  created_by: z.string().min(1),
  cites_source_ids: z.array(UlidSchema).optional(),
  about_entity_ids: z.array(UlidSchema).optional(),
});
export type NewClaim = z.infer<typeof NewClaimSchema>;

// ─── Entity ──────────────────────────────────────────────────────────────
export const EntitySchema = z.object({
  id: UlidSchema,
  kind: EntityKindSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  embedding: z.array(z.number()).length(1024).nullable(),
  embedding_model: z.string().default('voyage-3.5-1024'),
});
export type Entity = z.infer<typeof EntitySchema>;

export const NewEntitySchema = EntitySchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  embedding: true,
  embedding_model: true,
});
export type NewEntity = z.infer<typeof NewEntitySchema>;

// ─── Edge ────────────────────────────────────────────────────────────────
export const EdgeSchema = z.object({
  id: UlidSchema,
  kind: EdgeKindSchema,
  from_id: z.string().min(1),
  from_table: z.enum(['claims', 'entities', 'sources', 'decisions']),
  to_id: z.string().min(1),
  to_table: z.enum(['claims', 'entities', 'sources', 'decisions']),
  weight: ConfidenceSchema.default(1.0),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.coerce.date(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const NewEdgeSchema = EdgeSchema.omit({ id: true, created_at: true });
export type NewEdge = z.infer<typeof NewEdgeSchema>;

// ─── Decision, Tag, EventLog ────────────────────────────────────────────
export const DecisionSchema = z.object({
  id: UlidSchema,
  title: z.string().min(1),
  description: z.string(),
  rationale: z.string(),
  decided_at: z.coerce.date(),
  status: z.string().default('active'),
  superseded_by: UlidSchema.nullable(),
  topic_tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.coerce.date(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const TagSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['topic', 'framework', 'segment', 'lifecycle']),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
});
export type Tag = z.infer<typeof TagSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Agents and Chat (AI-SPEC §4b lines 386-415)
// Sub-agent output contracts. D-21: single source of truth — research and
// compilation sub-agent definitions import from here, not from a parallel file.
// ─────────────────────────────────────────────────────────────────────────────

export const ContradictionRefSchema = z.object({
  existing_claim_id: z.string(),
  new_claim_id: z.string(),
  reason: z.string().max(280),
});
export type ContradictionRef = z.infer<typeof ContradictionRefSchema>;

export const ResearchOutputSchema = z.object({
  summary: z.string().max(900, 'summary must be ≤ 150 words'), // D-06: never quoted to chat verbatim
  claim_ids_written: z.array(z.string()).max(10), // D-01: ≤10 claim cap
  notable_contradictions: z.array(ContradictionRefSchema).max(5),
  proposed_tags: z.object({
    topic: z.array(z.string()), // D-02: coordinator canonicalizes
    framework: z.array(z.string()),
  }),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const CompilationOutputSchema = z.object({
  pages_written: z.number().int().min(0),
  pages_skipped: z.number().int().min(0),
  run_id: z.string(),
  error: z.string().optional(),
});
export type CompilationOutput = z.infer<typeof CompilationOutputSchema>;
