-- Up Migration
CREATE TABLE sources (
  id              text PRIMARY KEY,
  kind            source_kind NOT NULL,
  url             text,
  title           text NOT NULL,
  author          text,
  published_at    timestamptz,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  raw_text        text NOT NULL,
  raw_text_hash   text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',
  embedding       vector(1024),
  embedding_model text NOT NULL DEFAULT 'voyage-3.5-1024'
);
CREATE UNIQUE INDEX sources_hash_idx ON sources (raw_text_hash);
CREATE INDEX sources_url_idx ON sources (url) WHERE url IS NOT NULL;
CREATE INDEX sources_ingested_at_idx ON sources (ingested_at DESC);
CREATE INDEX sources_embedding_hnsw ON sources USING hnsw (embedding vector_cosine_ops);

-- Down Migration
DROP TABLE sources;
