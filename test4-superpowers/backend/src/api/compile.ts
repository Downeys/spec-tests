import type { FastifyInstance } from "fastify";
import { runCompilation } from "../compilation/runCompilation.js";
import { getPool } from "../db/pool.js";
import { env } from "../db/env.js";

export async function registerCompileRoute(app: FastifyInstance): Promise<void> {
  app.post("/vault/compile", async (_req, reply) => {
    try {
      const start = Date.now();
      const result = await runCompilation({
        pool: getPool(),
        vaultPath: env.vaultPath,
        trigger: "api"
      });
      return {
        runId: result.run.id,
        status: result.run.status,
        pagesWritten: result.written.length,
        pagesSkipped: result.skipped.length,
        durationMs: Date.now() - start
      };
    } catch (err) {
      const msg = (err as Error).message ?? "compile failed";
      if (msg.toLowerCase().includes("already in progress") || msg.toLowerCase().includes("lock")) {
        reply.code(409);
      } else {
        reply.code(500);
      }
      return { error: msg };
    }
  });
}
