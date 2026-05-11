import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { LintCheck, LintFinding } from "../types.js";

const REQUIRED = ["CLAUDE.md"];

export const missingVaultControl: LintCheck = {
  name: "missing-vault-control",
  async run({ vaultPath }): Promise<LintFinding[]> {
    const findings: LintFinding[] = [];
    for (const f of REQUIRED) {
      try {
        await stat(join(vaultPath, f));
      } catch {
        findings.push({
          check: "missing-vault-control",
          severity: "error",
          subject: f,
          message: `Required vault file missing: ${f}`
        });
      }
    }
    return findings;
  }
};
