import type pg from "pg";

const APP_TABLES = [
  "messages",
  "conversations",
  "claim_tags",
  "relations",
  "claims",
  "tags",
  "sources",
  "compilation_runs"
] as const;

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );
}
