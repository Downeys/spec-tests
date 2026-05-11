-- 0001_init.sql — OpenBrain initial schema: extension, two-role split, sentinel.
--
-- Per PRD-4 slice 1 (issue #32), this slice stands up the database container
-- and the GRANT-layer enforcement of the append-only invariant. No domain
-- tables yet — Source / Claim / Citation land in slice 2 (#33) and slice 3
-- (#34).
--
-- Docker-compose lifecycle decision recorded here rather than as a separate
-- ADR (the issue body authorises this carve-out, and ADR-0027 can land later
-- if the choice turns contentious):
--
--   * Single service in docker-compose.yml at the repo root: image
--     pgvector/pgvector:pg16, bound to 127.0.0.1:5432 only (no 0.0.0.0
--     exposure — see personal-use-tradeoffs.md), data on the named volume
--     openbrain-pg-data, healthcheck pg_isready -U openbrain_admin -d
--     openbrain.
--   * `pnpm db:up` brings the container up; `pnpm db:migrate` applies all
--     migrations as openbrain_admin. The PowerShell-first wrapper at
--     tools/openbrain-up.ps1 (and tools/openbrain-up.sh) does both as a
--     single health-gated command.
--   * Migrations are SQL-only per ADR-0023; no down.sql. Recovery is by
--     pg_dump restore, not down-migration.
--   * The runtime adapter connects as openbrain_app (separate role per
--     ADR-0024). The role split is asserted at adapter boot via a no-op
--     UPDATE against _role_assertion, so a mis-wired OPENBRAIN_APP_URL that
--     secretly holds admin credentials fails loudly the first time someone
--     starts the app.
--
-- pgvector is enabled here because every subsequent migration assumes it,
-- and CREATE EXTENSION requires the admin role (which is exactly what the
-- runner uses).

CREATE EXTENSION IF NOT EXISTS vector;

-- Two-role model per ADR-0024.
-- openbrain_admin is the migration role; the runtime never holds it.
-- openbrain_app is the runtime role: INSERT/SELECT on append-only tables,
-- UPDATE/DELETE explicitly revoked at the GRANT layer. The invariant is a
-- database claim, not a code claim.
--
-- Passwords match the values committed to .env.example so a freshly cloned
-- repo boots without manual role setup. This is a localhost-only personal
-- project (see personal-use-tradeoffs.md, Auth row); the passwords are not
-- secrets and rotating them lives in a separate operational ADR once
-- backups land.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openbrain_admin') THEN
    CREATE ROLE openbrain_admin LOGIN PASSWORD 'openbrain_admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openbrain_app') THEN
    CREATE ROLE openbrain_app LOGIN PASSWORD 'openbrain_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE openbrain TO openbrain_app;
GRANT USAGE ON SCHEMA public TO openbrain_app;

-- Sentinel table used by the runtime's role-split tripwire and by the CI
-- testcontainers test. It exists for one job: a no-op write that succeeds
-- under admin and fails with permission denied under openbrain_app. A
-- future migration that creates an append-only table and forgets its
-- REVOKE block must fail the CI test that asserts the same denial pattern.
CREATE TABLE IF NOT EXISTS _role_assertion (
  x integer NOT NULL DEFAULT 0
);

REVOKE ALL ON TABLE _role_assertion FROM openbrain_app;
GRANT INSERT, SELECT ON TABLE _role_assertion TO openbrain_app;
