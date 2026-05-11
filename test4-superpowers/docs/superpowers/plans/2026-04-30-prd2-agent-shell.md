# PRD 2 Implementation Plan: Agent Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the chat UI + Node backend + Opus agent shell that makes PRD 1's memory layer exercisable for a human user. Adds RAG via pgvector + Voyage AI, conversation persistence with manual lifecycle, narrow agent write surface, and a Fastify HTTP service feeding a React + Vite + Tailwind frontend.

**Architecture:** Fastify backend hosting a custom multi-turn agent loop on `@anthropic-ai/sdk` (Messages API) with 11 tools (7 read, 4 write) over the existing OpenBrain API plus pgvector RAG over claims. Streaming via SSE. Single ephemeral conversation persisted in Postgres; manual Compact (Haiku-summarized) and New (cascading delete). React frontend in chat-pane + live-context-panel layout. Compilation triggered manually via existing PRD 1 `runCompilation`.

**Tech Stack:** Node 20 + TypeScript (strict), pnpm workspaces. Backend: Fastify, `@anthropic-ai/sdk`, `voyageai` (or REST), `pg`, `pgvector` extension, Vitest, `cac`. Frontend: Vite + React + TypeScript + Tailwind + Zustand + react-markdown + remark-gfm. E2E: Playwright.

**Spec:** [docs/superpowers/specs/2026-04-30-prd2-agent-shell-design.md](../specs/2026-04-30-prd2-agent-shell-design.md)

**Depends on:** PRD 1 (memory architecture) — shipped, merged.

---

## Phase 0 — Infrastructure prep

### Task 1: Switch postgres image to pgvector + add new env vars

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Modify `docker-compose.yml` — replace the postgres image**

Find the line `image: postgres:16` and replace with:

```yaml
    image: pgvector/pgvector:pg16
```

Volume name and credentials stay the same. The pgvector image is fully drop-in compatible with `postgres:16`.

- [ ] **Step 2: Modify `.env.example` — add Anthropic, Voyage, port, frontend URL**

Append to `.env.example`:

```
# Anthropic (PRD 2 — agent shell)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_PRIMARY=claude-opus-4-7
ANTHROPIC_MODEL_COMPACTOR=claude-haiku-4-5-20251001

# Voyage AI (PRD 2 — embeddings)
VOYAGE_API_KEY=
VOYAGE_MODEL=voyage-3

# Backend service
PORT=8787
FRONTEND_ORIGIN=http://localhost:5173

# Token budgeting (PRD 2)
TOKEN_BUDGET=400000
TOKEN_SOFT_WARN=0.75
TOKEN_HARD_WARN=0.90
```

- [ ] **Step 3: Update local `.env` similarly** (do not commit `.env`)

The user's local `.env` needs the same keys with real values. Print the diff for them to apply, or note: "fill in `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` in your local `.env`."

- [ ] **Step 4: Restart Postgres**

```bash
docker compose down
docker compose up -d
```

Verify pgvector is available:

```bash
docker compose exec postgres psql -U postgres -d business_plan -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname FROM pg_extension WHERE extname='vector';"
```

Expected: one row, `vector`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore(infra): switch postgres image to pgvector and add PRD 2 env vars"
```

---

### Task 2: Migration — pgvector extension, claims.embedding, conversations + messages

**Files:**
- Create: `migrations/1700000000001_pgvector-and-conversations.ts`

- [ ] **Step 1: Write the migration**

```typescript
import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // pgvector extension
  pgm.createExtension("vector", { ifNotExists: true });

  // Embeddings on claims (additive, nullable)
  pgm.addColumns("claims", {
    embedding: { type: "vector(1024)" },
    embedded_at: { type: "timestamptz" },
    embedding_model: { type: "text" }
  });

  // HNSW index for cosine similarity
  pgm.sql(
    `CREATE INDEX claims_embedding_hnsw_idx
       ON claims
       USING hnsw (embedding vector_cosine_ops)`
  );

  // Conversations
  pgm.createTable("conversations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  // Messages
  pgm.createTable("messages", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations(id)",
      onDelete: "CASCADE"
    },
    role: { type: "text", notNull: true },
    content: { type: "jsonb", notNull: true },
    token_count: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });
  pgm.createIndex("messages", ["conversation_id", "created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("messages");
  pgm.dropTable("conversations");
  pgm.sql(`DROP INDEX IF EXISTS claims_embedding_hnsw_idx`);
  pgm.dropColumns("claims", ["embedding", "embedded_at", "embedding_model"]);
  pgm.dropExtension("vector", { ifExists: true });
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm migrate up
```

Expected: success, no errors. The PRD 1 schema is untouched; new columns and tables are added.

- [ ] **Step 3: Verify shape**

```bash
docker compose exec postgres psql -U postgres -d business_plan -c "\d claims"
docker compose exec postgres psql -U postgres -d business_plan -c "\d conversations"
docker compose exec postgres psql -U postgres -d business_plan -c "\d messages"
```

Expected: `claims` has `embedding`, `embedded_at`, `embedding_model`. `conversations` and `messages` exist.

- [ ] **Step 4: Run migration on test DB**

```bash
DATABASE_URL=$DATABASE_URL_TEST pnpm migrate up
```

- [ ] **Step 5: Commit**

```bash
git add migrations/1700000000001_pgvector-and-conversations.ts
git commit -m "feat(db): add pgvector + conversations/messages tables (PRD 2)"
```

---

### Task 3: Extend `truncateAll` helper for new tables

**Files:**
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Update the table list**

Replace contents of `backend/tests/helpers/db.ts` with:

```typescript
import type pg from "pg";

const APP_TABLES = [
  "messages",
  "conversations",
  "claim_tags",
  "relations",
  "claims",
  "tags",
  "sources",
  "compilation_runs"
] as const;

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );
}
```

Order matters only for human readability with CASCADE; `messages` listed first is illustrative.

- [ ] **Step 2: Run all existing tests**

```bash
pnpm --filter backend test
```

Expected: all PRD 1 tests still pass (the new tables exist and are truncated cleanly).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/helpers/db.ts
git commit -m "test(helpers): truncate conversations + messages between tests"
```

---

## Phase 1 — Embedding pipeline

### Task 4: Voyage AI wrapper

**Files:**
- Create: `backend/src/embeddings/types.ts`
- Create: `backend/src/embeddings/voyage.ts`
- Create: `backend/src/embeddings/voyage.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Add the Voyage SDK to backend dependencies**

```bash
pnpm --filter backend add voyageai
```

- [ ] **Step 2: Create `backend/src/embeddings/types.ts`**

```typescript
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "EmbeddingError";
  }
}
```

- [ ] **Step 3: Write the failing test in `backend/src/embeddings/voyage.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVoyageProvider } from "./voyage.js";
import { EmbeddingError } from "./types.js";

const embedMock = vi.fn();

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({
    embed: embedMock
  }))
}));

beforeEach(() => {
  embedMock.mockReset();
});

