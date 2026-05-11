import type { LintCheck, LintFinding } from "../types.js";
import { getPool } from "../../db/pool.js";

export const sourcesWithNoClaims: LintCheck = {
  name: "source-no-claims",
  async run(): Promise<LintFinding[]> {
    const result = await getPool().query<{ id: string; title: string }>(
      `SELECT s.id, s.title
       FROM sources s
       LEFT JOIN claims c ON c.source_id = s.id
       WHERE c.id IS NULL`
    );
    return result.rows.map((r) => ({
      check: "source-no-claims",
      severity: "info" as const,
      subject: r.id,
      message: `Source ingested but no claims extracted: ${r.title}`
    }));
  }
};
