import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "./render/atomicWrite.js";

export const STALE_AFTER_MS = 10 * 60 * 1000;
const LOCK_FILE = ".compile.lock";

interface LockInfo {
  runId: string;
  startedAt: string; // ISO 8601
  pid: number;
}

interface AcquireResult {
  acquired: boolean;
  /** When acquired===true and a stale lock was overridden, this is the previous run id. */
  staleRunId?: string;
  /** When acquired===false, the run id currently holding the lock. */
  heldByRunId?: string;
}

export async function readLock(vaultPath: string): Promise<LockInfo | null> {
  try {
    const text = await readFile(join(vaultPath, LOCK_FILE), "utf8");
    return JSON.parse(text) as LockInfo;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

export async function acquireLock(
  vaultPath: string,
  runId: string
): Promise<AcquireResult> {
  await ensureDir(vaultPath);
  const existing = await readLock(vaultPath);
  if (existing) {
    const age = Date.now() - new Date(existing.startedAt).getTime();
    if (age < STALE_AFTER_MS) {
      return { acquired: false, heldByRunId: existing.runId };
    }
    // Stale — proceed to overwrite
    const info: LockInfo = {
      runId,
      startedAt: new Date().toISOString(),
      pid: process.pid
    };
    await writeFile(join(vaultPath, LOCK_FILE), JSON.stringify(info));
    return { acquired: true, staleRunId: existing.runId };
  }
  const info: LockInfo = {
    runId,
    startedAt: new Date().toISOString(),
    pid: process.pid
  };
  await writeFile(join(vaultPath, LOCK_FILE), JSON.stringify(info));
  return { acquired: true };
}

export async function releaseLock(vaultPath: string): Promise<void> {
  try {
    await unlink(join(vaultPath, LOCK_FILE));
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return;
    }
    throw err;
  }
}
