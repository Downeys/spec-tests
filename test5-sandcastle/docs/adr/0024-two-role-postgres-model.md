# Two-role Postgres model for OpenBrain (`openbrain_admin` + `openbrain_app`)

The append-only invariant in [memory-architecture.md](../principles/memory-architecture.md) is enforced at the Postgres GRANT level, not in app code. That enforcement is only real if the runtime credentials _physically cannot_ perform `UPDATE` or `DELETE` on the relevant tables. We split OpenBrain database access into **two Postgres roles** from day one: `openbrain_admin` runs migrations and owns DDL/GRANT/EXTENSION; `openbrain_app` is the runtime user with `INSERT` and `SELECT` only on Source/Claim/Citation/etc. tables — `UPDATE` and `DELETE` are explicitly revoked, so a buggy or compromised runtime cannot rewrite history even if app-layer guards fail.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Append-only invariant in [memory-architecture.md](../principles/memory-architecture.md). Migration tooling in [ADR-0023](0023-node-pg-migrate-sql-only.md).

## Considered Options

- **A — Two roles from day one (chosen).** Every migration that creates an append-only table also `REVOKE ALL` + `GRANT INSERT, SELECT` for `openbrain_app`. The runtime adapter connects as `openbrain_app`. Migrations connect as `openbrain_admin`.
- **B — Single superuser for PRD-4, split later.** Ship the schema and runtime code now as one user; queue a "split into two roles" issue. Rejected because the GRANT lines are pure churn to retrofit (every migration touched), and the tests asserting `UPDATE`-rejects-with-permission-denied have to be added later anyway.
- **C — Application-layer guards only (no role split).** Trust Zod and the adapter code to never issue an `UPDATE`. Rejected because it makes the invariant a code claim instead of a database claim, and the marquee feature of OpenBrain is auditable immutability — a single careless query method would silently break it.

## Consequences

- **Every migration creating an append-only table includes its GRANT block.** Forgetting the block silently grants the runtime full DML rights. The CI migration test (per [ADR-0023](0023-node-pg-migrate-sql-only.md)) connects as `openbrain_app` after applying all migrations and asserts that `UPDATE` and `DELETE` on each tracked table return `permission denied` — forgotten GRANTs fail PR checks.
- **`OPENBRAIN_ADMIN_URL` and `OPENBRAIN_APP_URL` are separate runtime config values.** The migration runner reads the admin URL; the External adapter reads the app URL. Mixing them up at runtime is caught at startup by attempting a no-op `UPDATE` on a sentinel table — if it succeeds, we're connected as the wrong role and refuse to start.
- **`previousVersionId` chains replace mutation.** A "metadata correction" to a Source isn't an `UPDATE` — it's an `INSERT` of a new row whose `previousVersionId` points at the prior row. The repo loads the head of each chain by default; full history is queryable. This is the data shape the role split forces, and it matches the append-only principle directly.
- **Operational ergonomics.** `pnpm db:psql` opens a shell as `openbrain_admin` (so a developer poking at the DB can do anything). The runtime never has those rights. There is no scenario in which production app code holds the admin credential.
