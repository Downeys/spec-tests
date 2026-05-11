export type LintSeverity = "info" | "warn" | "error";

export interface LintFinding {
  check: string;
  severity: LintSeverity;
  message: string;
  /** Optional vault path (relative) or DB id this finding refers to. */
  subject?: string;
}

export interface LintReport {
  findings: LintFinding[];
  exitCode: 0 | 1 | 2; // 0 = none, 1 = warn, 2 = error
}

export interface LintInput {
  vaultPath: string;
}

export interface LintCheck {
  name: string;
  run(input: LintInput): Promise<LintFinding[]>;
}