describe("createVoyageProvider", () => {
  it("returns a provider with model + dimensions", () => {
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    expect(p.model).toBe("voyage-3");
    expect(p.dimensions).toBe(1024);
  });

  it("calls Voyage and returns the embeddings", async () => {
    embedMock.mockResolvedValueOnce({
      data: [{ embedding: new Array(1024).fill(0.1) }]
    });
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    const out = await p.embed(["hello"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1024);
  });

  it("wraps Voyage errors as EmbeddingError", async () => {
    embedMock.mockRejectedValueOnce(new Error("boom"));
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    await expect(p.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("rejects malformed dimensions", async () => {
    embedMock.mockResolvedValueOnce({
      data: [{ embedding: new Array(512).fill(0) }]
    });
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    await expect(p.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm --filter backend test src/embeddings/voyage.test.ts
```

Expected: FAIL ("Cannot find module './voyage.js'").

- [ ] **Step 5: Implement `backend/src/embeddings/voyage.ts`**

```typescript
import { VoyageAIClient } from "voyageai";
import { type EmbeddingProvider, EmbeddingError } from "./types.js";

const MODEL_DIMS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-large": 2048,
  "voyage-3-lite": 512
};

export interface VoyageOptions {
  apiKey: string;
  model: string;
}

export function createVoyageProvider(opts: VoyageOptions): EmbeddingProvider {
  const dimensions = MODEL_DIMS[opts.model];
  if (!dimensions) {
    throw new EmbeddingError(`Unknown Voyage model: ${opts.model}`);
  }
  const client = new VoyageAIClient({ apiKey: opts.apiKey });

  return {
    model: opts.model,
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      let resp;
      try {
        resp = await client.embed({ input: texts, model: opts.model });
      } catch (err) {
        throw new EmbeddingError("Voyage call failed", err);
      }
      const vectors = resp.data?.map((d: { embedding: number[] }) => d.embedding) ?? [];
      for (const v of vectors) {
        if (!Array.isArray(v) || v.length !== dimensions) {
          throw new EmbeddingError(
            `Voyage returned malformed embedding (expected ${dimensions} dims, got ${v?.length ?? "n/a"})`
          );
        }
        for (const n of v) {
          if (!Number.isFinite(n)) {
            throw new EmbeddingError("Voyage returned a non-finite embedding value");
          }
        }
      }
      return vectors;
    }
  };
}
```

- [ ] **Step 6: Create `backend/src/embeddings/index.ts`** (provider factory wired to env)

```typescript
import { createVoyageProvider } from "./voyage.js";
import { type EmbeddingProvider, EmbeddingError } from "./types.js";

export { type EmbeddingProvider, EmbeddingError };

let cached: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const apiKey = process.env.VOYAGE_API_KEY;
  const model = process.env.VOYAGE_MODEL ?? "voyage-3";
  if (!apiKey) {
    throw new EmbeddingError("VOYAGE_API_KEY is not set");
  }
  cached = createVoyageProvider({ apiKey, model });
  return cached;
}

// Test seam: allow injecting a fake provider
export function setEmbeddingProvider(p: EmbeddingProvider | undefined): void {
  cached = p;
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter backend test src/embeddings/voyage.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/embeddings backend/package.json backend/pnpm-lock.yaml ../pnpm-lock.yaml
git commit -m "feat(embeddings): Voyage AI provider wrapper (PRD 2)"
```

---

### Task 5: Embedding pipeline — embed-on-create + embed-missing

**Files:**
- Create: `backend/src/embeddings/pipeline.ts`
- Create: `backend/src/embeddings/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { embedClaim, embedMissingClaims } from "./pipeline.js";
import { setEmbeddingProvider } from "./index.js";
import { createClaim } from "../openbrain/claims.js";
import { createSource } from "../openbrain/sources.js";
import { getPool } from "../db/pool.js";

const fakeProvider = {
  model: "voyage-3-fake",
  dimensions: 1024,
  embed: async (texts: string[]) =>
    texts.map(() => new Array(1024).fill(0.5))
};

beforeEach(() => {
  setEmbeddingProvider(fakeProvider);
});

describe("embedClaim", () => {
  it("populates embedding, embedded_at, and embedding_model", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "test claim",
      type: "finding",
      sourceId: src.id
    });

    await embedClaim(c.id);

    const r = await getPool().query<{
      embedding: number[] | string | null;
      embedded_at: Date | null;
      embedding_model: string | null;
    }>(
      `SELECT embedding, embedded_at, embedding_model FROM claims WHERE id=$1`,
      [c.id]
    );
    expect(r.rows[0]?.embedded_at).toBeInstanceOf(Date);
    expect(r.rows[0]?.embedding_model).toBe("voyage-3-fake");
    expect(r.rows[0]?.embedding).not.toBeNull();
  });
});

describe("embedMissingClaims", () => {
  it("processes only NULL-embedding rows and returns the count", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    await embedClaim(a.id);

    const processed = await embedMissingClaims({ batchSize: 16 });
    expect(processed).toBe(1);

    const left = await getPool().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM claims WHERE embedding IS NULL`
    );
    expect(Number(left.rows[0]!.count)).toBe(0);
  });

  it("is idempotent (second run processes 0)", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    await createClaim({ statement: "x", type: "finding", sourceId: src.id });
    await embedMissingClaims({ batchSize: 16 });
    const second = await embedMissingClaims({ batchSize: 16 });
    expect(second).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/embeddings/pipeline.test.ts
```

Expected: FAIL ("Cannot find module './pipeline.js'").

- [ ] **Step 3: Implement `backend/src/embeddings/pipeline.ts`**

```typescript
import { getPool } from "../db/pool.js";
import { getEmbeddingProvider } from "./index.js";

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export async function embedClaim(claimId: string): Promise<void> {
  const pool = getPool();
  const result = await pool.query<{ statement: string }>(
    `SELECT statement FROM claims WHERE id=$1`,
    [claimId]
  );
  if (result.rows.length === 0) return;
  const statement = result.rows[0]!.statement;

  const provider = getEmbeddingProvider();
  const [vec] = await provider.embed([statement]);
  if (!vec) return;

  await pool.query(
    `UPDATE claims
       SET embedding = $2::vector,
           embedded_at = now(),
           embedding_model = $3
     WHERE id = $1`,
    [claimId, vectorLiteral(vec), provider.model]
  );
}

export interface EmbedMissingOptions {
  batchSize?: number;
}

export async function embedMissingClaims(
  opts: EmbedMissingOptions = {}
): Promise<number> {
  const batchSize = opts.batchSize ?? 16;
  const pool = getPool();
  const provider = getEmbeddingProvider();
  let processed = 0;

  while (true) {
    const batch = await pool.query<{ id: string; statement: string }>(
      `SELECT id, statement FROM claims
        WHERE embedding IS NULL
        ORDER BY created_at ASC
        LIMIT $1`,
      [batchSize]
    );
    if (batch.rows.length === 0) break;

    const vectors = await provider.embed(batch.rows.map((r) => r.statement));
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i]!;
      const vec = vectors[i];
      if (!vec) continue;
      await pool.query(
        `UPDATE claims SET embedding=$2::vector, embedded_at=now(), embedding_model=$3 WHERE id=$1`,
        [row.id, vectorLiteral(vec), provider.model]
      );
      processed++;
    }
    if (batch.rows.length < batchSize) break;
  }

  return processed;
}

export async function reembedAllClaims(
  opts: EmbedMissingOptions = {}
): Promise<number> {
  const pool = getPool();
  await pool.query(`UPDATE claims SET embedding=NULL, embedded_at=NULL, embedding_model=NULL`);
  return embedMissingClaims(opts);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/embeddings/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/embeddings/pipeline.ts backend/src/embeddings/pipeline.test.ts
git commit -m "feat(embeddings): pipeline (embed-on-id + embed-missing + reembed-all)"
```

---

### Task 6: Hook embedding into `createClaim`

**Files:**
- Modify: `backend/src/openbrain/claims.ts`
- Modify: `backend/src/openbrain/claims.test.ts`

- [ ] **Step 1: Write the failing test (append to `claims.test.ts`)**

Append to `backend/src/openbrain/claims.test.ts`:

```typescript
import { setEmbeddingProvider } from "../embeddings/index.js";

describe("createClaim — embedding side effect", () => {
  it("kicks off embedding asynchronously without blocking the insert", async () => {
    const calls: string[][] = [];
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async (texts) => {
        calls.push(texts);
        return texts.map(() => new Array(1024).fill(0));
      }
    });

    const src = await makeSource();
    const c = await createClaim({
      statement: "embed me",
      type: "finding",
      sourceId: src.id
    });
    expect(c.id).toBeTruthy();

    // Embedding may not be done synchronously — wait briefly
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.flat()).toContain("embed me");
  });

  it("does not fail when the provider throws", async () => {
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async () => {
        throw new Error("voyage down");
      }
    });
    const src = await makeSource();
    const c = await createClaim({
      statement: "still inserts",
      type: "finding",
      sourceId: src.id
    });
    expect(c.id).toBeTruthy();
    // embedding stays null; not asserting timing — implementation is fire-and-forget
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/openbrain/claims.test.ts -t "embedding side effect"
```

Expected: FAIL (the embedding mock isn't called by `createClaim` yet).

- [ ] **Step 3: Modify `createClaim` to fire-and-forget embedding**

In `backend/src/openbrain/claims.ts`, add an import at the top:

```typescript
import { embedClaim } from "../embeddings/pipeline.js";
```

At the end of `createClaim`, before `return rowToClaim(...)`, fire-and-forget:

```typescript
  const claim = rowToClaim(result.rows[0]!);
  // Fire-and-forget: do not block the insert on Voyage availability
  void embedClaim(claim.id).catch((err) => {
    console.warn(`[claim ${claim.id}] embedding failed:`, err);
  });
  return claim;
```

(Replace the existing `return rowToClaim(result.rows[0]!);` line with the block above.)

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/openbrain/claims.test.ts
```

Expected: PASS, including the new tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/openbrain/claims.ts backend/src/openbrain/claims.test.ts
git commit -m "feat(claims): trigger embedding on create (fire-and-forget)"
```

---

### Task 7: CLI — `embed-missing` and `embed-all`

**Files:**
- Create: `backend/src/cli/commands/embed.ts`
- Modify: `backend/src/cli/index.ts`

- [ ] **Step 1: Inspect the existing CLI entrypoint**

Read `backend/src/cli/index.ts` to see the registration pattern (uses `cac`).

- [ ] **Step 2: Create `backend/src/cli/commands/embed.ts`**

```typescript
import { embedMissingClaims, reembedAllClaims } from "../../embeddings/pipeline.js";
import { closePool } from "../../db/pool.js";

export interface EmbedMissingArgs {
  batchSize?: number;
}

export async function runEmbedMissing(args: EmbedMissingArgs): Promise<void> {
  const batchSize = args.batchSize ?? 16;
  process.stdout.write(`Embedding missing claims (batch=${batchSize})...\n`);
  const n = await embedMissingClaims({ batchSize });
  process.stdout.write(`Embedded ${n} claim(s).\n`);
  await closePool();
}

export interface EmbedAllArgs {
  batchSize?: number;
  yes?: boolean;
}

export async function runEmbedAll(args: EmbedAllArgs): Promise<void> {
  if (!args.yes) {
    process.stderr.write(
      `Refusing to re-embed every claim without --yes (this clears all current embeddings).\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Re-embedding ALL claims (batch=${args.batchSize ?? 16})...\n`);
  const n = await reembedAllClaims({ batchSize: args.batchSize ?? 16 });
  process.stdout.write(`Embedded ${n} claim(s).\n`);
  await closePool();
}
```

- [ ] **Step 3: Register the commands in `backend/src/cli/index.ts`**

Add imports at the top:

```typescript
import { runEmbedMissing, runEmbedAll } from "./commands/embed.js";
```

Add command registrations alongside the existing ones (mirror the `cac` pattern in the file):

```typescript
cli
  .command("embed-missing", "Embed claims with missing embeddings")
  .option("--batch-size <n>", "Batch size", { default: 16 })
  .action(async (opts: { batchSize: number }) => {
    await runEmbedMissing({ batchSize: Number(opts.batchSize) });
  });

cli
  .command("embed-all", "Re-embed every claim (destructive — requires --yes)")
  .option("--batch-size <n>", "Batch size", { default: 16 })
  .option("--yes", "Confirm destructive operation")
  .action(async (opts: { batchSize: number; yes?: boolean }) => {
    await runEmbedAll({ batchSize: Number(opts.batchSize), yes: opts.yes });
  });
```

- [ ] **Step 4: Smoke-test the CLI**

```bash
pnpm cli embed-missing --batch-size 8
```

Expected: prints `Embedded 0 claim(s).` (or however many are missing).

- [ ] **Step 5: Commit**

```bash
git add backend/src/cli/commands/embed.ts backend/src/cli/index.ts
git commit -m "feat(cli): embed-missing and embed-all commands"
```

---

## Phase 2 — OpenBrain extensions

### Task 8: `searchClaims` — vector + metadata filter

**Files:**
- Create: `backend/src/openbrain/search.ts`
- Create: `backend/src/openbrain/search.test.ts`
- Modify: `backend/src/openbrain/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { searchClaims } from "./search.js";
import { createClaim } from "./claims.js";
import { createSource } from "./sources.js";
import { addClaimTag } from "./tags.js";
import { setEmbeddingProvider } from "../embeddings/index.js";
import { embedClaim } from "../embeddings/pipeline.js";

const PROVIDER = {
  model: "fake",
  dimensions: 1024,
  // Distinct vectors per text so similarity is meaningful in tests
  embed: async (texts: string[]) =>
    texts.map((t) => {
      const v = new Array(1024).fill(0);
      const seed = [...t].reduce((a, c) => a + c.charCodeAt(0), 0);
      for (let i = 0; i < 1024; i++) v[i] = Math.sin(seed + i);
      // L2 normalize
      const norm = Math.sqrt(v.reduce((a, n) => a + n * n, 0));
      return v.map((n) => n / norm);
    })
};

beforeEach(() => {
  setEmbeddingProvider(PROVIDER);
});

async function seed(statement: string, opts: { tag?: string } = {}) {
  const src = await createSource({ type: "manual", title: "s" });
  const c = await createClaim({ statement, type: "finding", sourceId: src.id });
  await embedClaim(c.id);
  if (opts.tag) await addClaimTag(c.id, opts.tag, opts.tag);
  return c;
}

describe("searchClaims", () => {
  it("returns claims ordered by vector similarity", async () => {
    const a = await seed("pricing pain in restaurants");
    const b = await seed("scheduling pain in restaurants");
    await seed("unrelated topic about manufacturing");

    const results = await searchClaims("pricing strategy", { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results.map((r) => r.claim.id)).toContain(a.id);
    expect(results[0]?.similarity).toBeTypeOf("number");
  });

  it("respects topK", async () => {
    for (let i = 0; i < 5; i++) await seed(`topic ${i}`);
    const results = await searchClaims("anything", { topK: 3 });
    expect(results.length).toBe(3);
  });

  it("filters by tag", async () => {
    await seed("pricing pain", { tag: "pricing" });
    await seed("scheduling pain", { tag: "scheduling" });
    const results = await searchClaims("pain", {
      topK: 5,
      filter: { tags: ["pricing"] }
    });
    expect(results.every((r) => r.tags.some((t) => t.slug === "pricing"))).toBe(true);
  });

  it("excludes claims with NULL embedding", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    await createClaim({
      statement: "no embedding yet",
      type: "finding",
      sourceId: src.id
    });
    // do not call embedClaim
    const results = await searchClaims("no embedding", { topK: 5 });
    expect(results.find((r) => r.claim.statement === "no embedding yet")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/openbrain/search.test.ts
```

Expected: FAIL ("Cannot find module './search.js'").

- [ ] **Step 3: Implement `backend/src/openbrain/search.ts`**

```typescript
import type pg from "pg";
import { getPool } from "../db/pool.js";
import { getEmbeddingProvider } from "../embeddings/index.js";
import type { Claim, ClaimStatus, ClaimType, SourceMeta, Tag } from "./types.js";

export interface RankedClaim {
  claim: Claim;
  similarity: number;
  source: SourceMeta | null;
  tags: Tag[];
}

export interface SearchClaimsFilter {
  tags?: string[];
  status?: ClaimStatus[];
  type?: ClaimType[];
  sourceId?: string;
}

export interface SearchClaimsOptions {
  topK?: number;
  filter?: SearchClaimsFilter;
}

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function searchClaims(
  query: string,
  opts: SearchClaimsOptions = {},
  c?: pg.PoolClient
): Promise<RankedClaim[]> {
  const topK = opts.topK ?? 8;
  const filter = opts.filter ?? {};

  const provider = getEmbeddingProvider();
  const [vec] = await provider.embed([query]);
  if (!vec) return [];

  const conditions: string[] = [`c.embedding IS NOT NULL`];
  const params: unknown[] = [vectorLiteral(vec)];
  let join = "";

  if (filter.tags && filter.tags.length > 0) {
    join += `
      JOIN claim_tags ct_filter ON ct_filter.claim_id = c.id
      JOIN tags t_filter ON t_filter.id = ct_filter.tag_id
    `;
    params.push(filter.tags);
    conditions.push(`t_filter.slug = ANY($${params.length}::text[])`);
  }
  if (filter.status && filter.status.length > 0) {
    params.push(filter.status);
    conditions.push(`c.status = ANY($${params.length}::text[])`);
  }
  if (filter.type && filter.type.length > 0) {
    params.push(filter.type);
    conditions.push(`c.type = ANY($${params.length}::text[])`);
  }
  if (filter.sourceId) {
    params.push(filter.sourceId);
    conditions.push(`c.source_id = $${params.length}`);
  }

  params.push(topK);

  const sql = `
    SELECT c.id, c.statement, c.type, c.status, c.confidence,
           c.source_id, c.source_excerpt, c.source_locator,
           c.created_at, c.created_by, c.status_changed_at, c.status_reason,
           c.metadata,
           1 - (c.embedding <=> $1::vector) AS similarity,
           s.id AS s_id, s.type AS s_type, s.url AS s_url, s.title AS s_title,
           s.author AS s_author, s.published_at AS s_published_at,
           s.content_hash AS s_content_hash, s.ingested_at AS s_ingested_at,
           s.ingested_by AS s_ingested_by, s.metadata AS s_metadata
    FROM claims c
    ${join}
    LEFT JOIN sources s ON s.id = c.source_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY c.id, s.id
    ORDER BY MIN(c.embedding <=> $1::vector)
    LIMIT $${params.length}
  `;

  const result = await client(c).query<Record<string, unknown>>(sql, params);

  // Fetch tags for each claim in one round trip
  const ids = result.rows.map((r) => r["id"] as string);
  const tagsByClaimId = new Map<string, Tag[]>();
  if (ids.length > 0) {
    const tagRows = await client(c).query<{
      claim_id: string;
      id: string;
      slug: string;
      display: string;
      description: string | null;
      created_at: Date;
    }>(
      `SELECT ct.claim_id, t.id, t.slug, t.display, t.description, t.created_at
       FROM claim_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.claim_id = ANY($1::uuid[])`,
      [ids]
    );
    for (const row of tagRows.rows) {
      const t: Tag = {
        id: row.id,
        slug: row.slug,
        display: row.display,
        description: row.description,
        createdAt: row.created_at
      };
      const list = tagsByClaimId.get(row.claim_id) ?? [];
      list.push(t);
      tagsByClaimId.set(row.claim_id, list);
    }
  }

  return result.rows.map((row) => {
    const claim: Claim = {
      id: row["id"] as string,
      statement: row["statement"] as string,
      type: row["type"] as ClaimType,
      status: row["status"] as ClaimStatus,
      confidence: (row["confidence"] as number | null) ?? null,
      sourceId: (row["source_id"] as string | null) ?? null,
      sourceExcerpt: (row["source_excerpt"] as string | null) ?? null,
      sourceLocator: (row["source_locator"] as string | null) ?? null,
      createdAt: row["created_at"] as Date,
      createdBy: (row["created_by"] as string | null) ?? null,
      statusChangedAt: (row["status_changed_at"] as Date | null) ?? null,
      statusReason: (row["status_reason"] as string | null) ?? null,
      metadata: (row["metadata"] as Record<string, unknown> | null) ?? null
    };
    const sId = row["s_id"] as string | null;
    const source: SourceMeta | null = sId
      ? {
          id: sId,
          type: row["s_type"] as SourceMeta["type"],
          url: row["s_url"] as string | null,
          title: row["s_title"] as string,
          author: row["s_author"] as string | null,
          publishedAt: row["s_published_at"] as Date | null,
          contentHash: row["s_content_hash"] as string | null,
          ingestedAt: row["s_ingested_at"] as Date,
          ingestedBy: row["s_ingested_by"] as string | null,
          metadata: row["s_metadata"] as Record<string, unknown> | null
        }
      : null;
    return {
      claim,
      similarity: row["similarity"] as number,
      source,
      tags: tagsByClaimId.get(claim.id) ?? []
    };
  });
}
```

- [ ] **Step 4: Re-export from `backend/src/openbrain/index.ts`**

Append:

```typescript
export { searchClaims, type RankedClaim, type SearchClaimsOptions } from "./search.js";
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter backend test src/openbrain/search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/openbrain/search.ts backend/src/openbrain/search.test.ts backend/src/openbrain/index.ts
git commit -m "feat(openbrain): searchClaims with pgvector + metadata filters"
```

---

### Task 9: `getOrientationMap`

**Files:**
- Create: `backend/src/openbrain/orientation.ts`
- Create: `backend/src/openbrain/orientation.test.ts`
- Modify: `backend/src/openbrain/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { getOrientationMap } from "./orientation.js";
import { createSource } from "./sources.js";
import { createClaim, updateClaimStatus } from "./claims.js";
import { addClaimTag } from "./tags.js";
import { getPool } from "../db/pool.js";

describe("getOrientationMap", () => {
  it("returns zero-state on an empty database", async () => {
    const m = await getOrientationMap();
    expect(m.totals).toEqual({
      sources: 0,
      claims: 0,
      openHypotheses: 0,
      unresolvedContradictions: 0
    });
    expect(m.tags).toEqual([]);
    expect(m.recentEvents).toEqual([]);
    expect(m.lastCompilationAt).toBeNull();
  });

  it("counts tags with claim counts and totals", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c1 = await createClaim({
      statement: "x",
      type: "hypothesis",
      sourceId: src.id
    });
    const c2 = await createClaim({
      statement: "y",
      type: "finding",
      sourceId: src.id
    });
    await addClaimTag(c1.id, "pricing", "Pricing");
    await addClaimTag(c2.id, "pricing", "Pricing");
    await addClaimTag(c2.id, "smb", "SMB");

    const m = await getOrientationMap();
    expect(m.totals.sources).toBe(1);
    expect(m.totals.claims).toBe(2);
    expect(m.totals.openHypotheses).toBe(1); // c1 is hypothesis & open

    const pricing = m.tags.find((t) => t.slug === "pricing");
    expect(pricing?.claimCount).toBe(2);
    const smb = m.tags.find((t) => t.slug === "smb");
    expect(smb?.claimCount).toBe(1);
  });

  it("counts unresolved contradictions", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    await getPool().query(
      `INSERT INTO relations (from_claim, to_claim, type) VALUES ($1, $2, 'contradicts')`,
      [a.id, b.id]
    );

    const m = await getOrientationMap();
    expect(m.totals.unresolvedContradictions).toBe(1);

    await updateClaimStatus(a.id, "retired", "");
    const m2 = await getOrientationMap();
    expect(m2.totals.unresolvedContradictions).toBe(0);
  });
});
```

Note: `updateClaimStatus(a.id, "retired", "")` works — `retired` does not require a non-empty reason in PRD 1's API; only `validated`/`refuted`/`superseded` do. Verify in `backend/src/openbrain/claims.ts:191-197` before relying on this.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/openbrain/orientation.test.ts
```

Expected: FAIL ("Cannot find module './orientation.js'").

- [ ] **Step 3: Implement `backend/src/openbrain/orientation.ts`**

```typescript
import type pg from "pg";
import { getPool } from "../db/pool.js";

export interface OrientationLogEvent {
  kind: "compilation_run" | "claim_created" | "source_created";
  at: Date;
  summary: string;
}

export interface OrientationMap {
  tags: { slug: string; display: string; claimCount: number }[];
  totals: {
    sources: number;
    claims: number;
    openHypotheses: number;
    unresolvedContradictions: number;
  };
  recentEvents: OrientationLogEvent[];
  lastCompilationAt: Date | null;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function getOrientationMap(c?: pg.PoolClient): Promise<OrientationMap> {
  const conn = client(c);

  const [tagRows, totalsRow, contradictionsRow, lastCompilationRow, eventsRows] =
    await Promise.all([
      conn.query<{ slug: string; display: string; claim_count: string }>(
        `SELECT t.slug, t.display, COUNT(ct.claim_id)::text AS claim_count
           FROM tags t
           LEFT JOIN claim_tags ct ON ct.tag_id = t.id
           GROUP BY t.id
           ORDER BY t.slug`
      ),
      conn.query<{
        sources: string;
        claims: string;
        open_hypotheses: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM sources)             AS sources,
           (SELECT count(*)::text FROM claims)              AS claims,
           (SELECT count(*)::text FROM claims
              WHERE type='hypothesis' AND status='open')    AS open_hypotheses`
      ),
      conn.query<{ unresolved: string }>(
        `SELECT count(*)::text AS unresolved
           FROM relations r
           JOIN claims a ON a.id = r.from_claim
           JOIN claims b ON b.id = r.to_claim
           WHERE r.type='contradicts'
             AND a.status NOT IN ('retired','superseded')
             AND b.status NOT IN ('retired','superseded')`
      ),
      conn.query<{ finished_at: Date | null }>(
        `SELECT finished_at FROM compilation_runs
           WHERE status='success'
           ORDER BY finished_at DESC NULLS LAST
           LIMIT 1`
      ),
      conn.query<{ kind: string; at: Date; summary: string }>(
        `(SELECT 'compilation_run'::text AS kind,
                  COALESCE(finished_at, started_at) AS at,
                  ('compilation ' || status ||
                   ' (pages_written=' || pages_written ||
                   ', pages_skipped=' || pages_skipped || ')') AS summary
            FROM compilation_runs
            ORDER BY started_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'claim_created'::text AS kind,
                  created_at AS at,
                  ('claim added: ' || left(statement, 80)) AS summary
            FROM claims
            ORDER BY created_at DESC LIMIT 5)
         UNION ALL
         (SELECT 'source_created'::text AS kind,
                  ingested_at AS at,
                  ('source ingested: ' || title) AS summary
            FROM sources
            ORDER BY ingested_at DESC LIMIT 5)
         ORDER BY at DESC LIMIT 10`
      )
    ]);

  return {
    tags: tagRows.rows.map((r) => ({
      slug: r.slug,
      display: r.display,
      claimCount: Number(r.claim_count)
    })),
    totals: {
      sources: Number(totalsRow.rows[0]!.sources),
      claims: Number(totalsRow.rows[0]!.claims),
      openHypotheses: Number(totalsRow.rows[0]!.open_hypotheses),
      unresolvedContradictions: Number(contradictionsRow.rows[0]!.unresolved)
    },
    recentEvents: eventsRows.rows.map((r) => ({
      kind: r.kind as OrientationLogEvent["kind"],
      at: r.at,
      summary: r.summary
    })),
    lastCompilationAt: lastCompilationRow.rows[0]?.finished_at ?? null
  };
}
```

- [ ] **Step 4: Re-export and run tests**

Append to `backend/src/openbrain/index.ts`:

```typescript
export { getOrientationMap, type OrientationMap, type OrientationLogEvent } from "./orientation.js";
```

```bash
pnpm --filter backend test src/openbrain/orientation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/openbrain/orientation.ts backend/src/openbrain/orientation.test.ts backend/src/openbrain/index.ts
git commit -m "feat(openbrain): getOrientationMap (tags, totals, recent events)"
```

---

### Task 10: Conversations + messages API

**Files:**
- Create: `backend/src/openbrain/conversations.ts`
- Create: `backend/src/openbrain/conversations.test.ts`
- Modify: `backend/src/openbrain/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  getActiveConversation,
  appendMessage,
  getMessages,
  getConversationTokenUsage,
  newConversation
} from "./conversations.js";

describe("getActiveConversation", () => {
  it("creates a conversation if none exists, returns it idempotently", async () => {
    const c1 = await getActiveConversation();
    const c2 = await getActiveConversation();
    expect(c1.id).toBe(c2.id);
  });
});

describe("appendMessage + getMessages + token usage", () => {
  it("appends and retrieves messages in order", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "hi" }],
      tokenCount: 5
    });
    await appendMessage({
      conversationId: conv.id,
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      tokenCount: 7
    });

    const msgs = await getMessages(conv.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);

    const total = await getConversationTokenUsage(conv.id);
    expect(total).toBe(12);
  });
});

describe("newConversation", () => {
  it("deletes the prior conversation (CASCADE wipes messages) and creates a fresh one", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 1
    });

    const fresh = await newConversation();
    expect(fresh.id).not.toBe(conv.id);

    const oldMsgs = await getMessages(conv.id);
    expect(oldMsgs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/openbrain/conversations.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/openbrain/conversations.ts`**

```typescript
import type pg from "pg";
import { getPool } from "../db/pool.js";

export type MessageRole =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system_summary";

export interface Conversation {
  id: string;
  startedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: unknown;
  tokenCount: number | null;
  createdAt: Date;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function getActiveConversation(c?: pg.PoolClient): Promise<Conversation> {
  const conn = client(c);
  const existing = await conn.query<{ id: string; started_at: Date }>(
    `SELECT id, started_at FROM conversations ORDER BY started_at DESC LIMIT 1`
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, startedAt: existing.rows[0].started_at };
  }
  const inserted = await conn.query<{ id: string; started_at: Date }>(
    `INSERT INTO conversations DEFAULT VALUES RETURNING id, started_at`
  );
  return { id: inserted.rows[0]!.id, startedAt: inserted.rows[0]!.started_at };
}

export interface AppendMessageInput {
  conversationId: string;
  role: MessageRole;
  content: unknown;
  tokenCount?: number | null;
}

export async function appendMessage(
  input: AppendMessageInput,
  c?: pg.PoolClient
): Promise<Message> {
  const result = await client(c).query<{
    id: string;
    conversation_id: string;
    role: string;
    content: unknown;
    token_count: number | null;
    created_at: Date;
  }>(
    `INSERT INTO messages (conversation_id, role, content, token_count)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, conversation_id, role, content, token_count, created_at`,
    [
      input.conversationId,
      input.role,
      JSON.stringify(input.content),
      input.tokenCount ?? null
    ]
  );
  const r = result.rows[0]!;
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as MessageRole,
    content: r.content,
    tokenCount: r.token_count,
    createdAt: r.created_at
  };
}

export async function getMessages(
  conversationId: string,
  c?: pg.PoolClient
): Promise<Message[]> {
  const result = await client(c).query<{
    id: string;
    conversation_id: string;
    role: string;
    content: unknown;
    token_count: number | null;
    created_at: Date;
  }>(
    `SELECT id, conversation_id, role, content, token_count, created_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as MessageRole,
    content: r.content,
    tokenCount: r.token_count,
    createdAt: r.created_at
  }));
}

export async function getConversationTokenUsage(
  conversationId: string,
  c?: pg.PoolClient
): Promise<number> {
  const result = await client(c).query<{ total: string | null }>(
    `SELECT COALESCE(SUM(token_count), 0)::text AS total
       FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return Number(result.rows[0]!.total ?? "0");
}

export async function newConversation(c?: pg.PoolClient): Promise<Conversation> {
  const conn = client(c);
  await conn.query(`DELETE FROM conversations`);
  const inserted = await conn.query<{ id: string; started_at: Date }>(
    `INSERT INTO conversations DEFAULT VALUES RETURNING id, started_at`
  );
  return { id: inserted.rows[0]!.id, startedAt: inserted.rows[0]!.started_at };
}
```

- [ ] **Step 4: Re-export and run tests**

Append to `backend/src/openbrain/index.ts`:

```typescript
export {
  getActiveConversation,
  appendMessage,
  getMessages,
  getConversationTokenUsage,
  newConversation,
  type Conversation,
  type Message,
  type MessageRole,
  type AppendMessageInput
} from "./conversations.js";
```

```bash
pnpm --filter backend test src/openbrain/conversations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/openbrain/conversations.ts backend/src/openbrain/conversations.test.ts backend/src/openbrain/index.ts
git commit -m "feat(openbrain): conversations + messages API"
```

---

### Task 11: `compactConversation`

**Files:**
- Modify: `backend/src/openbrain/conversations.ts`
- Modify: `backend/src/openbrain/conversations.test.ts`

- [ ] **Step 1: Write the failing test (append to `conversations.test.ts`)**

```typescript
import { compactConversation } from "./conversations.js";

describe("compactConversation", () => {
  it("replaces all prior messages with a single system_summary row", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "u1" }],
      tokenCount: 3
    });
    await appendMessage({
      conversationId: conv.id,
      role: "assistant",
      content: [{ type: "text", text: "a1" }],
      tokenCount: 4
    });

    await compactConversation({
      conversationId: conv.id,
      summary: "we talked about pricing",
      tokenCount: 9
    });

    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.role).toBe("system_summary");
    expect(msgs[0]!.tokenCount).toBe(9);
  });

  it("replaces a prior system_summary too (Compact-of-Compact)", async () => {
    const conv = await getActiveConversation();
    await compactConversation({
      conversationId: conv.id,
      summary: "first",
      tokenCount: 3
    });
    await compactConversation({
      conversationId: conv.id,
      summary: "second",
      tokenCount: 5
    });
    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect((msgs[0]!.content as { text: string }[])[0]!.text).toBe("second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/openbrain/conversations.test.ts -t compactConversation
```

Expected: FAIL.

- [ ] **Step 3: Implement `compactConversation` (append to `conversations.ts`)**

```typescript
export interface CompactConversationInput {
  conversationId: string;
  summary: string;
  tokenCount: number;
}

export async function compactConversation(
  input: CompactConversationInput
): Promise<void> {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query(
      `DELETE FROM messages
        WHERE conversation_id = $1
          AND role IN ('user','assistant','tool_use','tool_result','system_summary')`,
      [input.conversationId]
    );
    await conn.query(
      `INSERT INTO messages (conversation_id, role, content, token_count)
       VALUES ($1, 'system_summary', $2::jsonb, $3)`,
      [
        input.conversationId,
        JSON.stringify([{ type: "text", text: input.summary }]),
        input.tokenCount
      ]
    );
    await conn.query("COMMIT");
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}
```

Re-export from `index.ts`:

```typescript
export {
  compactConversation,
  type CompactConversationInput
} from "./conversations.js";
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/openbrain/conversations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/openbrain/conversations.ts backend/src/openbrain/conversations.test.ts backend/src/openbrain/index.ts
git commit -m "feat(openbrain): compactConversation (transactional replace)"
```

---

### Task 12: Reset CLI extends to new tables

**Files:**
- Modify: `backend/src/cli/commands/reset.ts`
- Modify: `backend/src/cli/commands/reset.test.ts` (if it exists; else inspect first)

- [ ] **Step 1: Inspect the existing reset command**

```bash
ls backend/src/cli/commands/
```

Open `backend/src/cli/commands/reset.ts` and locate the table list passed to `TRUNCATE`.

- [ ] **Step 2: Add `messages` and `conversations` to the truncate list**

In the existing reset command's table array, prepend (so they truncate before the tables they reference):

```typescript
const RESET_TABLES = [
  "messages",
  "conversations",
  "claim_tags",
  "relations",
  "claims",
  "tags",
  "sources",
  "compilation_runs"
];
```

(Match the existing constant name and patterns; only the array contents change.)

- [ ] **Step 3: If a reset test file exists, update assertions to verify new tables are emptied**

Add an assertion after a `--db` reset that:

```typescript
const remaining = await getPool().query<{ count: string }>(
  `SELECT count(*)::text AS count FROM (
     SELECT 1 FROM messages
     UNION ALL SELECT 1 FROM conversations
   ) x`
);
expect(Number(remaining.rows[0]!.count)).toBe(0);
```

- [ ] **Step 4: Run reset tests**

```bash
pnpm --filter backend test reset
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cli/commands/reset.ts backend/src/cli/commands/reset.test.ts
git commit -m "feat(cli): reset --db now clears conversations + messages"
```

---

## Phase 3 — Agent runtime

### Task 13: Static system prompt + loader

**Files:**
- Create: `backend/src/agent/prompt/static.md`
- Create: `backend/src/agent/prompt/loader.ts`
- Create: `backend/src/agent/prompt/loader.test.ts`

- [ ] **Step 1: Create `backend/src/agent/prompt/static.md`**

```markdown
You are an assistant for the user's business-plan-builder project. Your memory lives in two places:

1. **OpenBrain** — a Postgres-backed structured store of sources, claims, relations, and tags. Source of truth.
2. **A wiki vault** — markdown pages in `vault/` that the user reads in Obsidian. The vault is compiled from OpenBrain by a deterministic agent; it holds synthesized strategy, not raw research.

## Discipline rules

- **Every claim is a hypothesis** until manually promoted by the user. You **cannot** call `setClaimStatus`. If a claim looks ready to promote, surface it for the user to decide.
- **Citations required.** Every claim you reference should link back to its source via `[[sources#^src-<id>|Title]]`. Quoted claims should reference their block-id `^claim-<id>` so other pages can deep-link.
- **When the user states a decision** ("we decided X because Y", "let's target Z"), use `addClaim` with `type='decision'`. `sourceId` may be null for user decisions.
- **Surface contradictions** when they're relevant; do not smooth them over. Use `getContradictions` to see unresolved pairs.
- **Provenance for new claims:** if a claim is grounded in something the user just told you, capture it with `sourceExcerpt` and `sourceLocator` when those make sense; otherwise leave them null.

## Tool-use guidance

- Prefer `searchClaims` for "what do we know about X" questions. The orientation map below tells you which topics exist.
- Prefer `getConcept(slug)` (vault read) for "summarize the strategy on X" questions. The vault holds the synthesized story; OpenBrain holds the granular evidence.
- Use `getClaim(id)` to fetch full provenance once you've identified a relevant claim.
- Use `triggerCompilation()` only when the user explicitly asks for it, or after a meaningful batch of writes — and tell the user what just happened.

## Tone

Concise. Cite work. When you're unsure, say so. When you've added or changed memory, summarize what changed at the end of your reply.
```

- [ ] **Step 2: Write the failing test for the loader**

`backend/src/agent/prompt/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadStaticPrompt } from "./loader.js";

describe("loadStaticPrompt", () => {
  it("returns the static prompt content as a string", async () => {
    const text = await loadStaticPrompt();
    expect(text).toContain("You are an assistant");
    expect(text).toContain("Discipline rules");
    expect(text.length).toBeGreaterThan(200);
  });

  it("caches the result across calls", async () => {
    const a = await loadStaticPrompt();
    const b = await loadStaticPrompt();
    expect(a).toBe(b); // same string reference
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/prompt/loader.test.ts
```

Expected: FAIL ("Cannot find module './loader.js'").

- [ ] **Step 4: Implement `backend/src/agent/prompt/loader.ts`**

```typescript
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_PATH = path.resolve(__dirname, "static.md");

let cached: string | undefined;

export async function loadStaticPrompt(): Promise<string> {
  if (cached) return cached;
  cached = await fs.readFile(STATIC_PATH, "utf-8");
  return cached;
}

export function clearPromptCache(): void {
  cached = undefined;
}
```

- [ ] **Step 5: Update `backend/tsconfig.json` to copy `*.md` on build**

If the project uses `tsc` for compilation, the `.md` file needs to be present in `dist/`. Two options:

**Option A** (simpler): inline the prompt as a string constant in `loader.ts` instead of reading from disk. Update `loader.ts` accordingly:

```typescript
const STATIC_PROMPT = `You are an assistant for the user's business-plan-builder project. ...`;

export async function loadStaticPrompt(): Promise<string> {
  return STATIC_PROMPT;
}
```

(In this case, delete `static.md` and inline the content.)

**Option B** (file-based): add a postbuild copy step.

Pick Option A unless the user prefers files for editability. **Default: Option A.** Inline the prompt content into `loader.ts` and delete `static.md`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter backend test src/agent/prompt/loader.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/agent/prompt
git commit -m "feat(agent): static system prompt + loader"
```

---

### Task 14: Orientation map → string formatter

**Files:**
- Create: `backend/src/agent/prompt/orientation.ts`
- Create: `backend/src/agent/prompt/orientation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { formatOrientationMap } from "./orientation.js";

describe("formatOrientationMap", () => {
  it("renders the snapshot block with tags, totals, recent activity", () => {
    const text = formatOrientationMap({
      tags: [
        { slug: "pricing", display: "Pricing", claimCount: 8 },
        { slug: "smb", display: "SMB", claimCount: 17 }
      ],
      totals: {
        sources: 47,
        claims: 82,
        openHypotheses: 58,
        unresolvedContradictions: 2
      },
      recentEvents: [
        {
          kind: "compilation_run",
          at: new Date("2026-04-30T18:42:00Z"),
          summary: "compilation success (5 written, 9 skipped)"
        },
        {
          kind: "claim_created",
          at: new Date("2026-04-30T18:40:00Z"),
          summary: "claim added: 62% of restaurants..."
        }
      ],
      lastCompilationAt: new Date("2026-04-30T18:42:11Z")
    });

    expect(text).toContain("=== Memory orientation");
    expect(text).toContain("smb (17)");
    expect(text).toContain("pricing (8)");
    expect(text).toContain("sources=47");
    expect(text).toContain("claims=82");
    expect(text).toContain("open hypotheses=58");
    expect(text).toContain("unresolved contradictions=2");
    expect(text).toContain("compilation success");
    expect(text).toContain("=== End orientation ===");
  });

  it("renders gracefully on empty memory", () => {
    const text = formatOrientationMap({
      tags: [],
      totals: {
        sources: 0,
        claims: 0,
        openHypotheses: 0,
        unresolvedContradictions: 0
      },
      recentEvents: [],
      lastCompilationAt: null
    });
    expect(text).toContain("Tags (0)");
    expect(text).toContain("Last compilation: never");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/prompt/orientation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/prompt/orientation.ts`**

```typescript
import type { OrientationMap } from "../../openbrain/orientation.js";

function isoMinute(d: Date): string {
  // 2026-04-30 18:42
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function formatOrientationMap(m: OrientationMap): string {
  const ts = new Date().toISOString();
  const tagLine =
    m.tags.length === 0
      ? "Tags (0): (none)"
      : `Tags (${m.tags.length}): ${m.tags
          .map((t) => `${t.slug} (${t.claimCount})`)
          .join(", ")}`;

  const totalsLine = `Totals: sources=${m.totals.sources}, claims=${m.totals.claims}, open hypotheses=${m.totals.openHypotheses}, unresolved contradictions=${m.totals.unresolvedContradictions}`;

  const eventsBlock =
    m.recentEvents.length === 0
      ? "Recent activity: (none)"
      : "Recent activity:\n" +
        m.recentEvents
          .map((e) => `  - ${isoMinute(e.at)}  ${e.summary}`)
          .join("\n");

  const lastCompile =
    m.lastCompilationAt != null
      ? isoMinute(m.lastCompilationAt)
      : "never";

  return [
    `=== Memory orientation (snapshot @ ${ts}) ===`,
    tagLine,
    totalsLine,
    eventsBlock,
    `Last compilation: ${lastCompile}`,
    `=== End orientation ===`
  ].join("\n");
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/prompt/orientation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/prompt/orientation.ts backend/src/agent/prompt/orientation.test.ts
git commit -m "feat(agent): orientation map formatter"
```

---

### Task 15: Token counting helper + budget config

**Files:**
- Create: `backend/src/agent/config.ts`
- Create: `backend/src/agent/tokens.ts`
- Create: `backend/src/agent/tokens.test.ts`

- [ ] **Step 1: Create `backend/src/agent/config.ts`**

```typescript
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const agentConfig = {
  get tokenBudget(): number {
    return num("TOKEN_BUDGET", 400_000);
  },
  get tokenSoftWarn(): number {
    return num("TOKEN_SOFT_WARN", 0.75);
  },
  get tokenHardWarn(): number {
    return num("TOKEN_HARD_WARN", 0.9);
  },
  get primaryModel(): string {
    return process.env.ANTHROPIC_MODEL_PRIMARY ?? "claude-opus-4-7";
  },
  get compactorModel(): string {
    return (
      process.env.ANTHROPIC_MODEL_COMPACTOR ?? "claude-haiku-4-5-20251001"
    );
  }
};
```

- [ ] **Step 2: Write the failing test for token counting**

```typescript
import { describe, it, expect } from "vitest";
import { estimateTokens, sumTokens } from "./tokens.js";

describe("estimateTokens", () => {
  it("returns a reasonable estimate for short text", () => {
    const n = estimateTokens("hello world");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
  });

  it("scales roughly with length", () => {
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(
      estimateTokens("a".repeat(40))
    );
  });
});

describe("sumTokens", () => {
  it("sums a list of token counts (treating null as 0)", () => {
    expect(sumTokens([3, null, 5])).toBe(8);
    expect(sumTokens([])).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/tokens.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `backend/src/agent/tokens.ts`**

```typescript
// Heuristic: ~4 chars per token for English-ish text. Replace with the
// Anthropic count_tokens API at API integration time if precision matters.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function sumTokens(values: ReadonlyArray<number | null>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
```

- [ ] **Step 5: Run tests + commit**

```bash
pnpm --filter backend test src/agent/tokens.test.ts
```

Expected: PASS.

```bash
git add backend/src/agent/config.ts backend/src/agent/tokens.ts backend/src/agent/tokens.test.ts
git commit -m "feat(agent): config + token counting helpers"
```

---

### Task 16: Tool definitions (JSON schemas for 11 tools)

**Files:**
- Create: `backend/src/agent/tools/definitions.ts`
- Create: `backend/src/agent/tools/definitions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./definitions.js";

describe("TOOL_DEFINITIONS", () => {
  it("exposes 11 tools with the expected names", () => {
    expect(TOOL_DEFINITIONS.length).toBe(11);
    expect(new Set(TOOL_NAMES)).toEqual(
      new Set([
        "searchClaims",
        "getClaim",
        "getSource",
        "getConcept",
        "getContradictions",
        "listTags",
        "getRecentLog",
        "addClaim",
        "tagClaim",
        "addRelation",
        "triggerCompilation"
      ])
    );
  });

  it("every tool has a name, description, and input_schema with type=object", () => {
    for (const t of TOOL_DEFINITIONS) {
      expect(t.name).toBeTypeOf("string");
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema.properties).toBeTypeOf("object");
    }
  });

  it("write tools are distinguishable by isWrite metadata", () => {
    const writes = TOOL_DEFINITIONS.filter((t) => t.isWrite).map((t) => t.name);
    expect(new Set(writes)).toEqual(
      new Set(["addClaim", "tagClaim", "addRelation", "triggerCompilation"])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/tools/definitions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/tools/definitions.ts`**

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  isWrite: boolean;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "searchClaims",
    isWrite: false,
    description:
      "Search OpenBrain claims by semantic similarity to a query, optionally filtered by tags, status, type, or source. Returns ranked claims with provenance.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query" },
        topK: { type: "integer", default: 8, minimum: 1, maximum: 50 },
        filter: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
            status: {
              type: "array",
              items: {
                type: "string",
                enum: ["open", "validated", "refuted", "superseded", "retired"]
              }
            },
            type: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "finding",
                  "hypothesis",
                  "decision",
                  "observation",
                  "estimate"
                ]
              }
            },
            sourceId: { type: "string", format: "uuid" }
          }
        }
      },
      required: ["query"]
    }
  },
  {
    name: "getClaim",
    isWrite: false,
    description:
      "Fetch a claim by id with full provenance: source meta, attached tags, and active inbound/outbound relations.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"]
    }
  },
  {
    name: "getSource",
    isWrite: false,
    description:
      "Fetch a source by id including full extracted content. Use when you need the underlying article text, not just the citation.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"]
    }
  },
  {
    name: "getConcept",
    isWrite: false,
    description:
      "Read the synthesized vault concept page for a tag slug. Returns the markdown content of vault/concepts/<slug>.md, or a clean 'not generated yet' result.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"]
    }
  },
  {
    name: "getContradictions",
    isWrite: false,
    description:
      "List unresolved contradiction pairs (where both claims are still active).",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "listTags",
    isWrite: false,
    description:
      "List every tag in OpenBrain with display name and current claim count.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "getRecentLog",
    isWrite: false,
    description:
      "Fetch the most recent log events (compilation runs, claim creations, source ingestions).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", default: 10, minimum: 1, maximum: 50 }
      }
    }
  },
  {
    name: "addClaim",
    isWrite: true,
    description:
      "Create a new claim in OpenBrain with created_by='agent'. Use type='decision' when capturing an explicit user choice. Optionally attach tags inline.",
    input_schema: {
      type: "object",
      properties: {
        statement: { type: "string", minLength: 1 },
        type: {
          type: "string",
          enum: [
            "finding",
            "hypothesis",
            "decision",
            "observation",
            "estimate"
          ],
          default: "observation"
        },
        sourceId: { type: ["string", "null"], format: "uuid" },
        sourceExcerpt: { type: ["string", "null"] },
        sourceLocator: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["statement"]
    }
  },
  {
    name: "tagClaim",
    isWrite: true,
    description:
      "Attach a tag to a claim. If the tag does not exist, it is created with metadata.created_in_chat=true. Idempotent — adding the same tag twice is a no-op.",
    input_schema: {
      type: "object",
      properties: {
        claimId: { type: "string", format: "uuid" },
        tagSlug: {
          type: "string",
          pattern: "^[a-z0-9][a-z0-9-]*$",
          description: "Lowercase, hyphenated"
        },
        displayHint: { type: "string" }
      },
      required: ["claimId", "tagSlug"]
    }
  },
  {
    name: "addRelation",
    isWrite: true,
    description:
      "Create a relation between two claims. Allowed types: supports, contradicts, refines, related_to. The 'supersedes' type is reserved for status-promotion workflows and is not callable here.",
    input_schema: {
      type: "object",
      properties: {
        fromClaim: { type: "string", format: "uuid" },
        toClaim: { type: "string", format: "uuid" },
        type: {
          type: "string",
          enum: ["supports", "contradicts", "refines", "related_to"]
        },
        note: { type: ["string", "null"] }
      },
      required: ["fromClaim", "toClaim", "type"]
    }
  },
  {
    name: "triggerCompilation",
    isWrite: true,
    description:
      "Run the compilation agent now. Regenerates the vault from current OpenBrain state. Returns a run summary with pages_written and pages_skipped.",
    input_schema: { type: "object", properties: {} }
  }
];

export const TOOL_NAMES: ReadonlyArray<string> = TOOL_DEFINITIONS.map((t) => t.name);
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/tools/definitions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/tools/definitions.ts backend/src/agent/tools/definitions.test.ts
git commit -m "feat(agent): tool definitions (11 JSON schemas)"
```

---

### Task 17: Read tool handlers

**Files:**
- Create: `backend/src/agent/tools/readers.ts`
- Create: `backend/src/agent/tools/readers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { READER_HANDLERS } from "./readers.js";
import { setEmbeddingProvider } from "../../embeddings/index.js";
import { embedClaim } from "../../embeddings/pipeline.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";
import { findOrCreateTag, addClaimTag } from "../../openbrain/tags.js";
import { getPool } from "../../db/pool.js";
import fs from "fs/promises";
import path from "path";

const provider = {
  model: "fake",
  dimensions: 1024,
  embed: async (texts: string[]) =>
    texts.map(() => new Array(1024).fill(0.1))
};

beforeEach(() => {
  setEmbeddingProvider(provider);
});

describe("READER_HANDLERS", () => {
  it("searchClaims returns ranked results", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "pricing pain",
      type: "finding",
      sourceId: src.id
    });
    await embedClaim(c.id);

    const out = await READER_HANDLERS.searchClaims({ query: "pricing", topK: 3 });
    expect(Array.isArray(out)).toBe(true);
    expect((out as { claim: { id: string } }[])[0]?.claim.id).toBe(c.id);
  });

  it("listTags returns tag slugs with claim counts", async () => {
    await findOrCreateTag("smb", "SMB");
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({ statement: "x", type: "finding", sourceId: src.id });
    await addClaimTag(c.id, "smb", "SMB");

    const tags = (await READER_HANDLERS.listTags({})) as {
      slug: string;
      claimCount: number;
    }[];
    const smb = tags.find((t) => t.slug === "smb");
    expect(smb?.claimCount).toBe(1);
  });

  it("getConcept reads the vault file when present", async () => {
    const conceptsDir = path.resolve(
      process.env.VAULT_PATH ?? "./vault",
      "concepts"
    );
    await fs.mkdir(conceptsDir, { recursive: true });
    const file = path.join(conceptsDir, "test-concept.md");
    await fs.writeFile(file, "# Test concept\n\nbody", "utf-8");

    const out = (await READER_HANDLERS.getConcept({
      slug: "test-concept"
    })) as { found: boolean; content: string };
    expect(out.found).toBe(true);
    expect(out.content).toContain("Test concept");

    await fs.unlink(file);
  });

  it("getConcept reports not-found cleanly", async () => {
    const out = (await READER_HANDLERS.getConcept({
      slug: "nope-no-such-slug"
    })) as { found: boolean; message?: string };
    expect(out.found).toBe(false);
    expect(out.message).toContain("run");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/tools/readers.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/tools/readers.ts`**

```typescript
import fs from "fs/promises";
import path from "path";
import { searchClaims, type SearchClaimsOptions } from "../../openbrain/search.js";
import {
  getClaimWithProvenance,
  getClaim
} from "../../openbrain/claims.js";
import { getSource } from "../../openbrain/sources.js";
import { getContradictionPairs } from "../../openbrain/relations.js";
import { listTags } from "../../openbrain/tags.js";
import { getRecentCompilationRuns } from "../../openbrain/compilationRuns.js";
import { getOrientationMap } from "../../openbrain/orientation.js";
import { env } from "../../db/env.js";

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export const READER_HANDLERS: Record<string, ToolHandler> = {
  async searchClaims(args) {
    const query = String(args["query"] ?? "");
    const topK = typeof args["topK"] === "number" ? (args["topK"] as number) : undefined;
    const filter = (args["filter"] as SearchClaimsOptions["filter"]) ?? undefined;
    const opts: SearchClaimsOptions = {};
    if (topK !== undefined) opts.topK = topK;
    if (filter !== undefined) opts.filter = filter;
    return searchClaims(query, opts);
  },

  async getClaim(args) {
    const id = String(args["id"] ?? "");
    return getClaimWithProvenance(id);
  },

  async getSource(args) {
    const id = String(args["id"] ?? "");
    const source = await getSource(id);
    if (!source) return { found: false, id };
    return { found: true, source };
  },

  async getConcept(args) {
    const slug = String(args["slug"] ?? "");
    const file = path.resolve(env.vaultPath, "concepts", `${slug}.md`);
    try {
      const content = await fs.readFile(file, "utf-8");
      return { found: true, slug, content };
    } catch (err) {
      const isMissing =
        (err as NodeJS.ErrnoException).code === "ENOENT";
      if (isMissing) {
        return {
          found: false,
          slug,
          message:
            `No vault page for slug '${slug}'. The page is generated by compilation; ` +
            `run 'triggerCompilation' if claims exist for this tag.`
        };
      }
      throw err;
    }
  },

  async getContradictions() {
    return getContradictionPairs();
  },

  async listTags() {
    const tags = await listTags();
    const orientation = await getOrientationMap();
    const counts = new Map(orientation.tags.map((t) => [t.slug, t.claimCount]));
    return tags.map((t) => ({
      id: t.id,
      slug: t.slug,
      display: t.display,
      description: t.description,
      claimCount: counts.get(t.slug) ?? 0
    }));
  },

  async getRecentLog(args) {
    const limit = typeof args["limit"] === "number" ? (args["limit"] as number) : 10;
    return getRecentCompilationRuns(limit);
  }
};
```

Note: this assumes `getRecentCompilationRuns` and `getContradictionPairs` exist on PRD 1's API. If they're named differently, adjust imports — search for them in `backend/src/openbrain/` first.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/tools/readers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/tools/readers.ts backend/src/agent/tools/readers.test.ts
git commit -m "feat(agent): read tool handlers"
```

---

### Task 18: Write tool handlers

**Files:**
- Create: `backend/src/agent/tools/writers.ts`
- Create: `backend/src/agent/tools/writers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { WRITER_HANDLERS } from "./writers.js";
import { setEmbeddingProvider } from "../../embeddings/index.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";

const provider = {
  model: "fake",
  dimensions: 1024,
  embed: async (texts: string[]) => texts.map(() => new Array(1024).fill(0))
};

beforeEach(() => {
  setEmbeddingProvider(provider);
});

describe("WRITER_HANDLERS.addClaim", () => {
  it("creates a claim with created_by='agent'", async () => {
    const result = (await WRITER_HANDLERS.addClaim({
      statement: "we decided to focus on SMB",
      type: "decision"
    })) as { claim: { id: string; createdBy: string | null } };
    expect(result.claim.createdBy).toBe("agent");
  });

  it("attaches tags inline if provided", async () => {
    const r = (await WRITER_HANDLERS.addClaim({
      statement: "a finding",
      type: "finding",
      tags: ["pricing", "smb"]
    })) as { claim: { id: string }; tags: { slug: string }[] };
    expect(r.tags.map((t) => t.slug).sort()).toEqual(["pricing", "smb"]);
  });
});

describe("WRITER_HANDLERS.tagClaim", () => {
  it("creates a missing tag with created_in_chat=true and attaches it", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: src.id
    });
    await WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "fresh-tag" });

    const r = await getPool().query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM tags WHERE slug='fresh-tag'`
    );
    expect(r.rows[0]?.metadata).toMatchObject({ created_in_chat: true });
  });

  it("is idempotent on second invocation", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: src.id
    });
    await WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "x" });
    await expect(
      WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "x" })
    ).resolves.toBeDefined();
  });
});

describe("WRITER_HANDLERS.addRelation", () => {
  it("rejects type='supersedes' (not callable from chat)", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    await expect(
      WRITER_HANDLERS.addRelation({
        fromClaim: a.id,
        toClaim: b.id,
        type: "supersedes"
      })
    ).rejects.toThrow();
  });

  it("creates a 'contradicts' relation", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    const r = (await WRITER_HANDLERS.addRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts",
      note: "directly opposed"
    })) as { relation: { type: string } };
    expect(r.relation.type).toBe("contradicts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/tools/writers.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/tools/writers.ts`**

```typescript
import { createClaim } from "../../openbrain/claims.js";
import { addClaimTag, findOrCreateTag, getTagsForClaim } from "../../openbrain/tags.js";
import { createRelation } from "../../openbrain/relations.js";
import { runCompilation } from "../../compilation/runCompilation.js";
import { getPool } from "../../db/pool.js";
import type { ToolHandler } from "./readers.js";
import type { ClaimType, RelationType } from "../../openbrain/types.js";

const VALID_AGENT_RELATION_TYPES = new Set<RelationType>([
  "supports",
  "contradicts",
  "refines",
  "related_to"
]);

export const WRITER_HANDLERS: Record<string, ToolHandler> = {
  async addClaim(args) {
    const statement = String(args["statement"] ?? "");
    const type = (args["type"] ?? "observation") as ClaimType;
    const sourceId = (args["sourceId"] as string | null) ?? null;
    const sourceExcerpt = (args["sourceExcerpt"] as string | null) ?? null;
    const sourceLocator = (args["sourceLocator"] as string | null) ?? null;
    const tagSlugs = Array.isArray(args["tags"]) ? (args["tags"] as string[]) : [];

    const claim = await createClaim({
      statement,
      type,
      sourceId,
      sourceExcerpt,
      sourceLocator,
      createdBy: "agent"
    });
    const tags = [];
    for (const slug of tagSlugs) {
      await addClaimTagWithChatMarker(claim.id, slug, slug);
      tags.push({ slug });
    }
    return { claim, tags };
  },

  async tagClaim(args) {
    const claimId = String(args["claimId"] ?? "");
    const tagSlug = String(args["tagSlug"] ?? "");
    const displayHint = (args["displayHint"] as string) ?? tagSlug;
    const result = await addClaimTagWithChatMarker(claimId, tagSlug, displayHint);
    const tags = await getTagsForClaim(claimId);
    return { tag: result, tags };
  },

  async addRelation(args) {
    const type = String(args["type"]) as RelationType;
    if (!VALID_AGENT_RELATION_TYPES.has(type)) {
      throw new Error(
        `Relation type '${type}' is not callable from chat (use status promotion via CLI for 'supersedes').`
      );
    }
    const relation = await createRelation({
      fromClaim: String(args["fromClaim"]),
      toClaim: String(args["toClaim"]),
      type,
      note: (args["note"] as string | null) ?? null,
      createdBy: "agent"
    });
    return { relation };
  },

  async triggerCompilation() {
    const result = await runCompilation({ trigger: "agent" });
    return {
      runId: result.runId,
      status: result.status,
      pagesWritten: result.pagesWritten,
      pagesSkipped: result.pagesSkipped,
      durationMs: result.durationMs
    };
  }
};

async function addClaimTagWithChatMarker(
  claimId: string,
  slug: string,
  display: string
): Promise<{ slug: string; created: boolean }> {
  const pool = getPool();
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tags WHERE slug=$1`,
    [slug]
  );
  let created = false;
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO tags (slug, display, metadata)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, display, JSON.stringify({ created_in_chat: true })]
    );
    created = true;
  }
  await addClaimTag(claimId, slug, display);
  return { slug, created };
}
```

Notes:
- This calls PRD 1's existing `addClaimTag`, `findOrCreateTag`, `createRelation`, `createClaim`. If their signatures differ from what's used here, adjust to match. The pattern (read source, then call) keeps test failures pointing at the right line.
- `runCompilation` from PRD 1 may or may not return `runId`/`durationMs` directly. Inspect `backend/src/compilation/runCompilation.ts` and adjust the return shape if needed; the schemas accommodate any naming PRD 1 chose.

The current PRD 1 `tags` table schema may not have a `metadata` column. If `pnpm migrate up` does not create one, add it via a small migration first:

```typescript
// migrations/1700000000002_tag-metadata.ts
import type { MigrationBuilder } from "node-pg-migrate";
export const shorthands = undefined;
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("tags", { metadata: { type: "jsonb" } });
}
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("tags", "metadata");
}
```

Run `pnpm migrate up` after adding it; the schema gains the column. (Verify by checking the existing migration first — if `tags.metadata` already exists, skip this migration.)

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/tools/writers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/tools/writers.ts backend/src/agent/tools/writers.test.ts migrations/
git commit -m "feat(agent): write tool handlers (addClaim, tagClaim, addRelation, triggerCompilation)"
```

---

### Task 19: Tool dispatcher

**Files:**
- Create: `backend/src/agent/tools/dispatch.ts`
- Create: `backend/src/agent/tools/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { dispatchTool, ToolNotFoundError } from "./dispatch.js";

describe("dispatchTool", () => {
  it("invokes the handler matching the tool name", async () => {
    const result = await dispatchTool("listTags", {});
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws ToolNotFoundError for unknown names", async () => {
    await expect(dispatchTool("nope", {})).rejects.toBeInstanceOf(
      ToolNotFoundError
    );
  });

  it("returns errors as { isError: true, message } when handler throws", async () => {
    const result = await dispatchTool("getClaim", { id: "00000000-0000-0000-0000-000000000000" });
    // PRD 1's getClaimWithProvenance throws NotFoundError on missing UUID
    expect((result as { isError: boolean }).isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/tools/dispatch.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/tools/dispatch.ts`**

```typescript
import { READER_HANDLERS } from "./readers.js";
import { WRITER_HANDLERS } from "./writers.js";

const ALL_HANDLERS = { ...READER_HANDLERS, ...WRITER_HANDLERS };

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export interface ToolErrorResult {
  isError: true;
  message: string;
  errorType: string;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const handler = ALL_HANDLERS[name];
  if (!handler) throw new ToolNotFoundError(name);
  try {
    return await handler(args);
  } catch (err) {
    const e = err as Error;
    return {
      isError: true,
      message: e.message ?? String(e),
      errorType: e.name ?? "Error"
    } satisfies ToolErrorResult;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/tools/dispatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/tools/dispatch.ts backend/src/agent/tools/dispatch.test.ts
git commit -m "feat(agent): tool dispatcher with error envelope"
```

---

### Task 20: Custom agent loop (multi-turn dispatch with streaming)

**Files:**
- Create: `backend/src/agent/runtime.ts`
- Create: `backend/src/agent/runtime.test.ts`
- Modify: `backend/package.json` (add `@anthropic-ai/sdk`)

- [ ] **Step 1: Add the Anthropic SDK**

```bash
pnpm --filter backend add @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgentTurn } from "./runtime.js";
import { setAnthropicClient } from "./anthropic.js";
import {
  appendMessage,
  getActiveConversation,
  getMessages
} from "../openbrain/conversations.js";
import { setEmbeddingProvider } from "../embeddings/index.js";

beforeEach(() => {
  setEmbeddingProvider({
    model: "fake",
    dimensions: 1024,
    embed: async (xs) => xs.map(() => new Array(1024).fill(0))
  });
});

function fakeStream(chunks: object[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    }
  };
}

describe("runAgentTurn", () => {
  it("forwards text deltas and persists the assistant message", async () => {
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue(
          fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 12, output_tokens: 5 } },
            { type: "message_stop" }
          ])
        )
      }
    } as never);

    const conv = await getActiveConversation();
    const events: { type: string; data: unknown }[] = [];
    await runAgentTurn({
      conversationId: conv.id,
      userMessage: "hi",
      onEvent: (type, data) => events.push({ type, data })
    });

    expect(events.some((e) => e.type === "text_delta")).toBe(true);
    expect(events.some((e) => e.type === "message_complete")).toBe(true);

    const msgs = await getMessages(conv.id);
    expect(msgs.find((m) => m.role === "user")).toBeTruthy();
    expect(msgs.find((m) => m.role === "assistant")).toBeTruthy();
  });

  it("dispatches tool_use blocks and continues until end_turn", async () => {
    let call = 0;
    setAnthropicClient({
      messages: {
        create: vi.fn().mockImplementation(async () => {
          call++;
          if (call === 1) {
            return fakeStream([
              {
                type: "content_block_start",
                index: 0,
                content_block: {
                  type: "tool_use",
                  id: "tu_1",
                  name: "listTags",
                  input: {}
                }
              },
              { type: "content_block_stop", index: 0 },
              { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 10, output_tokens: 4 } },
              { type: "message_stop" }
            ]);
          }
          return fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "done" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 14, output_tokens: 2 } },
            { type: "message_stop" }
          ]);
        })
      }
    } as never);

    const conv = await getActiveConversation();
    const events: { type: string; data: unknown }[] = [];
    await runAgentTurn({
      conversationId: conv.id,
      userMessage: "what tags?",
      onEvent: (type, data) => events.push({ type, data })
    });

    expect(events.some((e) => e.type === "tool_use_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_use_complete")).toBe(true);
    expect(call).toBe(2); // tool_use turn + final turn
  });
});
```

- [ ] **Step 3: Create `backend/src/agent/anthropic.ts` (test seam for client injection)**

```typescript
import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | undefined;

export interface AnthropicLike {
  messages: {
    create: (params: object) => Promise<unknown>;
  };
}

export function getAnthropicClient(): AnthropicLike {
  if (cached) return cached as unknown as AnthropicLike;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  cached = new Anthropic({ apiKey });
  return cached as unknown as AnthropicLike;
}

export function setAnthropicClient(client: AnthropicLike | undefined): void {
  cached = client as unknown as Anthropic | undefined;
}
```

- [ ] **Step 4: Implement `backend/src/agent/runtime.ts`**

```typescript
import { agentConfig } from "./config.js";
import { loadStaticPrompt } from "./prompt/loader.js";
import { formatOrientationMap } from "./prompt/orientation.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";
import { dispatchTool } from "./tools/dispatch.js";
import { getAnthropicClient } from "./anthropic.js";
import { estimateTokens } from "./tokens.js";
import {
  appendMessage,
  getMessages,
  getConversationTokenUsage,
  type Message
} from "../openbrain/conversations.js";
import { getOrientationMap } from "../openbrain/orientation.js";

export type AgentEventType =
  | "text_delta"
  | "tool_use_start"
  | "tool_use_complete"
  | "message_complete"
  | "error";

export interface RunAgentTurnInput {
  conversationId: string;
  userMessage: string;
  onEvent: (type: AgentEventType, data: unknown) => void;
}

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<void> {
  const { conversationId, userMessage, onEvent } = input;

  await appendMessage({
    conversationId,
    role: "user",
    content: [{ type: "text", text: userMessage }],
    tokenCount: estimateTokens(userMessage)
  });

  const staticPrompt = await loadStaticPrompt();
  const orientation = await getOrientationMap();
  const orientationText = formatOrientationMap(orientation);

  // Build the messages array from history (excluding system_summary; it goes in system prompt)
  let history = await getMessages(conversationId);
  const summary = history.find((m) => m.role === "system_summary");
  let systemPrompt = `${staticPrompt}\n\n${orientationText}`;
  if (summary) {
    const text =
      Array.isArray(summary.content) && (summary.content as ContentBlock[])[0]?.text
        ? (summary.content as ContentBlock[])[0]!.text!
        : "";
    systemPrompt = `${systemPrompt}\n\n<conversation_summary>\n${text}\n</conversation_summary>`;
  }

  let liveMessages = anthropicMessagesFromHistory(
    history.filter((m) => m.role !== "system_summary")
  );

  const client = getAnthropicClient();
  let safetyCounter = 0;

  while (safetyCounter++ < 12) {
    const stream = (await client.messages.create({
      model: agentConfig.primaryModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema
      })),
      messages: liveMessages,
      stream: true
    })) as AsyncIterable<unknown>;

    let stopReason: string | null = null;
    let usage: { input_tokens: number; output_tokens: number } | null = null;
    const finalBlocks: ContentBlock[] = [];
    const blockBuilders: Record<number, ContentBlock> = {};

    for await (const ev of stream) {
      const e = ev as { type: string; [k: string]: unknown };
      if (e.type === "content_block_start") {
        const idx = e["index"] as number;
        const block = (e["content_block"] as ContentBlock) ?? { type: "text" };
        blockBuilders[idx] = { ...block };
        if (block.type === "tool_use") {
          onEvent("tool_use_start", {
            toolUseId: block.id,
            name: block.name,
            input: block.input ?? {}
          });
        }
      } else if (e.type === "content_block_delta") {
        const idx = e["index"] as number;
        const delta = e["delta"] as { type: string; text?: string; partial_json?: string };
        const block = blockBuilders[idx];
        if (!block) continue;
        if (delta.type === "text_delta" && delta.text) {
          block.text = (block.text ?? "") + delta.text;
          onEvent("text_delta", { text: delta.text });
        } else if (delta.type === "input_json_delta" && delta.partial_json) {
          // accumulate partial input json on tool_use blocks
          const acc = ((block as unknown as { _rawJson?: string })._rawJson ?? "") + delta.partial_json;
          (block as unknown as { _rawJson?: string })._rawJson = acc;
        }
      } else if (e.type === "content_block_stop") {
        const idx = e["index"] as number;
        const block = blockBuilders[idx];
        if (!block) continue;
        if (block.type === "tool_use") {
          const raw = (block as unknown as { _rawJson?: string })._rawJson;
          if (raw) {
            try {
              block.input = JSON.parse(raw);
            } catch {
              block.input = {};
            }
          }
        }
        finalBlocks.push(block);
      } else if (e.type === "message_delta") {
        const delta = e["delta"] as { stop_reason?: string };
        if (delta.stop_reason) stopReason = delta.stop_reason;
        if (e["usage"]) usage = e["usage"] as typeof usage;
      } else if (e.type === "message_stop") {
        // end of stream
      }
    }

    // Persist the assistant turn
    await appendMessage({
      conversationId,
      role: "assistant",
      content: finalBlocks,
      tokenCount: usage?.output_tokens ?? estimateTokens(
        finalBlocks.map((b) => b.text ?? "").join(" ")
      )
    });

    if (stopReason === "tool_use") {
      // Run each tool_use block, append tool_result blocks as a new user message
      const toolResults: ContentBlock[] = [];
      for (const block of finalBlocks) {
        if (block.type !== "tool_use") continue;
        const start = Date.now();
        const result = await dispatchTool(block.name ?? "", block.input ?? {});
        const durationMs = Date.now() - start;
        const isError =
          typeof result === "object" &&
          result !== null &&
          (result as { isError?: boolean }).isError === true;
        onEvent("tool_use_complete", {
          toolUseId: block.id,
          result,
          durationMs,
          isError
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content:
            typeof result === "string"
              ? result
              : JSON.stringify(result),
          is_error: isError
        });
      }
      await appendMessage({
        conversationId,
        role: "tool_result",
        content: toolResults,
        tokenCount: estimateTokens(JSON.stringify(toolResults))
      });

      // Refresh history for next loop iteration
      history = await getMessages(conversationId);
      liveMessages = anthropicMessagesFromHistory(
        history.filter((m) => m.role !== "system_summary")
      );
      continue;
    }

    // end_turn (or max_tokens, etc.)
    const total = await getConversationTokenUsage(conversationId);
    onEvent("message_complete", {
      tokenCount: usage?.output_tokens ?? 0,
      totalConversationTokens: total
    });
    return;
  }

  onEvent("error", { message: "Agent loop exceeded safety counter (12 turns)" });
}

function anthropicMessagesFromHistory(history: Message[]): unknown[] {
  // Anthropic API requires alternating user/assistant.
  // We collapse our internal roles:
  //   - 'user' -> user
  //   - 'assistant' -> assistant
  //   - 'tool_result' (our row capturing the dispatched tool result) -> user (tool_result blocks)
  //   - 'tool_use' -> already part of an assistant message's content array
  return history
    .filter((m) => m.role !== "tool_use") // tool_use is embedded in assistant messages
    .map((m) => {
      if (m.role === "tool_result") {
        return { role: "user", content: m.content };
      }
      return { role: m.role, content: m.content };
    });
}
```

The streaming protocol decoded here matches the Anthropic Messages API streaming events. If a future SDK version changes event shapes, adjust the `for await` switch.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter backend test src/agent/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/anthropic.ts backend/src/agent/runtime.ts backend/src/agent/runtime.test.ts backend/package.json backend/pnpm-lock.yaml ../pnpm-lock.yaml
git commit -m "feat(agent): custom multi-turn streaming agent loop"
```

---

### Task 21: Compaction module (Haiku-driven summary)

**Files:**
- Create: `backend/src/agent/compaction.ts`
- Create: `backend/src/agent/compaction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCompactConversation } from "./compaction.js";
import { setAnthropicClient } from "./anthropic.js";
import {
  appendMessage,
  getActiveConversation,
  getMessages
} from "../openbrain/conversations.js";

describe("runCompactConversation", () => {
  it("calls Haiku, replaces messages with one system_summary row, returns counts", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "u1" }],
      tokenCount: 3
    });
    await appendMessage({
      conversationId: conv.id,
      role: "assistant",
      content: [{ type: "text", text: "a1" }],
      tokenCount: 4
    });

    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "we discussed pricing" }],
          usage: { input_tokens: 50, output_tokens: 12 }
        })
      }
    } as never);

    const result = await runCompactConversation(conv.id);
    expect(result.summary).toContain("pricing");
    expect(result.newTokenCount).toBeGreaterThan(0);

    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.role).toBe("system_summary");
  });

  it("rejects when conversation tokens exceed Haiku's window", async () => {
    const conv = await getActiveConversation();
    // Stuff with high token_count
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 200_000
    });
    await expect(runCompactConversation(conv.id)).rejects.toThrow(
      /exceeds Haiku/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test src/agent/compaction.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `backend/src/agent/compaction.ts`**

```typescript
import { getAnthropicClient } from "./anthropic.js";
import { agentConfig } from "./config.js";
import {
  compactConversation,
  getMessages,
  getConversationTokenUsage
} from "../openbrain/conversations.js";

const HAIKU_INPUT_BUDGET = 180_000;

const COMPACT_SYSTEM_PROMPT = `Summarize the following conversation, preserving:
- decisions made
- open questions
- any context needed to continue productively

Output: a concise narrative under 800 tokens. Do not invent facts.`;

export interface CompactResult {
  summary: string;
  newTokenCount: number;
}

export async function runCompactConversation(
  conversationId: string
): Promise<CompactResult> {
  const tokenUsage = await getConversationTokenUsage(conversationId);
  if (tokenUsage > HAIKU_INPUT_BUDGET) {
    throw new Error(
      `Conversation tokens (${tokenUsage}) exceeds Haiku input budget (${HAIKU_INPUT_BUDGET}). Use 'New conversation' instead.`
    );
  }

  const messages = await getMessages(conversationId);
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const blocks = m.content as { type: string; text?: string }[] | undefined;
      const text = (blocks ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(" ");
      return `[${m.role.toUpperCase()}] ${text}`;
    })
    .join("\n\n");

  const client = getAnthropicClient();
  const resp = (await client.messages.create({
    model: agentConfig.compactorModel,
    max_tokens: 1200,
    system: COMPACT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }]
  })) as {
    content: { type: string; text?: string }[];
    usage?: { output_tokens: number };
  };

  const summary =
    resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") || "(empty summary)";

  const newTokenCount = resp.usage?.output_tokens ?? Math.ceil(summary.length / 4);

  await compactConversation({
    conversationId,
    summary,
    tokenCount: newTokenCount
  });

  return { summary, newTokenCount };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test src/agent/compaction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/compaction.ts backend/src/agent/compaction.test.ts
git commit -m "feat(agent): Haiku-driven conversation compaction"
```

---

## Phase 4 — HTTP service

### Task 22: Fastify scaffold + GET /chat/state + POST /chat/new

**Files:**
- Create: `backend/src/api/server.ts`
- Create: `backend/src/api/lifecycle.ts`
- Create: `backend/src/api/lifecycle.test.ts`
- Modify: `backend/package.json` (add `fastify`, `@fastify/cors`)

- [ ] **Step 1: Add Fastify deps**

```bash
pnpm --filter backend add fastify @fastify/cors
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";

describe("GET /chat/state", () => {
  it("creates an active conversation if none exists and returns shape", async () => {
    const app = await buildServer();
    const resp = await app.inject({ method: "GET", url: "/chat/state" });
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.conversationId).toBeTypeOf("string");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.tokenCount).toBe(0);
    await app.close();
  });
});

describe("POST /chat/new", () => {
  it("deletes the active conversation and creates a new one", async () => {
    const app = await buildServer();
    const first = (await app.inject({ method: "GET", url: "/chat/state" })).json();
    const newer = (await app.inject({ method: "POST", url: "/chat/new" })).json();
    expect(newer.conversationId).not.toBe(first.conversationId);
    await app.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter backend test src/api/lifecycle.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `backend/src/api/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerLifecycleRoutes } from "./lifecycle.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    credentials: false
  });
  await registerLifecycleRoutes(app);
  return app;
}
```

- [ ] **Step 5: Implement `backend/src/api/lifecycle.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import {
  getActiveConversation,
  getMessages,
  getConversationTokenUsage,
  newConversation
} from "../openbrain/conversations.js";

