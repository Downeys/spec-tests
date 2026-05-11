import { describe, it, expect, afterAll } from "vitest";
import { getPool, closePool } from "./pool.js";

describe("pool", () => {
  afterAll(async () => {
    await closePool();
  });

  it("connects to the test database", async () => {
    const pool = getPool();
    const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
    expect(result.rows[0]?.ok).toBe(1);
  });

  it("returns the same pool across calls", () => {
    expect(getPool()).toBe(getPool());
  });
});
