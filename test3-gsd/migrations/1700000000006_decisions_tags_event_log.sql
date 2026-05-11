-- Up Migration
CREATE TABLE decisions (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  description     text NOT NULL,
  rationale       text NOT NULL,
  decided_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  superseded_by   text REFERENCES decisions(id),
  topic_tags      text[] NOT NULL DEFAULT '{}',
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_decided_at_idx ON decisions (decided_at DESC);
CREATE INDEX decisions_topic_gin      ON decisions USING gin (topic_tags);

CREATE TABLE tags (
  name            text PRIMARY KEY,
  category        text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_log (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL,
  actor           text NOT NULL,
  summary         text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX event_log_at_idx ON event_log (at DESC);
CREATE INDEX event_log_kind_idx ON event_log (kind);

-- Down Migration
DROP TABLE event_log;
DROP TABLE tags;
DROP TABLE decisions;