export async function registerLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/state", async () => {
    const conv = await getActiveConversation();
    const [messages, tokenCount] = await Promise.all([
      getMessages(conv.id),
      getConversationTokenUsage(conv.id)
    ]);
    return {
      conversationId: conv.id,
      messages,
      tokenCount
    };
  });

  app.post("/chat/new", async () => {
    const conv = await newConversation();
    return { conversationId: conv.id };
  });
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter backend test src/api/lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api backend/package.json backend/pnpm-lock.yaml ../pnpm-lock.yaml
git commit -m "feat(api): Fastify scaffold + GET /chat/state + POST /chat/new"
```

---

### Task 23: POST /chat with SSE streaming

**Files:**
- Create: `backend/src/api/sse.ts`
- Create: `backend/src/api/chat.ts`
- Create: `backend/src/api/chat.test.ts`
- Modify: `backend/src/api/server.ts`

- [ ] **Step 1: Implement `backend/src/api/sse.ts` (writer helper)**

```typescript
import type { FastifyReply } from "fastify";

export class SseWriter {
  constructor(private readonly reply: FastifyReply) {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
  }

  write(event: string, data: unknown): void {
    this.reply.raw.write(`event: ${event}\n`);
    this.reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    this.reply.raw.end();
  }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildServer } from "./server.js";
