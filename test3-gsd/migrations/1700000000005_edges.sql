-- Up Migration
CREATE TABLE edges (
  id              text PRIMARY KEY,
  kind            edge_kind NOT NULL,
  from_id         text NOT NULL,
  from_table      text NOT NULL,
  to_id           text NOT NULL,
  to_table        text NOT NULL,
  weight          numeric(3,2) NOT NULL DEFAULT 1.00,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edges_from_idx  ON edges (from_table, from_id);
CREATE INDEX edges_to_idx    ON edges (to_table, to_id);
CREATE INDEX edges_kind_idx  ON edges (kind);
CREATE UNIQUE INDEX edges_uniq ON edges (kind, from_table, from_id, to_table, to_id);

-- Down Migration
DROP TABLE edges;
