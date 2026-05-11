-- Up Migration
CREATE TABLE compile_runs (
  id              text PRIMARY KEY,
  trigger         compile_trigger NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  pages_planned   integer,
  pages_written   integer,
  pages_skipped   integer,
  error           text
);

CREATE TABLE compile_artifacts (
  id              text PRIMARY KEY,
  run_id          text NOT NULL REFERENCES compile_runs(id),
  page_path       text NOT NULL,
  page_kind       text NOT NULL,
  source_claim_ids text[] NOT NULL,
  content_hash    text NOT NULL,
  written         boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compile_artifacts_page_path_idx ON compile_artifacts (page_path);
CREATE INDEX compile_artifacts_run_idx       ON compile_artifacts (run_id);

-- Down Migration
DROP TABLE compile_artifacts;
DROP TABLE compile_runs;