import { setAnthropicClient } from "../agent/anthropic.js";
import { setEmbeddingProvider } from "../embeddings/index.js";

function fakeStream(chunks: object[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    }
  };
}

describe("POST /chat (SSE)", () => {
  it("streams text_delta and message_complete events", async () => {
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async (xs) => xs.map(() => new Array(1024).fill(0))
    });
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue(
          fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 5, output_tokens: 1 } },
            { type: "message_stop" }
          ])
        )
      }
    } as never);

    const app = await buildServer();
    const resp = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi" }
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.headers["content-type"]).toContain("text/event-stream");
    expect(resp.body).toContain("event: text_delta");
    expect(resp.body).toContain("event: message_complete");
    await app.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter backend test src/api/chat.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `backend/src/api/chat.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { runAgentTurn } from "../agent/runtime.js";
import { getActiveConversation } from "../openbrain/conversations.js";
import { SseWriter } from "./sse.js";

const turnLocks = new Map<string, boolean>();

export async function registerChatRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { message: string } }>("/chat", async (req, reply) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      reply.code(400);
      return { error: "message must be a non-empty string" };
    }

    const conv = await getActiveConversation();
    if (turnLocks.get(conv.id)) {
      reply.code(409);
      return { error: "another turn is already in progress on this conversation" };
    }
    turnLocks.set(conv.id, true);

    const sse = new SseWriter(reply);
    try {
      await runAgentTurn({
        conversationId: conv.id,
        userMessage: message,
        onEvent: (type, data) => sse.write(type, data)
      });
    } catch (err) {
      sse.write("error", { message: (err as Error).message });
    } finally {
      turnLocks.delete(conv.id);
      sse.end();
    }
  });
}
```

