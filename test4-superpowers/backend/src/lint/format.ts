import type { LintFinding, LintSeverity } from "./types.js";

const ORDER: LintSeverity[] = ["error", "warn", "info"];

export function computeExitCode(findings: LintFinding[]): 0 | 1 | 2 {
  if (findings.some((f) => f.severity === "error")) return 2;
  if (findings.some((f) => f.severity === "warn")) return 1;
  return 0;
}

export function formatText(findings: LintFinding[]): string {
  if (findings.length === 0) return "OK — no findings.\n";
  const lines: string[] = [];
  for (const sev of ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`# ${sev} (${group.length})`);
    for (const f of group) {
      const subject = f.subject ? ` [${f.subject}]` : "";
      lines.push(`- ${f.check}${subject}: ${f.message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatJson(findings: LintFinding[]): string {
  return JSON.stringify(
    { findings, exitCode: computeExitCode(findings) },
    null,
    2
  );
}
