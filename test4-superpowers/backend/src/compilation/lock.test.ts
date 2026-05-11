import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLock,
  releaseLock,
  readLock,
  STALE_AFTER_MS
} from "./lock.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "lock-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("lock", () => {
  it("acquires when no lock file exists", async () => {
    const result = await acquireLock(tmp, "run-1");
    expect(result.acquired).toBe(true);
    const info = await readLock(tmp);
    expect(info?.runId).toBe("run-1");
  });

  it("refuses to acquire when a fresh lock exists", async () => {
    await acquireLock(tmp, "run-1");
    const result = await acquireLock(tmp, "run-2");
    expect(result.acquired).toBe(false);
    expect(result.staleRunId).toBeUndefined();
    expect(result.heldByRunId).toBe("run-1");
  });

  it("reports a stale lock as recoverable", async () => {
    const lockPath = join(tmp, ".compile.lock");
    const old = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    await writeFile(
      lockPath,
      JSON.stringify({ runId: "old", startedAt: old, pid: 1 })
    );
    const result = await acquireLock(tmp, "run-2");
    expect(result.acquired).toBe(true);
    expect(result.staleRunId).toBe("old");
  });

  it("releaseLock removes the file", async () => {
    await acquireLock(tmp, "run-1");
    await releaseLock(tmp);
    await expect(stat(join(tmp, ".compile.lock"))).rejects.toThrow();
  });

  it("releaseLock is idempotent when no file exists", async () => {
    await expect(releaseLock(tmp)).resolves.not.toThrow();
  });
});