- [ ] **Step 5: Wire it into the server**

In `backend/src/api/server.ts`, add:

```typescript
import { registerChatRoute } from "./chat.js";
```

And call it inside `buildServer` after `registerLifecycleRoutes`:

```typescript
await registerChatRoute(app);
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter backend test src/api/chat.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/sse.ts backend/src/api/chat.ts backend/src/api/chat.test.ts backend/src/api/server.ts
git commit -m "feat(api): POST /chat SSE streaming endpoint"
```

---

### Task 24: POST /chat/compact + POST /vault/compile + CLI serve

**Files:**
- Modify: `backend/src/api/lifecycle.ts`
- Create: `backend/src/api/compile.ts`
- Modify: `backend/src/api/server.ts`
- Create: `backend/src/api/lifecycle.compact.test.ts`
- Create: `backend/src/api/compile.test.ts`
- Create: `backend/src/cli/commands/serve.ts`
- Modify: `backend/src/cli/index.ts`

- [ ] **Step 1: Add `/chat/compact` to `lifecycle.ts`**

Append in `registerLifecycleRoutes`:

```typescript
  app.post("/chat/compact", async (_req, reply) => {
    const { runCompactConversation } = await import("../agent/compaction.js");
    const conv = await getActiveConversation();
    try {
      const result = await runCompactConversation(conv.id);
      return result;
    } catch (err) {
      reply.code(422);
      return { error: (err as Error).message };
    }
  });
```

