import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingVaultControl } from "./missingVaultControl.js";
import { missingFrontmatter } from "./missingFrontmatter.js";
import { staleClaimRefs } from "./staleClaimRefs.js";
import { handEditedPages } from "./handEditedPages.js";
import { runCompilation } from "../../compilation/runCompilation.js";
import { getPool } from "../../db/pool.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "vault-lint-"));
  await mkdir(join(vault, "concepts"), { recursive: true });
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("missingVaultControl", () => {
  it("errors when CLAUDE.md is missing", async () => {
    const findings = await missingVaultControl.run({ vaultPath: vault });
    expect(findings.find((f) => f.subject === "CLAUDE.md")).toBeDefined();
    expect(findings[0]?.severity).toBe("error");
  });

  it("does not error when CLAUDE.md is present", async () => {
    await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
    const findings = await missingVaultControl.run({ vaultPath: vault });
    expect(findings.length).toBe(0);
  });
});

describe("missingFrontmatter", () => {
  it("errors when a generated page has no frontmatter", async () => {
    await writeFile(join(vault, "concepts/x.md"), "# no frontmatter here\n");
    const findings = await missingFrontmatter.run({ vaultPath: vault });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("error");
  });

  it("does not error for files in vault/notes/", async () => {
    await mkdir(join(vault, "notes"), { recursive: true });
    await writeFile(join(vault, "notes/freeform.md"), "no frontmatter ok\n");
    const findings = await missingFrontmatter.run({ vaultPath: vault });
    expect(findings.length).toBe(0);
  });
});

describe("staleClaimRefs", () => {
  it("errors when a vault page references a claim id that does not exist", async () => {
    await writeFile(
      join(vault, "concepts/x.md"),
      "---\ntype: concept\n---\n^claim-deadbeef\n"
    );
    const findings = await staleClaimRefs.run({ vaultPath: vault });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("error");
  });
});

describe("handEditedPages", () => {
  it("warns when a generated page's hashable content does not match expected", async () => {
    await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
    await runCompilation({ pool: getPool(), vaultPath: vault, trigger: "cli" });

    // Hand-edit
    await writeFile(
      join(vault, "sources.md"),
      "---\ntype: source-index\nsource_count: 999\n---\nHAND EDIT\n"
    );

    const findings = await handEditedPages.run({ vaultPath: vault });
    expect(findings.find((f) => f.subject === "sources.md")).toBeDefined();
    expect(findings[0]?.severity).toBe("warn");
  });
});
