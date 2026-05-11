import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { LintCheck, LintFinding } from "../types.js";
import { renderAllPages } from "../../compilation/runCompilation.js";
import { getPool } from "../../db/pool.js";
import { sha256 } from "../../compilation/render/hash.js";
import { hashableContent } from "../../compilation/render/frontmatter.js";

async function collectGeneratedFiles(root: string): Promise<string[]> {
  // log.md is intentionally excluded — it is append-only and not
  // hash-comparable against a fresh render.
  const top = ["sources.md", "index.md", "contradictions.md"];
  const present: string[] = [];
  for (const f of top) {
    try {
      await stat(join(root, f));
      present.push(f);
    } catch {
      // skip
    }
  }
  try {
    const entries = await readdir(join(root, "concepts"));
    for (const e of entries) {
      if (e.endsWith(".md")) present.push(`concepts/${e}`);
    }
  } catch {
    // skip
  }
  return present;
}

export const handEditedPages: LintCheck = {
  name: "hand-edited-page",
  async run({ vaultPath }): Promise<LintFinding[]> {
    // Use renderAllPages (pure, side-effect-free) to learn the expected
    // page set without inserting a compilation_runs row.
    const expectedPages = await renderAllPages({
      pool: getPool(),
      vaultPath,
      runId: "00000000-0000-0000-0000-000000000000",
      generatedAt: new Date(0)
    });
    const expectedByPath = new Map<string, string>();
    for (const page of expectedPages) {
      expectedByPath.set(page.path, sha256(hashableContent(page.content)));
    }

    const findings: LintFinding[] = [];
    const actualFiles = await collectGeneratedFiles(vaultPath);
    for (const f of actualFiles) {
      try {
        const text = await readFile(join(vaultPath, f), "utf8");
        const actualHash = sha256(hashableContent(text));
        const expectedHash = expectedByPath.get(f);
        if (expectedHash && actualHash !== expectedHash) {
          findings.push({
            check: "hand-edited-page",
            severity: "warn",
            subject: f,
            message:
              "Generated page hash does not match expected output; will be overwritten on next compile"
          });
        }
      } catch {
        // ignore missing files
      }
    }
    return findings;
  }
};