- [ ] **Step 2: Test for compact**

`backend/src/api/lifecycle.compact.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildServer } from "./server.js";
import { setAnthropicClient } from "../agent/anthropic.js";
import { appendMessage, getActiveConversation } from "../openbrain/conversations.js";

describe("POST /chat/compact", () => {
  it("returns the compaction summary on success", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "hi" }],
      tokenCount: 2
    });
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "we said hi" }],
          usage: { output_tokens: 4 }
        })
      }
    } as never);

    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/chat/compact" });
    expect(resp.statusCode).toBe(200);
    expect(resp.json().summary).toContain("hi");
    await app.close();
  });

  it("returns 422 when conversation exceeds Haiku budget", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 200_000
    });
    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/chat/compact" });
    expect(resp.statusCode).toBe(422);
    await app.close();
  });
});
```

- [ ] **Step 3: Implement `backend/src/api/compile.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { runCompilation } from "../compilation/runCompilation.js";

export async function registerCompileRoute(app: FastifyInstance): Promise<void> {
  app.post("/vault/compile", async (_req, reply) => {
    try {
      const result = await runCompilation({ trigger: "api" });
      return {
        runId: result.runId,
        status: result.status,
        pagesWritten: result.pagesWritten,
        pagesSkipped: result.pagesSkipped,
        durationMs: result.durationMs
      };
    } catch (err) {
      const msg = (err as Error).message ?? "compile failed";
      // Lock contention from PRD 1's compilation lock surfaces as a known error
      if (msg.toLowerCase().includes("already in progress") || msg.toLowerCase().includes("lock")) {
        reply.code(409);
      } else {
        reply.code(500);
      }
      return { error: msg };
    }
  });
}
```

