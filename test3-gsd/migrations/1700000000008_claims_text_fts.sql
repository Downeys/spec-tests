-- Phase 2 / DATA-09 — Hybrid search FTS index over claims.text + rationale.
-- Consumed by src/onebrain/search.ts searchClaims() per RESEARCH §3.3.
-- Existing pgvector HNSW (m=16, ef_construction=64) on claims.embedding from
-- 1700000000003_claims.sql is reused unchanged; tag GINs on topic_tags/framework_tags
-- from the same migration are also reused.
--
-- Intentionally NOT using the concurrent variant — node-pg-migrate runs migrations
-- inside a transaction by default, and the concurrent variant cannot run inside a
-- transaction. The strategic-positioning fixture is small enough that the regular
-- form is instant.

-- Up Migration
CREATE INDEX claims_text_fts
  ON claims
  USING gin (to_tsvector('english', coalesce(text, '') || ' ' || coalesce(rationale, '')));

-- Down Migration
DROP INDEX IF EXISTS claims_text_fts;
