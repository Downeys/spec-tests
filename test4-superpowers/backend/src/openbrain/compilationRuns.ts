import type pg from "pg";
import { getPool } from "../db/pool.js";
import {
  type CompilationRun,
  type CompilationTrigger,
  NotFoundError
} from "./types.js";

interface RunRow {
  id: string;
  trigger: CompilationTrigger;
  started_at: Date;
  finished_at: Date | null;
  status: "running" | "success" | "error";
  pages_written: number;
  pages_skipped: number;
  notes: string | null;
  error_message: string | null;
}

const COLS =
  "id, trigger, started_at, finished_at, status, pages_written, pages_skipped, notes, error_message";

function rowToRun(row: RunRow): CompilationRun {
  return {
    id: row.id,
    trigger: row.trigger,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    pagesWritten: row.pages_written,
    pagesSkipped: row.pages_skipped,
    notes: row.notes,
    errorMessage: row.error_message
  };
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function startCompilationRun(
  trigger: CompilationTrigger,
  c?: pg.PoolClient
): Promise<CompilationRun> {
  const result = await client(c).query<RunRow>(
    `INSERT INTO compilation_runs (trigger, status)
     VALUES ($1, 'running')
     RETURNING ${COLS}`,
    [trigger]
  );
  return rowToRun(result.rows[0]!);
}

export interface FinishInput {
  pagesWritten: number;
  pagesSkipped: number;
  notes?: string | null;
}

export async function finishCompilationRun(
  id: string,
  input: FinishInput,
  c?: pg.PoolClient
): Promise<CompilationRun> {
  const result = await client(c).query<RunRow>(
    `UPDATE compilation_runs
       SET status = 'success',
           finished_at = now(),
           pages_written = $2,
           pages_skipped = $3,
           notes = $4
     WHERE id = $1
     RETURNING ${COLS}`,
    [id, input.pagesWritten, input.pagesSkipped, input.notes ?? null]
  );
  if (!result.rows[0]) throw new NotFoundError("compilation_run", id);
  return rowToRun(result.rows[0]);
}

export async function failCompilationRun(
  id: string,
  errorMessage: string,
  c?: pg.PoolClient
): Promise<CompilationRun> {
  const result = await client(c).query<RunRow>(
    `UPDATE compilation_runs
       SET status = 'error',
           finished_at = now(),
           error_message = $2
     WHERE id = $1
     RETURNING ${COLS}`,
    [id, errorMessage]
  );
  if (!result.rows[0]) throw new NotFoundError("compilation_run", id);
  return rowToRun(result.rows[0]);
}

export async function listRecentCompilationRuns(
  limit: number,
  c?: pg.PoolClient
): Promise<CompilationRun[]> {
  const result = await client(c).query<RunRow>(
    `SELECT ${COLS} FROM compilation_runs
     ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(rowToRun);
}

export async function getRunningCompilationRun(
  c?: pg.PoolClient
): Promise<CompilationRun | null> {
  const result = await client(c).query<RunRow>(
    `SELECT ${COLS} FROM compilation_runs
     WHERE status = 'running'
     ORDER BY started_at DESC LIMIT 1`
  );
  return result.rows[0] ? rowToRun(result.rows[0]) : null;
}
