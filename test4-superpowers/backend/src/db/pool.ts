import pg from "pg";
import { env, isTestEnv } from "./env.js";

let cachedPool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!cachedPool) {
    const connectionString = isTestEnv() ? env.databaseUrlTest : env.databaseUrl;
    if (!connectionString) {
      throw new Error("No DATABASE_URL configured for the current environment");
    }
    cachedPool = new pg.Pool({ connectionString, max: 10 });
  }
  return cachedPool;
}

export async function closePool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = undefined;
  }
}

export type DbClient = pg.PoolClient | pg.Pool;
