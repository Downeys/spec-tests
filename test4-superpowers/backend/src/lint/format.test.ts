import { describe, it, expect } from "vitest";
import { formatText, formatJson, computeExitCode } from "./format.js";

describe("computeExitCode", () => {
  it("returns 0 with no findings", () => {
    expect(computeExitCode([])).toBe(0);
  });
  it("returns 1 for warn-only", () => {
    expect(
      computeExitCode([
        { check: "x", severity: "warn", message: "" },
        { check: "y", severity: "info", message: "" }
      ])
    ).toBe(1);
  });
  it("returns 2 when any error present", () => {
    expect(
      computeExitCode([
        { check: "x", severity: "warn", message: "" },
        { check: "y", severity: "error", message: "" }
      ])
    ).toBe(2);
  });
});

describe("formatText", () => {
  it("groups by severity in error/warn/info order", () => {
    const out = formatText([
      { check: "a", severity: "info", message: "i" },
      { check: "b", severity: "error", message: "e" },
      { check: "c", severity: "warn", message: "w" }
    ]);
    const errIdx = out.indexOf("error");
    const warnIdx = out.indexOf("warn");
    const infoIdx = out.indexOf("info");
    expect(errIdx).toBeLessThan(warnIdx);
    expect(warnIdx).toBeLessThan(infoIdx);
  });
});

describe("formatJson", () => {
  it("returns valid JSON", () => {
    const out = formatJson([{ check: "x", severity: "warn", message: "m" }]);
    const parsed = JSON.parse(out);
    expect(parsed.findings.length).toBe(1);
    expect(parsed.exitCode).toBe(1);
  });
});
