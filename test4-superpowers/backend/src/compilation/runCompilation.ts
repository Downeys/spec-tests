import type pg from "pg";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Compiler, CompilationResult, RenderedPage } from "./types.js";
import { acquireLock, releaseLock } from "./lock.js";
import { atomicWriteFile } from "./render/atomicWrite.js";
import { sha256 } from "./render/hash.js";
import { hashableContent } from "./render/frontmatter.js";
import {
  type CompilationTrigger,
  type CompilationRun
} from "../openbrain/types.js";
import {
  startCompilationRun,
  finishCompilationRun,
  failCompilationRun
} from "../openbrain/compilationRuns.js";
import { conceptsCompiler } from "./compilers/concepts.js";
import { sourcesCompiler } from "./compilers/sources.js";
import { contradictionsCompiler } from "./compilers/contradictions.js";
import { indexCompiler } from "./compilers/index.js";

export interface RunCompilationInput {
  pool: pg.Pool;
  vaultPath: string;
  trigger: CompilationTrigger;
}

export interface RenderAllPagesInput {
  pool: pg.Pool;
  vaultPath: string;
  /** Used for frontmatter / inside log.md entry — pass a stable id when called from lint. */
  runId: string;
  /** Used for frontmatter timestamps — pass a fixed Date when called from lint. */
  generatedAt: Date;
}

const COMPILERS_FOR_HASH: Compiler[] = [
  conceptsCompiler,
  sourcesCompiler,
  contradictionsCompiler,
  indexCompiler
];
// logCompiler is intentionally not in COMPILERS_FOR_HASH — log.md is append-only,
// handled separately by appendLogEntry below.

/** Pure: reads OpenBrain state and renders the desired pages. No DB writes. */
export async function renderAllPages(
  input: RenderAllPagesInput
): Promise<RenderedPage[]> {
  const ctx = {
    runId: input.runId,
    generatedAt: input.generatedAt,
    pool: input.pool,
    vaultPath: input.vaultPath
  };
  const all: RenderedPage[] = [];
  for (const compiler of COMPILERS_FOR_HASH) {
    const pages = await compiler.render(ctx);
    all.push(...pages);
  }
  return all;
}

async function existingHashableHash(
  vaultPath: string,
  relativePath: string
): Promise<string | null> {
  try {
    const full = join(vaultPath, relativePath);
    await stat(full);
    const text = await readFile(full, "utf8");
    return sha256(hashableContent(text));
  } catch {
    return null;
  }
}

async function appendLogEntry(
  vaultPath: string,
  run: CompilationRun
): Promise<void> {
  const logPath = join(vaultPath, "log.md");
  const iso = run.startedAt.toISOString();
  const ts = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  const subject = `${run.id} (${run.status})`;
  const lines = [
    "",
    `## [${ts}] ${run.trigger} | ${subject}`,
    run.status === "success"
      ? `- pages_written: ${run.pagesWritten}, pages_skipped: ${run.pagesSkipped}`
      : `- error: ${run.errorMessage ?? "(unknown)"}`
  ];
  if (run.notes) lines.push(`- notes: ${run.notes}`);
  lines.push("");

  // Ensure log.md exists with frontmatter; if not, create it.
  let existing = "";
  try {
    existing = await readFile(logPath, "utf8");
  } catch {
    existing = "";
  }
  if (!existing) {
    const frontmatter = `---\ntype: log\n---\n\n# Compilation log\n`;
    await writeFile(logPath, frontmatter, "utf8");
  }
  await appendFile(logPath, lines.join("\n"), "utf8");
}

export async function runCompilation(
  input: RunCompilationInput
): Promise<CompilationResult> {
  const { pool, vaultPath, trigger } = input;

  const run = await startCompilationRun(trigger);

  const lockResult = await acquireLock(vaultPath, run.id);
  if (!lockResult.acquired) {
    await failCompilationRun(
      run.id,
      `Lock held by run ${lockResult.heldByRunId}`
    );
    throw new Error(
      `Compilation already in progress (run ${lockResult.heldByRunId}). Wait or remove ${vaultPath}/.compile.lock if stale.`
    );
  }

  const written: string[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  if (lockResult.staleRunId) {
    notes.push(`recovered from stale lock (run ${lockResult.staleRunId})`);
  }

  try {
    const generatedAt = new Date();
    const pages = await renderAllPages({
      pool,
      vaultPath,
      runId: run.id,
      generatedAt
    });

    for (const page of pages) {
      const newHash = sha256(hashableContent(page.content));
      const oldHash = await existingHashableHash(vaultPath, page.path);
      if (oldHash === newHash) {
        skipped.push(page.path);
        continue;
      }
      await atomicWriteFile(join(vaultPath, page.path), page.content);
      written.push(page.path);
    }

    const finished = await finishCompilationRun(run.id, {
      pagesWritten: written.length,
      pagesSkipped: skipped.length,
      notes: notes.length ? notes.join("; ") : null
    });

    await appendLogEntry(vaultPath, finished);

    return { run: finished, written, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let failedRun: CompilationRun;
    try {
      failedRun = await failCompilationRun(run.id, message);
    } catch {
      failedRun = { ...run, status: "error", errorMessage: message } as CompilationRun;
    }
    throw Object.assign(err instanceof Error ? err : new Error(message), {
      run: failedRun
    });
  } finally {
    await releaseLock(vaultPath);
  }
}
