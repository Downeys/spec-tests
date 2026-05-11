import type { LintCheck, LintInput, LintReport } from "./types.js";
import { computeExitCode } from "./format.js";
import { orphanClaims } from "./checks/orphanClaims.js";
import { sourcesWithNoClaims } from "./checks/sourcesWithNoClaims.js";
import { tagsWithZeroActiveClaims } from "./checks/tagsWithZeroActiveClaims.js";
import { agingContradictions } from "./checks/agingContradictions.js";
import { missingVaultControl } from "./checks/missingVaultControl.js";
import { missingFrontmatter } from "./checks/missingFrontmatter.js";
import { staleClaimRefs } from "./checks/staleClaimRefs.js";
import { handEditedPages } from "./checks/handEditedPages.js";

const ALL_CHECKS: LintCheck[] = [
  // DB-side
  orphanClaims,
  sourcesWithNoClaims,
  tagsWithZeroActiveClaims,
  agingContradictions,
  // Vault-side
  missingVaultControl,
  missingFrontmatter,
  staleClaimRefs,
  handEditedPages
];

export async function lintVault(input: LintInput): Promise<LintReport> {
  const all = [];
  for (const check of ALL_CHECKS) {
    const findings = await check.run(input);
    all.push(...findings);
  }
  return {
    findings: all,
    exitCode: computeExitCode(all)
  };
}
