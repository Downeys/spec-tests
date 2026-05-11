-- Up Migration
CREATE TABLE entities (
  id              text PRIMARY KEY,
  kind            entity_kind NOT NULL,
  name            text NOT NULL,
  aliases         text[] NOT NULL DEFAULT '{}',
  description     text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  embedding       vector(1024),
  embedding_model text NOT NULL DEFAULT 'voyage-3.5-1024'
);
CREATE UNIQUE INDEX entities_kind_name_idx ON entities (kind, lower(name));
CREATE INDEX entities_aliases_gin ON entities USING gin (aliases);
CREATE INDEX entities_embedding_hnsw ON entities USING hnsw (embedding vector_cosine_ops);

-- Down Migration
DROP TABLE entities;