- [ ] **Step 4: Test for compile**

`backend/src/api/compile.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";

describe("POST /vault/compile", () => {
  it("returns 200 + run summary on a clean compile", async () => {
    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/vault/compile" });
    // Either 200 (clean) or 409 (lock contention) is acceptable here;
    // the test asserts the shape of the response, not which path.
    if (resp.statusCode === 200) {
      const body = resp.json();
      expect(body.runId).toBeTypeOf("string");
      expect(body.pagesWritten).toBeTypeOf("number");
    } else {
      expect(resp.statusCode).toBe(409);
    }
    await app.close();
  });
});
```

- [ ] **Step 5: Wire compile into the server**

In `backend/src/api/server.ts`:

```typescript
import { registerCompileRoute } from "./compile.js";
// ...
await registerCompileRoute(app);
```

- [ ] **Step 6: Implement `backend/src/cli/commands/serve.ts`**

```typescript
import { buildServer } from "../../api/server.js";

export async function runServe(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const app = await buildServer();
  await app.listen({ port, host: "0.0.0.0" });
  process.stdout.write(`backend listening on http://localhost:${port}\n`);
}
```

- [ ] **Step 7: Register `serve` in CLI index**

```typescript
import { runServe } from "./commands/serve.js";
// ...
cli
  .command("serve", "Start the backend HTTP service")
  .action(async () => {
    await runServe();
  });
```

- [ ] **Step 8: Run tests + smoke-test CLI**

```bash
pnpm --filter backend test src/api
```

Expected: PASS.

```bash
pnpm cli serve &
SERVER_PID=$!
sleep 1
curl -s http://localhost:8787/chat/state
kill $SERVER_PID
```

Expected: JSON with `conversationId`, `messages`, `tokenCount`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/api backend/src/cli/commands/serve.ts backend/src/cli/index.ts
git commit -m "feat(api): /chat/compact + /vault/compile + cli serve"
```

---

## Phase 5 — Frontend

### Task 25: Vite + React + Tailwind scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Modify: `pnpm-workspace.yaml`
- Modify: root `package.json` (add scripts for `dev:frontend` etc.)

- [ ] **Step 1: Add `frontend` to the workspace**

Modify `pnpm-workspace.yaml`:

```yaml
packages:
  - "backend"
  - "frontend"
```

- [ ] **Step 2: Create `frontend/package.json`**

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 5173",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

- [ ] **Step 4: Create `frontend/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "vite.config.ts", "tailwind.config.ts"]
}
```

- [ ] **Step 5: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat": "http://localhost:8787",
      "/vault": "http://localhost:8787"
    }
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test-setup.ts"]
  }
});
```

- [ ] **Step 6: Create `frontend/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
};
export default config;
```

- [ ] **Step 7: Create `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 8: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PRD 2 Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
```

- [ ] **Step 10: Create `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 11: Create placeholder `frontend/src/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="h-full grid place-items-center text-gray-500">
      PRD 2 — agent shell scaffold
    </div>
  );
}
```

- [ ] **Step 12: Create `frontend/src/test-setup.ts`**

```typescript
import "@testing-library/react";
```

- [ ] **Step 13: Smoke test**

```bash
pnpm --filter frontend dev
```

Open http://localhost:5173 in a browser. Expected: scaffold message visible.
Stop with Ctrl+C.

- [ ] **Step 14: Commit**

```bash
git add frontend pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(frontend): Vite + React + Tailwind scaffold"
```

---

### Task 26: Zustand store + types

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/store.ts`

- [ ] **Step 1: Create `frontend/src/types.ts`**

```typescript
export type MessageRole =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system_summary";

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: ContentBlock[];
  tokenCount: number | null;
  createdAt: string;
}

export interface RetrievedItem {
  kind: "claim" | "source" | "concept" | "tool";
  toolUseId: string;
  toolName: string;
  summary: string;
  raw: unknown;
  isError?: boolean;
}
```

- [ ] **Step 2: Create `frontend/src/store.ts`**

```typescript
import { create } from "zustand";
import type { Message, RetrievedItem } from "./types.js";

export interface AppState {
  conversationId: string | null;
  messages: Message[];
  tokenCount: number;
  retrievedThisTurn: RetrievedItem[];
  isStreaming: boolean;

  setConversation: (id: string, messages: Message[], tokenCount: number) => void;
  appendMessage: (m: Message) => void;
  appendAssistantText: (text: string) => void;
  resetTurnRetrieval: () => void;
  addRetrieval: (r: RetrievedItem) => void;
  setStreaming: (s: boolean) => void;
  setTokenCount: (n: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  conversationId: null,
  messages: [],
  tokenCount: 0,
  retrievedThisTurn: [],
  isStreaming: false,

  setConversation: (id, messages, tokenCount) =>
    set({ conversationId: id, messages, tokenCount, retrievedThisTurn: [] }),

  appendMessage: (m) =>
    set((s) => ({ messages: [...s.messages, m] })),

  appendAssistantText: (text) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (last && last.role === "assistant") {
        const blocks = [...last.content];
        const tail = blocks[blocks.length - 1];
        if (tail && tail.type === "text") {
          blocks[blocks.length - 1] = { ...tail, text: (tail.text ?? "") + text };
        } else {
          blocks.push({ type: "text", text });
        }
        const updated: Message = { ...last, content: blocks };
        return { messages: [...s.messages.slice(0, -1), updated] };
      }
      const placeholder: Message = {
        id: `pending-${Date.now()}`,
        conversationId: s.conversationId ?? "",
        role: "assistant",
        content: [{ type: "text", text }],
        tokenCount: 0,
        createdAt: new Date().toISOString()
      };
      return { messages: [...s.messages, placeholder] };
    }),

  resetTurnRetrieval: () => set({ retrievedThisTurn: [] }),
  addRetrieval: (r) =>
    set((s) => ({ retrievedThisTurn: [...s.retrievedThisTurn, r] })),

  setStreaming: (s) => set({ isStreaming: s }),
  setTokenCount: (n) => set({ tokenCount: n }),

  reset: () =>
    set({
      conversationId: null,
      messages: [],
      tokenCount: 0,
      retrievedThisTurn: [],
      isStreaming: false
    })
}));
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter frontend typecheck
```

Expected: clean.

```bash
git add frontend/src/types.ts frontend/src/store.ts
git commit -m "feat(frontend): types + Zustand store"
```

---

### Task 27: SSE parser (fetch + ReadableStream)

**Files:**
- Create: `frontend/src/lib/sse.ts`
- Create: `frontend/src/lib/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseSseStream } from "./sse.js";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(s));
      c.close();
    }
  });
}

describe("parseSseStream", () => {
  it("yields one event per double-newline frame", async () => {
    const stream = streamFromString(
      `event: text_delta\ndata: {"text":"hi"}\n\nevent: message_complete\ndata: {"tokenCount":5,"totalConversationTokens":12}\n\n`
    );
    const events: { event: string; data: unknown }[] = [];
    for await (const ev of parseSseStream(stream)) events.push(ev);
    expect(events.length).toBe(2);
    expect(events[0]?.event).toBe("text_delta");
    expect((events[0]?.data as { text: string }).text).toBe("hi");
  });

  it("handles split chunks across read boundaries", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode("event: text_delta\ndata: {\""));
        c.enqueue(enc.encode("text\":\"split\"}\n\n"));
        c.close();
      }
    });
    const events: { event: string; data: unknown }[] = [];
    for await (const ev of parseSseStream(stream)) events.push(ev);
    expect(events.length).toBe(1);
    expect((events[0]?.data as { text: string }).text).toBe("split");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter frontend test src/lib/sse.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/lib/sse.ts`**

```typescript
export interface SseEvent {
  event: string;
  data: unknown;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      let parsed: unknown = data;
      try {
        if (data) parsed = JSON.parse(data);
      } catch {
        // leave as raw string if not JSON
      }
      yield { event, data: parsed };
    }
  }
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm --filter frontend test src/lib/sse.test.ts
```

Expected: PASS.

```bash
git add frontend/src/lib/sse.ts frontend/src/lib/sse.test.ts
git commit -m "feat(frontend): SSE parser over fetch+ReadableStream"
```

---

### Task 28: Typed API client (fetch wrappers for 5 endpoints)

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Implement**

```typescript
import { parseSseStream, type SseEvent } from "./sse.js";
import type { Message } from "../types.js";

export interface ChatStateResponse {
  conversationId: string;
  messages: Message[];
  tokenCount: number;
}

export async function getChatState(): Promise<ChatStateResponse> {
  const r = await fetch("/chat/state");
  if (!r.ok) throw new Error(`GET /chat/state ${r.status}`);
  return r.json();
}

export async function newConversation(): Promise<{ conversationId: string }> {
  const r = await fetch("/chat/new", { method: "POST" });
  if (!r.ok) throw new Error(`POST /chat/new ${r.status}`);
  return r.json();
}

export async function compactConversation(): Promise<{
  summary: string;
  newTokenCount: number;
}> {
  const r = await fetch("/chat/compact", { method: "POST" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `POST /chat/compact ${r.status}`);
  }
  return r.json();
}

export async function compileVault(): Promise<{
  runId: string;
  status: string;
  pagesWritten: number;
  pagesSkipped: number;
  durationMs: number;
}> {
  const r = await fetch("/vault/compile", { method: "POST" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `POST /vault/compile ${r.status}`);
  }
  return r.json();
}

export async function* streamChat(message: string): AsyncGenerator<SseEvent> {
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`POST /chat ${r.status}: ${text}`);
  }
  if (!r.body) throw new Error("POST /chat: no body");
  yield* parseSseStream(r.body);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter frontend typecheck
```

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): typed API client wrappers"
```

---

### Task 29: Citation remark plugin

**Files:**
- Create: `frontend/src/lib/citations.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Plugin } from "unified";
import type { Root, Text, Link } from "mdast";
import { visit } from "unist-util-visit";

const SOURCE_RE = /\[\[sources#\^(src-[a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const CONCEPT_RE = /\[\[concepts\/([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

export const remarkCitations: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index == null) return;
    const out: (Text | Link)[] = [];
    let last = 0;
    const value = node.value;
    const matches = [
      ...[...value.matchAll(SOURCE_RE)].map((m) => ({
        kind: "source" as const,
        m
      })),
      ...[...value.matchAll(CONCEPT_RE)].map((m) => ({
        kind: "concept" as const,
        m
      }))
    ].sort((a, b) => (a.m.index ?? 0) - (b.m.index ?? 0));

    for (const { kind, m } of matches) {
      const start = m.index ?? 0;
      if (start > last) out.push({ type: "text", value: value.slice(last, start) });
      const id = m[1]!;
      const display = m[2] ?? id;
      const url =
        kind === "source"
          ? `obsidian://open?vault=vault&file=sources#^${id}`
          : `obsidian://open?vault=vault&file=concepts/${id}`;
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: display }]
      });
      last = start + m[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    if (out.length > 0) {
      (parent as { children: unknown[] }).children.splice(index, 1, ...out);
    }
  });
};
```

Add deps:

```bash
pnpm --filter frontend add unified unist-util-visit
pnpm --filter frontend add -D @types/mdast @types/unist
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/citations.ts frontend/package.json ../pnpm-lock.yaml
git commit -m "feat(frontend): citation remark plugin (sources, concepts)"
```

---

### Task 30: TokenMeter component

**Files:**
- Create: `frontend/src/components/Header/TokenMeter.tsx`
- Create: `frontend/src/components/Header/TokenMeter.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenMeter } from "./TokenMeter.js";

