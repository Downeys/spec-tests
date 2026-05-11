import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompilation } from "./runCompilation.js";
import { getPool } from "../db/pool.js";
import { createSource } from "../openbrain/sources.js";
import { createClaim } from "../openbrain/claims.js";
import { addClaimTag } from "../openbrain/tags.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "vault-"));
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("runCompilation", () => {
  it("writes core pages on a fresh vault", async () => {
    const result = await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });

    expect(result.run.status).toBe("success");
    expect(result.written).toContain("sources.md");
    expect(result.written).toContain("contradictions.md");
    expect(result.written).toContain("index.md");
    // log.md is append-only and not part of `written` (which tracks
    // hash-and-skip pages), but it should exist on disk.
    await stat(join(vault, "log.md"));

    const sources = await readFile(join(vault, "sources.md"), "utf8");
    expect(sources).toContain("type: source-index");
  });

  it("includes a concept page when there is a tagged claim", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    await addClaimTag(c.id, "alpha");

    const result = await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });

    expect(result.written).toContain("concepts/alpha.md");
    const page = await readFile(join(vault, "concepts/alpha.md"), "utf8");
    expect(page).toContain("# alpha");
  });

  it("is idempotent: a second run skips all pages when state is unchanged", async () => {
    await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });
    const result = await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });
    expect(result.written.length).toBe(0);
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.run.pagesWritten).toBe(0);
    expect(result.run.pagesSkipped).toBe(result.skipped.length);
  });

  it("only re-writes affected pages when one tag changes", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    await addClaimTag(c.id, "alpha");
    await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });

    const c2 = await createClaim({
      statement: "y",
      type: "finding",
      sourceId: s.id
    });
    await addClaimTag(c2.id, "beta");

    const result = await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });

    expect(result.written).toContain("concepts/beta.md");
    expect(result.written).toContain("index.md");
    expect(result.skipped).toContain("concepts/alpha.md");
  });

  it("refuses to run when a fresh lock exists", async () => {
    await writeFile(
      join(vault, ".compile.lock"),
      JSON.stringify({
        runId: "other",
        startedAt: new Date().toISOString(),
        pid: 1
      })
    );

    await expect(
      runCompilation({
        pool: getPool(),
        vaultPath: vault,
        trigger: "cli"
      })
    ).rejects.toThrow(/already in progress/i);
  });

  it("releases the lock after a successful run", async () => {
    await runCompilation({
      pool: getPool(),
      vaultPath: vault,
      trigger: "cli"
    });
    await expect(stat(join(vault, ".compile.lock"))).rejects.toThrow();
  });
});
