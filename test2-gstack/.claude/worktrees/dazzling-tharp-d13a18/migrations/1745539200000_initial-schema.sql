-- Initial schema — entries (oneBrain source-of-truth) + entry_relations (provenance graph).
--
-- Decisions captured in eng review:
--   A3   — UNIQUE on (type, content_hash); entries immutable post-insert.
--   A4   — entry_relations supports cycles; traverse_provenance handles them via
--          a recursive CTE with path-array detection.
--   CMT6 — claim context lives on the relation (entry_relations.metadata),
--          NOT on the entry — keeps entries truly immutable.
--
-- Full rationale: ~/.gstack/projects/test2-gstack/downe-main-eng-review-decisions-20260424-205940.md

-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'raw_source',         -- full article / PDF text, fetched verbatim
    'search_result',      -- Tavily snippet (links to a raw_source via 'cites' once archived)
    'user_observation',   -- user-injected synthesis (load-bearing, peer source)
    'finding',            -- atomic claim extracted by the agent
    'contradiction'       -- flagged tension between two findings
  )),
  content TEXT NOT NULL,                  -- preserved verbatim, never updated post-insert (A3, CMT6)
  content_hash TEXT NOT NULL,             -- sha256(content); used for dedup
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (created_by IN ('agent', 'user'))
);

CREATE INDEX entries_type_idx ON entries(type);
CREATE INDEX entries_metadata_gin ON entries USING gin(metadata);
CREATE INDEX entries_content_fts ON entries USING gin(to_tsvector('english', content));

-- A3 — idempotent inserts. Same (type, content_hash) = same row; ON CONFLICT DO NOTHING
-- (per CMT6) at the call site means re-fetching a source is a no-op.
CREATE UNIQUE INDEX entries_type_hash_uniq ON entries(type, content_hash);

CREATE TABLE entry_relations (
  from_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,  -- the deriving / referencing entry
  to_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,    -- the source / referenced entry
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'cites',         -- finding cites a source
    'paraphrases',   -- finding paraphrases a source
    'contradicts',   -- contradiction links the two conflicting findings
    'observes_on'    -- user_observation comments on an entry
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-relation context (CMT6): claim being supported, token cost, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_id, to_id, relation_type)
);

-- Reverse lookup for traverse_provenance walking either direction.
CREATE INDEX entry_relations_to_idx ON entry_relations(to_id);
CREATE INDEX entry_relations_metadata_gin ON entry_relations USING gin(metadata);

-- Down Migration

DROP TABLE entry_relations;
DROP TABLE entries;
DROP EXTENSION IF EXISTS pgcrypto;