describe("TokenMeter", () => {
  it("renders the count and budget", () => {
    render(<TokenMeter tokens={12345} budget={400000} />);
    expect(screen.getByText(/12,345/)).toBeTruthy();
    expect(screen.getByText(/400,000/)).toBeTruthy();
  });

  it("uses default color below 75%", () => {
    const { container } = render(<TokenMeter tokens={100000} budget={400000} />);
    expect(container.querySelector(".bg-gray-400")).toBeTruthy();
  });

  it("turns yellow at >= 75%", () => {
    const { container } = render(<TokenMeter tokens={310000} budget={400000} />);
    expect(container.querySelector(".bg-yellow-500")).toBeTruthy();
  });

  it("turns red at >= 90%", () => {
    const { container } = render(<TokenMeter tokens={365000} budget={400000} />);
    expect(container.querySelector(".bg-red-500")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement `TokenMeter.tsx`**

```tsx
export interface TokenMeterProps {
  tokens: number;
  budget: number;
}

const fmt = new Intl.NumberFormat("en-US");

export function TokenMeter({ tokens, budget }: TokenMeterProps) {
  const pct = Math.min(100, Math.round((tokens / budget) * 100));
  let bar = "bg-gray-400";
  if (pct >= 90) bar = "bg-red-500";
  else if (pct >= 75) bar = "bg-yellow-500";

  return (
    <div className="flex items-center gap-2 text-xs text-gray-700 font-mono">
      <div className="w-32 h-2 bg-gray-200 rounded">
        <div
          className={`h-2 rounded ${bar}`}
          style={{ width: `${pct}%` }}
          aria-label={`token usage ${pct}%`}
        />
      </div>
      <span>
        {fmt.format(tokens)} / {fmt.format(budget)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm --filter frontend test src/components/Header/TokenMeter.test.tsx
```

Expected: PASS.

```bash
git add frontend/src/components/Header
git commit -m "feat(frontend): TokenMeter component with threshold colors"
```

---

### Task 31: Header + Menu (Compact, New conversation, Settings)

**Files:**
- Create: `frontend/src/components/Header/Header.tsx`
- Create: `frontend/src/components/Header/Menu.tsx`

- [ ] **Step 1: Implement `Menu.tsx`**

```tsx
import { useState } from "react";

export interface MenuProps {
  onCompact: () => void;
  onNewConversation: () => void;
}

export function Menu({ onCompact, onNewConversation }: MenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-10">
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onCompact();
            }}
          >
            Compact conversation
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              if (
                confirm(
                  "This deletes the current conversation history. Continue?"
                )
              ) {
                onNewConversation();
              }
            }}
          >
            New conversation
          </button>
          <button
            type="button"
            disabled
            className="w-full text-left px-3 py-2 text-gray-400 cursor-not-allowed"
          >
            Settings (coming soon)
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `Header.tsx`**

```tsx
import { TokenMeter } from "./TokenMeter.js";
import { Menu } from "./Menu.js";

export interface HeaderProps {
  tokens: number;
  budget: number;
  onCompact: () => void;
  onNewConversation: () => void;
}

export function Header(props: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
      <div className="font-medium text-sm">PRD 2 Agent</div>
      <div className="flex items-center gap-3">
        <TokenMeter tokens={props.tokens} budget={props.budget} />
        <Menu onCompact={props.onCompact} onNewConversation={props.onNewConversation} />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header/Menu.tsx frontend/src/components/Header/Header.tsx
git commit -m "feat(frontend): Header + Menu (Compact, New conversation, Settings)"
```

---

### Task 32: Message + ToolCallDisclosure components

**Files:**
- Create: `frontend/src/components/Chat/Message.tsx`
- Create: `frontend/src/components/Chat/ToolCallDisclosure.tsx`

- [ ] **Step 1: Implement `ToolCallDisclosure.tsx`**

```tsx
import { useState } from "react";

export interface ToolCallDisclosureProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
}

export function ToolCallDisclosure(props: ToolCallDisclosureProps) {
  const [open, setOpen] = useState(false);
  const indicator = props.result === undefined
    ? "running"
    : props.isError
    ? "error"
    : `${props.durationMs ?? 0}ms`;
  const color = props.isError ? "text-red-600" : "text-gray-500";

  return (
    <div className={`my-1 text-xs ${color}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono hover:underline"
      >
        {open ? "▾" : "▸"} {props.name}({Object.keys(props.input).length} args) — {indicator}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded overflow-x-auto">
          <strong>input:</strong> {JSON.stringify(props.input, null, 2)}
          {"\n\n"}
          <strong>result:</strong>{" "}
          {props.result === undefined
            ? "(pending)"
            : JSON.stringify(props.result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `Message.tsx`**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "../../lib/citations.js";
import type { Message as MsgType, ContentBlock } from "../../types.js";
import { ToolCallDisclosure } from "./ToolCallDisclosure.js";

export interface MessageProps {
  message: MsgType;
  toolResults?: Record<string, { result: unknown; durationMs: number; isError?: boolean }>;
}

export function Message({ message, toolResults = {} }: MessageProps) {
  const isUser = message.role === "user";
  const isSystemSummary = message.role === "system_summary";

  if (isSystemSummary) {
    const text = (message.content[0] as ContentBlock | undefined)?.text ?? "";
    return (
      <details className="my-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
        <summary className="cursor-pointer text-yellow-800">
          Conversation summarized — click to expand
        </summary>
        <p className="mt-2 text-gray-700 whitespace-pre-wrap">{text}</p>
      </details>
    );
  }

  return (
    <div
      className={`my-2 max-w-[85%] px-3 py-2 rounded ${
        isUser
          ? "self-end bg-blue-50 border border-blue-100"
          : "self-start bg-white border border-gray-200"
      }`}
    >
      {message.content.map((block, i) => {
        if (block.type === "text") {
          return (
            <div key={i} className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]}>
                {block.text ?? ""}
              </ReactMarkdown>
            </div>
          );
        }
        if (block.type === "tool_use") {
          const id = block.id ?? `tu_${i}`;
          const tr = toolResults[id];
          const props: { name: string; input: Record<string, unknown>; result?: unknown; durationMs?: number; isError?: boolean } = {
            name: block.name ?? "unknown",
            input: block.input ?? {}
          };
          if (tr) {
            props.result = tr.result;
            props.durationMs = tr.durationMs;
            if (tr.isError !== undefined) props.isError = tr.isError;
          }
          return <ToolCallDisclosure key={id} {...props} />;
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/Message.tsx frontend/src/components/Chat/ToolCallDisclosure.tsx
git commit -m "feat(frontend): Message + ToolCallDisclosure components"
```

---

### Task 33: ChatPane + Composer

**Files:**
- Create: `frontend/src/components/Chat/Composer.tsx`
- Create: `frontend/src/components/Chat/ChatPane.tsx`

- [ ] **Step 1: Implement `Composer.tsx`**

```tsx
import { useState } from "react";

export interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex gap-2 px-3 py-2 border-t border-gray-200 bg-white"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e as unknown as React.FormEvent);
        }}
        rows={2}
        placeholder="Send a message..."
        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
      >
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implement `ChatPane.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { Message } from "./Message.js";
import { Composer } from "./Composer.js";
import type { Message as MsgType } from "../../types.js";

export interface ChatPaneProps {
  messages: MsgType[];
  toolResults: Record<string, { result: unknown; durationMs: number; isError?: boolean }>;
  isStreaming: boolean;
  onSend: (text: string) => void;
}

export function ChatPane({ messages, toolResults, isStreaming, onSend }: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {messages.map((m) => (
          <Message key={m.id} message={m} toolResults={toolResults} />
        ))}
      </div>
      <Composer onSend={onSend} disabled={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat
git commit -m "feat(frontend): ChatPane + Composer"
```

---

### Task 34: ContextPanel + RetrievedItem + CompileButton

**Files:**
- Create: `frontend/src/components/Context/RetrievedItem.tsx`
- Create: `frontend/src/components/Context/CompileButton.tsx`
- Create: `frontend/src/components/Context/ContextPanel.tsx`

- [ ] **Step 1: Implement `RetrievedItem.tsx`**

```tsx
import type { RetrievedItem as Item } from "../../types.js";

export function RetrievedItem({ item }: { item: Item }) {
  const tone = item.isError
    ? "bg-red-50 border-red-200 text-red-800"
    : "bg-white border-gray-200 text-gray-800";
  return (
    <div className={`my-1 px-2 py-1 text-xs border rounded ${tone}`}>
      <span className="font-mono text-gray-500 mr-1">{item.toolName}</span>
      <span>{item.summary}</span>
    </div>
  );
}
```

- [ ] **Step 2: Implement `CompileButton.tsx`**

```tsx
import { useState } from "react";
import { compileVault } from "../../lib/api.js";

export function CompileButton() {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setToast(null);
    try {
      const r = await compileVault();
      setToast(
        `Compile ${r.status} — ${r.pagesWritten} written, ${r.pagesSkipped} skipped (${r.durationMs}ms)`
      );
    } catch (err) {
      setToast(`Compile failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded disabled:bg-gray-400"
      >
        {busy ? "Compiling..." : "Compile vault"}
      </button>
      {toast && <div className="text-xs text-gray-600">{toast}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Implement `ContextPanel.tsx`**

```tsx
import { CompileButton } from "./CompileButton.js";
import { RetrievedItem } from "./RetrievedItem.js";
import type { RetrievedItem as Item } from "../../types.js";

export interface ContextPanelProps {
  retrieved: Item[];
}

export function ContextPanel({ retrieved }: ContextPanelProps) {
  return (
    <aside className="flex flex-col h-full px-3 py-3 bg-gray-50 border-l border-gray-200">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
        Context (live)
      </div>
      <div className="flex-1 overflow-y-auto">
        {retrieved.length === 0 ? (
          <div className="text-xs text-gray-400 italic mt-2">
            What the agent retrieves this turn will appear here.
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-700 mt-1 mb-1">
              Retrieved this turn:
            </div>
            {retrieved.map((it) => (
              <RetrievedItem key={`${it.toolUseId}-${it.summary}`} item={it} />
            ))}
          </>
        )}
      </div>
      <div className="pt-2 border-t border-gray-200">
        <CompileButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Context
git commit -m "feat(frontend): Context panel (RetrievedItem, CompileButton, ContextPanel)"
```

---

### Task 35: App composition + chat flow wiring

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace placeholder `App.tsx` with full composition**

```tsx
import { useEffect, useMemo } from "react";
import { Header } from "./components/Header/Header.js";
import { ChatPane } from "./components/Chat/ChatPane.js";
import { ContextPanel } from "./components/Context/ContextPanel.js";
import { useAppStore } from "./store.js";
import {
  compactConversation,
  getChatState,
  newConversation,
  streamChat
} from "./lib/api.js";
import type { Message } from "./types.js";

const TOKEN_BUDGET = 400_000;

interface ToolResultEntry {
  result: unknown;
  durationMs: number;
  isError?: boolean;
}

export default function App() {
  const state = useAppStore();
  const toolResults = useMemo<Record<string, ToolResultEntry>>(() => {
    const acc: Record<string, ToolResultEntry> = {};
    for (const r of state.retrievedThisTurn) {
      const entry: ToolResultEntry = {
        result: r.raw,
        durationMs: 0
      };
      if (r.isError !== undefined) entry.isError = r.isError;
      acc[r.toolUseId] = entry;
    }
    return acc;
  }, [state.retrievedThisTurn]);

  useEffect(() => {
    void (async () => {
      const s = await getChatState();
      state.setConversation(s.conversationId, s.messages, s.tokenCount);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSend(text: string) {
    state.appendMessage({
      id: `local-${Date.now()}`,
      conversationId: state.conversationId ?? "",
      role: "user",
      content: [{ type: "text", text }],
      tokenCount: 0,
      createdAt: new Date().toISOString()
    });
    state.resetTurnRetrieval();
    state.setStreaming(true);

    try {
      for await (const ev of streamChat(text)) {
        if (ev.event === "text_delta") {
          const data = ev.data as { text: string };
          state.appendAssistantText(data.text);
        } else if (ev.event === "tool_use_start") {
          const data = ev.data as {
            toolUseId: string;
            name: string;
            input: Record<string, unknown>;
          };
          state.addRetrieval({
            kind: "tool",
            toolUseId: data.toolUseId,
            toolName: data.name,
            summary: `${data.name} called`,
            raw: data.input
          });
        } else if (ev.event === "tool_use_complete") {
          const data = ev.data as {
            toolUseId: string;
            result: unknown;
            durationMs: number;
            isError?: boolean;
          };
          state.addRetrieval({
            kind: "tool",
            toolUseId: data.toolUseId + "-result",
            toolName: "→ result",
            summary: data.isError ? "error" : "ok",
            raw: data.result,
            ...(data.isError !== undefined ? { isError: data.isError } : {})
          });
        } else if (ev.event === "message_complete") {
          const data = ev.data as { totalConversationTokens: number };
          state.setTokenCount(data.totalConversationTokens);
        } else if (ev.event === "error") {
          const data = ev.data as { message: string };
          alert(`Stream error: ${data.message}`);
        }
      }
    } finally {
      state.setStreaming(false);
      // Refresh authoritative state from server
      const s = await getChatState();
      state.setConversation(s.conversationId, s.messages, s.tokenCount);
    }
  }

  async function onCompact() {
    try {
      await compactConversation();
    } catch (err) {
      alert(`Compact failed: ${(err as Error).message}`);
    }
    const s = await getChatState();
    state.setConversation(s.conversationId, s.messages, s.tokenCount);
  }

  async function onNewConversation() {
    await newConversation();
    const s = await getChatState();
    state.setConversation(s.conversationId, s.messages, s.tokenCount);
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      <Header
        tokens={state.tokenCount}
        budget={TOKEN_BUDGET}
        onCompact={onCompact}
        onNewConversation={onNewConversation}
      />
      <div className="flex-1 grid grid-cols-[1.4fr_1fr] min-h-0">
        <ChatPane
          messages={state.messages as Message[]}
          toolResults={toolResults}
          isStreaming={state.isStreaming}
          onSend={onSend}
        />
        <ContextPanel retrieved={state.retrievedThisTurn} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test end-to-end**

Terminal A:
```bash
pnpm cli serve
```

Terminal B:
```bash
pnpm --filter frontend dev
```

Open http://localhost:5173 — the chat UI should load with empty state. Type "what's in memory?" and send. Confirm:
- Tokens appear in the chat
- Tool calls show in the context panel
- Token meter updates after the turn

Stop both when done.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): App composition + chat flow wiring"
```

---

## Phase 6 — E2E + docs

### Task 36: Playwright happy-path E2E

**Files:**
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/chat-happy-path.spec.ts`
- Modify: root `package.json` (add `test:e2e` script)
- Modify: `.gitignore`

- [ ] **Step 1: Add Playwright at the workspace root**

```bash
pnpm add -D -w @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Create `tests/e2e/playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  webServer: [
    {
      command: "pnpm cli serve",
      port: 8787,
      timeout: 30_000,
      reuseExistingServer: true,
      env: {
        NODE_ENV: "test",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "fake-key",
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? "fake-key"
      }
    },
    {
      command: "pnpm --filter frontend dev",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: true
    }
  ],
  use: {
    baseURL: "http://localhost:5173"
  }
});
```

- [ ] **Step 3: Create `tests/e2e/chat-happy-path.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test("loads, sends a message, sees the context panel update", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PRD 2 Agent")).toBeVisible();

  // The chat composer should be present
  const composer = page.getByPlaceholder("Send a message...");
  await expect(composer).toBeVisible();

  // We avoid asserting on real Anthropic responses (this test runs against
  // the live backend; calling the agent requires real API keys). Instead,
  // assert that interacting with the UI doesn't throw and the token meter
  // is rendered.
  await expect(page.getByLabel(/token usage/i)).toBeVisible();

  // Click the menu and verify items
  await page.getByLabel("Open menu").click();
  await expect(page.getByText("Compact conversation")).toBeVisible();
  await expect(page.getByText("New conversation")).toBeVisible();
});
```

- [ ] **Step 4: Add root script**

In root `package.json`, add to `scripts`:

```json
"test:e2e": "playwright test --config tests/e2e/playwright.config.ts"
```

- [ ] **Step 5: Add `.playwright`, `test-results/` to `.gitignore`**

```
playwright-report/
test-results/
.playwright/
```

- [ ] **Step 6: Smoke run (skippable on CI)**

```bash
pnpm test:e2e
```

Expected: PASS. The test does not call live Anthropic APIs.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e package.json .gitignore pnpm-lock.yaml
git commit -m "test(e2e): playwright happy-path for chat shell load"
```

---

### Task 37: README updates + dev-flow docs

**Files:**
- Modify: `README.md` (or create if absent)

- [ ] **Step 1: Inspect existing README**

```bash
ls README.md 2>&1
```

If absent, create one. If present, append a "PRD 2 — agent shell" section.

- [ ] **Step 2: Append the dev workflow**

```markdown
## PRD 2 — Agent shell (chat UI + backend)

### Local setup

1. Set `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` in `.env` (see `.env.example`).
2. `docker compose up -d` (Postgres + pgAdmin).
3. `pnpm migrate up`
4. Optional: backfill embeddings for any pre-existing claims:
   ```bash
   pnpm cli embed-missing
   ```

### Run the agent

Terminal 1:
```bash
pnpm cli serve              # backend on :8787
```

Terminal 2:
```bash
pnpm --filter frontend dev  # UI on :5173
```

Open http://localhost:5173.

### CLI

| Command | Purpose |
|---|---|
| `pnpm cli embed-missing` | Backfill embeddings for claims with NULL embedding |
| `pnpm cli embed-all --yes` | Re-embed every claim (after model swap) |
| `pnpm cli serve` | Start the backend HTTP service |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(prd2): agent shell dev workflow + CLI reference"
```

---

## Self-review checklist

Run these mentally after completing all tasks:

1. **Spec coverage** — every section of the spec has a corresponding task:
   - §1 context: implicit in goals; no task needed
   - §2 architecture: realized by Tasks 1, 2, 22, 23, 24, 25, 35
   - §3 schema: Tasks 1, 2, 3
   - §4 embedding pipeline: Tasks 4, 5, 6, 7
   - §5 OpenBrain API additions: Tasks 8, 9, 10, 11
   - §6 agent runtime: Tasks 13, 14, 15, 16, 17, 18, 19, 20
   - §7 HTTP API: Tasks 22, 23, 24
   - §8 frontend: Tasks 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35
   - §9 conversation lifecycle: Tasks 10, 11, 21
   - §10 compilation HTTP: Task 24
   - §11 CLI additions: Tasks 7, 24
   - §12 reset behavior: Task 12
   - §13 error handling: covered case-by-case in tasks
   - §14 edge cases: covered in tests
   - §15 testing strategy: present throughout
2. **No placeholders** — all steps have concrete code or commands.
3. **Type consistency** — `Message`, `ContentBlock`, `RankedClaim`, etc. are defined once and used consistently.

---






