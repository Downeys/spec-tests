-- Up Migration
CREATE TYPE claim_status AS ENUM ('hypothesis', 'tested', 'validated', 'refuted', 'superseded');
CREATE TYPE claim_kind AS ENUM (
  'fact', 'inference', 'hypothesis', 'counter',
  'finance.calc', 'finance.assumption', 'decision', 'question'
);
CREATE TYPE edge_kind AS ENUM (
  'supports', 'contradicts', 'supersedes', 'derived_from',
  'about_entity', 'cites_source'
);
CREATE TYPE source_kind AS ENUM (
  'web_article', 'paper', 'transcript', 'pdf',
  'user_note', 'chat_excerpt', 'web_search_result'
);
CREATE TYPE entity_kind AS ENUM (
  'company', 'product', 'segment', 'persona',
  'framework', 'topic', 'concept', 'person'
);
CREATE TYPE compile_trigger AS ENUM ('schedule', 'on_demand', 'source_added', 'manual_topic');

-- Down Migration
DROP TYPE compile_trigger;
DROP TYPE entity_kind;
DROP TYPE source_kind;
DROP TYPE edge_kind;
DROP TYPE claim_kind;
DROP TYPE claim_status;
