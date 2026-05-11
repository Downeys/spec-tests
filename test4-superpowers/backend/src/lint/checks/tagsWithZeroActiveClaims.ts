import type { LintCheck, LintFinding } from "../types.js";
import { getPool } from "../../db/pool.js";

export const tagsWithZeroActiveClaims: LintCheck = {
  name: "tag-zero-active",
  async run(): Promise<LintFinding[]> {
    const result = await getPool().query<{ slug: string }>(
      `SELECT t.slug
       FROM tags t
       LEFT JOIN claim_tags ct ON ct.tag_id = t.id
       LEFT JOIN claims c ON c.id = ct.claim_id AND c.status NOT IN ('retired')
       GROUP BY t.id, t.slug
       HAVING count(c.id) = 0`
    );
    return result.rows.map((r) => ({
      check: "tag-zero-active",
      severity: "info" as const,
      subject: r.slug,
      message: `Tag has no active claims (concept page is a stub)`
    }));
  }
};
