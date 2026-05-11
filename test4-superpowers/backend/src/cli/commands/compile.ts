import { runCompilation } from "../../compilation/runCompilation.js";
import { getPool } from "../../db/pool.js";
import type { CompilationResult } from "../../compilation/types.js";

export interface CompileCmdInput {
  vaultPath: string;
}

export async function compileCmd(
  input: CompileCmdInput
): Promise<CompilationResult> {
  return runCompilation({
    pool: getPool(),
    vaultPath: input.vaultPath,
    trigger: "cli"
  });
}
