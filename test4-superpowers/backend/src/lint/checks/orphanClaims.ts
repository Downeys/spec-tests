import type { LintCheck, LintFinding } from "../types.js";
import { getPool } from "../../db/pool.js";

export const orphanClaims: LintCheck = {
  name: "orphan-claim",
  async run(): Promise<LintFinding[]> {
    const result = await getPool().query<{ id: string; statement: string }>(
      `SELECT c.id, c.statement
       FROM claims c
       LEFT JOIN claim_tags ct ON ct.claim_id = c.id
       LEFT JOIN relations r1 ON r1.from_claim = c.id
       LEFT JOIN relations r2 ON r2.to_claim = c.id
       WHERE c.source_id IS NULL
         AND ct.claim_id IS NULL
         AND r1.id IS NULL
         AND r2.id IS NULL`
    );
    return result.rows.map((r) => ({
      check: "orphan-claim",
      severity: "warn" as const,
      subject: r.id,
      message: `Claim has no source, no tags, no relations: "${r.statement.slice(0, 60)}"`
    }));
  }
};
