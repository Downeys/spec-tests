import type pg from "pg";
import type { CompilationRun } from "../openbrain/types.js";

export interface CompilationContext {
  runId: string;
  generatedAt: Date;
  pool: pg.Pool;
  vaultPath: string;
}

export interface RenderedPage {
  /** Path relative to vaultPath, e.g. "concepts/smb.md" */
  path: string;
  content: string;
}

export interface Compiler {
  name: string;
  /** Generate the desired pages from current OpenBrain state. */
  render(ctx: CompilationContext): Promise<RenderedPage[]>;
}

export interface CompilationResult {
  run: CompilationRun;
  written: string[];
  skipped: string[];
}
