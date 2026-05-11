# `node-pg-migrate` for OpenBrain migrations, SQL-only, no down-migrations by default

OpenBrain's append-only invariant is enforced at the Postgres GRANT level (`REVOKE UPDATE, DELETE`) per [memory-architecture.md](../principles/memory-architecture.md), and pgvector requires `CREATE EXTENSION vector` plus eventual `CREATE INDEX ... USING hnsw`. Both are outside the conceptual surface of any TypeScript ORM or schema-DSL migration tool, so the choice space is restricted to SQL-first runners. We use **`node-pg-migrate`** with **raw `.sql` files only** (the JS-migrations path is forbidden), in **`packages/external/openbrain/migrations/`**, with **no `down.sql` files written by default** — rollbacks happen via `pg_dump` restore, not migration reversal.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Append-only invariant in [memory-architecture.md](../principles/memory-architecture.md).

## Considered Options

- **A — `node-pg-migrate`, SQL-only, no-down (chosen).** Ranked migrations as plain SQL, state tracked in a `pgmigrations` table, run via `pnpm db:migrate`. Pure-Node, no extra binary, native to the existing pnpm workspace.
- **B — Atlas (declarative HCL/SQL).** Diff-based migration synthesis. Rejected because every migration here will be hand-written for invariant-encoding reasons (GRANTs, extension creation, index choices), and the declarative-diff layer obscures the literal SQL that runs in prod for no offsetting benefit at this scale.
- **C — Hand-rolled bash/pnpm script over numbered `.sql` files.** Smaller than A but reinvents transactional application, version tracking, dry-run, and cross-instance locking. The 30-line runner balloons; A already solved this.
- **D — Drizzle Kit / Prisma Migrate / TypeORM.** Rejected categorically: schema-DSL-driven generators have no native concept of GRANTs or extensions, so every interesting migration would need a raw-SQL escape hatch. The DSL becomes a leaky middleman, not a guard rail.

## Consequences

- **`packages/external/openbrain/migrations/0001_init.sql`, `0002_sources.sql`, ...** — all migrations are SQL, never JS. node-pg-migrate's JS migration path is disallowed because it puts schema mutation logic outside the surface where it can be reviewed as plain SQL.
- **No `down.sql` by default.** For an append-only schema whose recovery story is "restore the latest `pg_dump` snapshot," down-migrations are theatre. Write a `down.sql` only when a specific migration genuinely needs one (rare; when it does, justify in the migration's leading comment).
- **CI migration test.** Every migration is exercised in CI by spinning a fresh testcontainers Postgres, applying all migrations in order, and asserting the resulting schema matches expectations. Catches forgotten-migration commits at PR time. Aligns with [testing.md](../principles/testing.md)'s testcontainers requirement.
- **Migration runner stays inside the OpenBrain package** (`packages/external/openbrain/`), not at the repo root. Nothing else in the system has a migrations story; locating migrations next to the adapter that owns the schema keeps boundaries clean.
- **`pnpm db:migrate` and `pnpm db:migrate:status`** are the public verbs. No `db:migrate:down` script — if you ever need a down, run node-pg-migrate's CLI directly so the choice is conscious.
