import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LintCheck, LintFinding } from "../types.js";
import { splitPage } from "../../compilation/render/frontmatter.js";

const GENERATED_FILES = [
  "sources.md",
  "index.md",
  "log.md",
  "contradictions.md"
];

const GENERATED_DIRS = ["concepts"];

async function checkFile(
  vaultPath: string,
  relative: string
): Promise<LintFinding | null> {
  try {
    const text = await readFile(join(vaultPath, relative), "utf8");
    const { frontmatter } = splitPage(text);
    if (!frontmatter) {
      return {
        check: "missing-frontmatter",
        severity: "error",
        subject: relative,
        message: `Generated page is missing frontmatter`
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const missingFrontmatter: LintCheck = {
  name: "missing-frontmatter",
  async run({ vaultPath }): Promise<LintFinding[]> {
    const findings: LintFinding[] = [];
    for (const f of GENERATED_FILES) {
      const finding = await checkFile(vaultPath, f);
      if (finding) findings.push(finding);
    }
    for (const dir of GENERATED_DIRS) {
      let entries: string[] = [];
      try {
        entries = await readdir(join(vaultPath, dir));
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const finding = await checkFile(vaultPath, `${dir}/${entry}`);
        if (finding) findings.push(finding);
      }
    }
    return findings;
  }
};
