import type { LintCheck, LintFinding } from "../types.js";
import { getPool } from "../../db/pool.js";

export const agingContradictions: LintCheck = {
  name: "aging-contradiction",
  async run(): Promise<LintFinding[]> {
    const result = await getPool().query<{
      id: string;
      from_claim: string;
      to_claim: string;
      days: string;
    }>(
      `SELECT r.id, r.from_claim, r.to_claim,
              EXTRACT(EPOCH FROM (now() - r.created_at)) / 86400 AS days
       FROM relations r
       JOIN claims a ON a.id = r.from_claim
       JOIN claims b ON b.id = r.to_claim
       WHERE r.type = 'contradicts'
         AND a.status = 'open'
         AND b.status = 'open'
         AND r.created_at < now() - interval '14 days'`
    );
    return result.rows.map((r) => ({
      check: "aging-contradiction",
      severity: "info" as const,
      subject: r.id,
      message: `Contradiction unresolved for ${Math.floor(Number(r.days))} days (claims ${r.from_claim.slice(0, 8)}... vs ${r.to_claim.slice(0, 8)}...)`
    }));
  }
};
