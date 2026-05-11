import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "./lintVault.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "lint-orch-"));
  await mkdir(join(vault, "concepts"), { recursive: true });
  await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("lintVault", () => {
  it("returns no findings on a clean vault with empty DB", async () => {
    const report = await lintVault({ vaultPath: vault });
    expect(report.exitCode).toBe(0);
    expect(report.findings.length).toBe(0);
  });

  it("aggregates findings from multiple checks", async () => {
    await writeFile(join(vault, "concepts/x.md"), "no frontmatter\n");
    const report = await lintVault({ vaultPath: vault });
    expect(report.findings.some((f) => f.check === "missing-frontmatter")).toBe(
      true
    );
    expect(report.exitCode).toBe(2);
  });
});
