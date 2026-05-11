import * as dotenv from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve from backend/src/db/env.ts up to the project root.
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get databaseUrlTest(): string | undefined {
    return process.env.DATABASE_URL_TEST;
  },
  get vaultPath(): string {
    const raw = process.env.VAULT_PATH ?? "./vault";
    return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
  }
};

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}
