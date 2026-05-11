import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestSource } from "../../src/cli/commands/ingest.js";
import {
  addClaimCmd,
  tagClaimCmd,
  addRelationCmd,
  setClaimStatusCmd
} from "../../src/cli/commands/mutate.js";
import { compileCmd } from "../../src/cli/commands/compile.js";
import { lintCmd } from "../../src/cli/commands/lint.js";
import { resetCmd } from "../../src/cli/commands/reset.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "e2e-"));
  await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
  await mkdir(join(vault, "concepts"), { recursive: true });
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("full memory loop", () => {
  it("seed → compile → lint → reset → compile (round trip)", async () => {
    // 1. Ingest a source via the CLI surface
    const manifest = join(vault, "..", `manifest-${Date.now()}.md`);
    await writeFile(
      manifest,
      `---
type: web
title: Square 2026 State of Restaurants
url: https://square.com/state
author: Square Research
---
62% of independent restaurants under $1M revenue manage scheduling manually.
SMBs prefer SMS over email for ops alerts.`
    );
    const source = await ingestSource(manifest);
    await rm(manifest, { force: true });

    // 2. Add two claims
    const validated = await addClaimCmd({
      statement: "62% of SMB restaurants manage scheduling manually",
      type: "finding",
      sourceId: source.id,
      sourceLocator: "p.1",
      sourceExcerpt: "62% of independent restaurants..."
    });
    const open = await addClaimCmd({
      statement: "SMBs prefer SMS over email for ops alerts",
      type: "hypothesis",
      sourceId: source.id
    });
    await tagClaimCmd(validated.id, "smb-restaurants");
    await tagClaimCmd(open.id, "smb-restaurants");

    // 3. Validate one claim
    await setClaimStatusCmd(validated.id, "validated", "supported by survey data");

    // 4. Add a contradicting claim from a second source
    const otherSource = await addClaimCmd({
      statement: "Most SMB restaurants use specialized scheduling apps",
      type: "finding",
      sourceId: source.id
    });
    await tagClaimCmd(otherSource.id, "smb-restaurants");
    await addRelationCmd(otherSource.id, validated.id, "contradicts");

    // 5. Compile
    const result1 = await compileCmd({ vaultPath: vault });
    expect(result1.run.status).toBe("success");
    expect(result1.written).toContain("concepts/smb-restaurants.md");
    expect(result1.written).toContain("contradictions.md");

    // 6. Assert vault content
    const concept = await readFile(
      join(vault, "concepts/smb-restaurants.md"),
      "utf8"
    );
    expect(concept).toContain("## Validated findings");
    expect(concept).toContain("62% of SMB restaurants");
    expect(concept).toContain("## Open hypotheses");
    expect(concept).toContain("SMBs prefer SMS");

    const contradictions = await readFile(
      join(vault, "contradictions.md"),
      "utf8"
    );
    expect(contradictions).toContain("specialized scheduling apps");
    expect(contradictions).toContain("manage scheduling manually");

    const sourcesPage = await readFile(join(vault, "sources.md"), "utf8");
    expect(sourcesPage).toContain("Square 2026 State of Restaurants");

    // 7. Idempotent re-compile
    const result2 = await compileCmd({ vaultPath: vault });
    expect(result2.written.length).toBe(0);
    expect(result2.skipped.length).toBeGreaterThan(0);

    // 8. Lint should be clean (lint is now side-effect-free and log.md is
    // excluded from the hash comparison)
    const report = await lintCmd({ vaultPath: vault, json: false });
    expect(report.exitCode).toBeLessThanOrEqual(1);

    // 9. Reset clears generated pages but preserves CLAUDE.md
    await resetCmd({ target: "all", vaultPath: vault, yes: true });

    // 10. Re-compile after reset works on empty DB
    await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
    const result3 = await compileCmd({ vaultPath: vault });
    expect(result3.run.status).toBe("success");
    const sourcesAfter = await readFile(join(vault, "sources.md"), "utf8");
    expect(sourcesAfter).toContain("source_count: 0");
  });
});
