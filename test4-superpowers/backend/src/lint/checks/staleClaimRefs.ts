import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LintCheck, LintFinding } from "../types.js";
import { getPool } from "../../db/pool.js";

const CLAIM_REF_RE = /\^claim-([0-9a-f]{8})/g;
const VAULT_PAGES = [
  "sources.md",
  "index.md",
  "log.md",
  "contradictions.md"
];

async function pageFiles(vaultPath: string): Promise<string[]> {
  const files = [...VAULT_PAGES];
  try {
    const entries = await readdir(join(vaultPath, "concepts"));
    for (const e of entries) {
      if (e.endsWith(".md")) files.push(`concepts/${e}`);
    }
  } catch {
    // no concepts dir
  }
  return files;
}

export const staleClaimRefs: LintCheck = {
  name: "stale-claim-ref",
  async run({ vaultPath }): Promise<LintFinding[]> {
    const findings: LintFinding[] = [];
    const files = await pageFiles(vaultPath);

    // Collect referenced shortIds across the vault
    const refs = new Map<string, string[]>();
    for (const file of files) {
      let text: string;
      try {
        text = await readFile(join(vaultPath, file), "utf8");
      } catch {
        continue;
      }
      let m: RegExpExecArray | null;
      while ((m = CLAIM_REF_RE.exec(text)) !== null) {
        const id = m[1]!;
        const list = refs.get(id) ?? [];
        list.push(file);
        refs.set(id, list);
      }
    }
    if (refs.size === 0) return findings;

    const result = await getPool().query<{ id: string }>(
      `SELECT id FROM claims`
    );
    const valid = new Set(
      result.rows.map((r) => r.id.replace(/-/g, "").slice(0, 8))
    );

    for (const [shortId, fileList] of refs.entries()) {
      if (valid.has(shortId)) continue;
      for (const file of fileList) {
        findings.push({
          check: "stale-claim-ref",
          severity: "error",
          subject: `${file}#^claim-${shortId}`,
          message: `Wiki page references a claim id that does not exist in DB`
        });
      }
    }
    return findings;
  }
};
