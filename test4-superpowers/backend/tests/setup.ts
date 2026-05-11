import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.NODE_ENV = "test";

import { afterAll, beforeEach } from "vitest";
import { getPool, closePool } from "../src/db/pool.js";
import { truncateAll } from "./helpers/db.js";

beforeEach(async () => {
  await truncateAll(getPool());
});

afterAll(async () => {
  await closePool();
});
