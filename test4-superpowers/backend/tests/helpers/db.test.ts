import { describe, it, expect } from "vitest";
import { getPool } from "../../src/db/pool.js";
import { truncateAll } from "./db.js";

describe("truncateAll", () => {
  it("removes rows from sources table", async () => {
    const pool = getPool();
    await pool.query(
      "INSERT INTO sources (type, title) VALUES ('manual', 'tmp')"
    );
    const before = await pool.query<{ count: string }>(
      "SELECT count(*) FROM sources"
    );
    expect(Number(before.rows[0]?.count)).toBe(1);

    await truncateAll(pool);

    const after = await pool.query<{ count: string }>(
      "SELECT count(*) FROM sources"
    );
    expect(Number(after.rows[0]?.count)).toBe(0);
  });

  it("preserves the pgmigrations table", async () => {
    const pool = getPool();
    await truncateAll(pool);
    const result = await pool.query<{ count: string }>(
      "SELECT count(*) FROM pgmigrations"
    );
    expect(Number(result.rows[0]?.count)).toBeGreaterThan(0);
  });
});
