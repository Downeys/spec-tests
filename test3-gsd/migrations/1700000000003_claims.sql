-- Up Migration
CREATE TABLE claims (
  id              text PRIMARY KEY,
  kind            claim_kind NOT NULL,
  status          claim_status NOT NULL DEFAULT 'hypothesis',
  confidence      numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  text            text NOT NULL,
  rationale       text,
  topic_tags      text[] NOT NULL DEFAULT '{}',
  framework_tags  text[] NOT NULL DEFAULT '{}',
  business_plan_id text NOT NULL DEFAULT 'default-plan',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  superseded_by   text REFERENCES claims(id),
  embedding       vector(1024) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'voyage-3.5-1024',
  supporting_count integer NOT NULL DEFAULT 0,
  contradicting_count integer NOT NULL DEFAULT 0
);

CREATE INDEX claims_status_idx     ON claims (status);
CREATE INDEX claims_kind_idx       ON claims (kind);
CREATE INDEX claims_topic_gin      ON claims USING gin (topic_tags);
CREATE INDEX claims_framework_gin  ON claims USING gin (framework_tags);
CREATE INDEX claims_updated_at_idx ON claims (updated_at DESC);
CREATE INDEX claims_embedding_hnsw ON claims USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Down Migration
DROP TABLE claims;
