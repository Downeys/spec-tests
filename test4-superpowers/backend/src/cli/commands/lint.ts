import { lintVault } from "../../lint/lintVault.js";
import { formatJson, formatText } from "../../lint/format.js";
import type { LintReport } from "../../lint/types.js";

export interface LintCmdInput {
  vaultPath: string;
  json: boolean;
}

export interface LintCmdResult extends LintReport {
  text: string;
  json?: string;
}

export async function lintCmd(input: LintCmdInput): Promise<LintCmdResult> {
  const report = await lintVault({ vaultPath: input.vaultPath });
  const text = formatText(report.findings);
  const result: LintCmdResult = { ...report, text };
  if (input.json) result.json = formatJson(report.findings);
  return result;
}
