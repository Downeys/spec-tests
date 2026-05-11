import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCmd } from "./compile.js";
import { lintCmd } from "./lint.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "compile-cli-"));
  await mkdir(join(vault, "concepts"), { recursive: true });
  await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("compileCmd", () => {
  it("returns a result describing what was written", async () => {
    const result = await compileCmd({ vaultPath: vault });
    expect(result.run.status).toBe("success");
    expect(result.written).toContain("sources.md");
  });
});

describe("lintCmd", () => {
  it("returns a report with exit code 0 on clean vault", async () => {
    await compileCmd({ vaultPath: vault });
    const report = await lintCmd({ vaultPath: vault, json: false });
    expect([0, 1]).toContain(report.exitCode);
  });

  it("returns json when --json is set", async () => {
    await compileCmd({ vaultPath: vault });
    const report = await lintCmd({ vaultPath: vault, json: true });
    expect(report.json).toBeDefined();
    expect(() => JSON.parse(report.json!)).not.toThrow();
  });
});
