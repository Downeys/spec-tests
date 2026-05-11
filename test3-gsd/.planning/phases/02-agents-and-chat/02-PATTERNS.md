# Phase 2: Agents and Chat — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 50 (43 net-new + 7 modified)
**Analogs found:** 30 with strong analog / 50 ; 20 NET-NEW (no in-repo analog)

> Phase 2 is the first surface that introduces Hono routes, Claude Agent SDK definitions, the Tavily integration, and the assistant-ui chat UI. Many of the new file types have no in-repo analog and must follow the spec authority (RESEARCH.md / AI-SPEC.md / UI-SPEC.md) verbatim. Where an analog exists (Phase 1 repo write functions, Phase 1 CLI commands, Phase 1 tests, Phase 1 vault writer) the pattern is concrete and reusable.

---

## File Classification

### Server (Hono + SSE) — 5 files, all NET-NEW

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/server/index.ts` | server-bootstrap | request-response | `src/cli/index.ts` (entry-point shape only) | partial |
| `src/server/routes/chat.ts` | route-handler | streaming (SSE) | none | NET-NEW |
| `src/server/routes/recompile.ts` | route-handler | streaming (SSE) | none | NET-NEW |
| `src/server/routes/health.ts` | route-handler | request-response | none | NET-NEW |
| `src/server/streaming.ts` | adapter (SDK→UIMessageChunk) | transform | none | NET-NEW |

### Agents (Claude Agent SDK) — 8 files, all NET-NEW

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/agents/coordinator.ts` | agent-orchestrator | streaming | none | NET-NEW |
| `src/agents/coordinator-output-guard.ts` | guardrail | transform | none | NET-NEW |
| `src/agents/definitions/research.ts` | sub-agent-definition | request-response | none | NET-NEW |
| `src/agents/definitions/compilation.ts` | sub-agent-definition | request-response | none | NET-NEW |
| `src/agents/tools/onebrain.ts` | agent-tool (write) | CRUD | `src/onebrain/repo.ts` (function signature shape) | role-match |
| `src/agents/tools/tavily.ts` | agent-tool (external API) | request-response | `src/onebrain/embed.ts` (singleton client + env-key + slim wrapper) | partial |
| `src/agents/tools/vault.ts` | agent-tool (write) | file-I/O | `src/compilation/vault-writer.ts` (atomic write impl) + `src/compilation/runner.ts` (orchestration) | exact (delegates to Phase 1) |
| `src/agents/prompts/research.md` (or `.ts`) | prompt-asset | static | none | NET-NEW |

### OneBrain extensions — 3 files, MODIFY 1

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/onebrain/search.ts` (NEW) | repo extension (read) | read-only | `src/onebrain/repo.ts` (`findClaim`/`findEdgesFrom` query shape) | role-match |
| `src/onebrain/quant-pattern.ts` (NEW) | utility | pure | `src/lib/tag-canonicalize.ts` (small pure-fn utility) | exact |
| `src/onebrain/repo.ts` (MODIFY: add `QuantitativeClaimRequiresSourceError` + writeClaim guard) | repo-write-boundary | CRUD | self (existing `writeClaim`) | exact |

### OneBrain types extension — 1 file, MODIFY

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/onebrain/types.ts` (MODIFY: add `ResearchOutputSchema`, `ContradictionRefSchema`, `RecompileResultSchema`) | schema | static | self (existing `NewClaimSchema` etc.) | exact |

### Migrations — 1 file, NET-NEW

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `migrations/1700000000008_claims_text_fts.sql` | migration | static | `migrations/1700000000003_claims.sql` (raw SQL DDL in node-pg-migrate) | exact |

### Library extensions — 1 file, MODIFY

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/env.ts` (MODIFY: add `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PHOENIX_ENABLED`) | config | read-only | self (existing `EnvSchema`) | exact |
| `src/lib/tracing.ts` (NEW, opt-in) | observability | event-driven | none (Phoenix instrumentation is new) | NET-NEW |
| `src/lib/ngram-overlap.ts` (NEW) | shared library / pure utility | pure | `src/lib/tag-canonicalize.ts` (pure fn shape) | exact |

### CLI — 1 file, MODIFY + 1 NEW

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/cli/index.ts` (MODIFY: add `bsp serve` subcommand) | cli-entry | request-response | self (existing `program.command(...)` pattern) | exact |
| `src/cli/commands/serve.ts` (NEW) | cli-handler | request-response | `src/cli/commands/compile.ts` (thinnest handler shape — delegate to lib) | exact |

### UI (assistant-ui + React 19 + Tailwind v4) — 8 files, NET-NEW (replaces 1 placeholder)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/ui/App.tsx` (REPLACE) | ui-shell | event-driven | self (Phase 1 placeholder; structure-only carry) | partial |
| `src/ui/runtime.ts` (NEW) | ui-config | event-driven | none | NET-NEW |
| `src/ui/components/HeaderBar.tsx` | ui-component | event-driven | none | NET-NEW |
| `src/ui/components/RecompileButton.tsx` | ui-component | event-driven | none | NET-NEW |
| `src/ui/components/RecompileStatus.tsx` | ui-component | event-driven | none | NET-NEW |
| `src/ui/components/ToolTrace.tsx` | ui-component | event-driven | none | NET-NEW |
| `src/ui/components/WikiCitation.tsx` | ui-component | event-driven | none | NET-NEW |
| `src/ui/components/{ui,assistant-ui}/...` (scaffolded via `npx assistant-ui init`) | ui-component (vendored) | event-driven | none | NET-NEW |

### Tests — 17 NEW spec files + 3 NEW helpers

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `tests/server/health.spec.ts` | integration-test | request-response | `tests/integration/pipeline.test.ts` | role-match |
| `tests/server/chat-sse.spec.ts` | integration-test | streaming | none | NET-NEW (use Hono `app.request()` per RESEARCH §3.2) |
| `tests/server/recompile-route.spec.ts` | integration-test | request-response | `tests/integration/pipeline.test.ts` | role-match |
| `tests/agents/coordinator-config.spec.ts` | unit-test (static membership) | read-only | `tests/unit/repo.test.ts` (reflective Object.keys check) | exact |
| `tests/agents/schema-malformed-output.spec.ts` | integration-test | request-response | `tests/integration/append-only.test.ts` | role-match |
| `tests/agents/recompile-roundtrip.spec.ts` | integration-test | full-pipeline | `tests/integration/pipeline.test.ts` (pipeline keystone) | exact |
| `tests/agents/no-peer-messaging.spec.ts` | unit-test (grep + assertion) | read-only | `tests/unit/repo.test.ts` (Object.keys reflection) | role-match |
| `tests/agents/quantitative-claim-guard.spec.ts` | unit + integration | request-response | `tests/integration/append-only.test.ts` (P19-shaped throw assertion) | role-match |
| `tests/agents/tool-permission.spec.ts` | unit-test (static membership) | read-only | `tests/unit/repo.test.ts` (export reflection) | exact |
| `tests/agents/vault-writer-gate.spec.ts` | integration-test | file-I/O | `tests/integration/pipeline.test.ts` (vault snapshot) | role-match |
| `tests/agents/research-no-vault-write.spec.ts` | integration-test | file-I/O | `tests/integration/pipeline.test.ts` | role-match |
| `tests/agents/tavily.spec.ts` | integration-test (gated) | request-response | `tests/integration/voyage-live.test.ts` (`RUN_*_TESTS=1` gate pattern) | exact |
| `tests/agents/pushback-substance.spec.ts` | integration-test (gated) | request-response | `tests/integration/voyage-live.test.ts` (gating pattern) | role-match |
| `tests/agents/source-first-ordering.spec.ts` | unit + integration | CRUD | `tests/integration/append-only.test.ts` | role-match |
| `tests/agents/prose-smuggling.spec.ts` | integration-test (gated) | transform | none | NET-NEW |
| `tests/onebrain/search-hybrid.spec.ts` | integration-test | read-only | `tests/integration/pipeline.test.ts` (fixture seed + assertion) | exact |
| `tests/ui/app-shell.spec.tsx` | unit-test (jsdom) | event-driven | `tests/integration/ui-scaffold.test.tsx` | exact |
| `tests/ui/streaming.spec.tsx` | integration-test (jsdom + mock SSE) | streaming | `tests/integration/ui-scaffold.test.tsx` (only setup/render shape) | partial |
| `tests/ui/tool-trace.spec.tsx` | unit-test (jsdom) | event-driven | `tests/integration/ui-scaffold.test.tsx` | role-match |
| `tests/ui/wiki-citation.spec.tsx` | unit-test (jsdom) | event-driven | `tests/integration/ui-scaffold.test.tsx` | role-match |
| `tests/ui/recompile-button.spec.tsx` | integration-test (jsdom + mock fetch) | event-driven | `tests/integration/ui-scaffold.test.tsx` (env + render shape) | partial |
| `tests/ui/slash-command.spec.tsx` | unit-test (jsdom) | event-driven | `tests/integration/ui-scaffold.test.tsx` | role-match |
| `tests/fixtures/quantitative-claims.ts` | fixture | static | `src/cli/fixtures/strategic-positioning.ts` (typed fixture export) | exact |
| `tests/fixtures/sub-agent-stubs.ts` | fixture | static | `tests/setup/voyage-mock.ts` (mock-shape pattern) | role-match |

> **Note:** the n-gram overlap helper has been canonicalized to `src/lib/ngram-overlap.ts` (runtime production code under "Library extensions" above). It is no longer a test-only asset because the runtime guard at `src/agents/coordinator-output-guard.ts` imports it as well as the prose-smuggling spec. The TEST FILE `tests/agents/prose-smuggling.spec.ts` is unchanged.

### Eval reference assets — 2 NEW (planner outputs into `.planning/eval/`)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `.planning/eval/phase2-reference-dataset.{md,json}` | reference-dataset | static | none | NET-NEW |
| `.planning/eval/pushback-rubric.md` | rubric | static | none | NET-NEW |

### Config — 4 MODIFY

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `vitest.config.ts` (MODIFY: add `ui` + `agents` projects) | config | static | self (existing `unit` + `integration` projects) | exact |
| `vite.config.ts` (MODIFY: add proxy `/chat`, `/recompile`, `/health` → :3000) | config | static | self | exact |
| `package.json` (MODIFY: deps + `dev:server` script) | config | static | self (existing scripts block) | exact |
| `.env.example` (MODIFY: add `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PHOENIX_ENABLED`) | config | static | self | exact |
| `CLAUDE.md` (MODIFY: add coordinator identity, write protocol, sub-agent rules, D-07 pushback template, D-09 hypothesis framing, D-06 never-quote-sub-agent) | docs/prompt | static | self (Phase 1 baseline) | exact |

---

## Pattern Assignments

### `src/agents/tools/onebrain.ts` (agent-tool, CRUD wrapper)

**Analog:** `src/onebrain/repo.ts`

The Phase 1 repo functions are the inner core; Phase 2's tool wrappers must (a) validate input via Zod (the SDK's `tool()` already requires this), (b) enforce source-row-first ordering for `onebrain_write_claim` (D-05), and (c) canonicalize tags before delegating to `writeClaim()` (already done inside `writeClaim` per `src/onebrain/repo.ts:99` — wrapper does NOT need to re-canonicalize).

**Existing `writeClaim` signature + Zod parse pattern** (`src/onebrain/repo.ts:81-104`):

```ts
export async function writeClaim(input: NewClaim): Promise<Claim> {
  const validated = NewClaimSchema.parse(input);
  // Embed OUTSIDE transaction (slow network call; don't hold row lock — P16)
  const embedText =
    validated.text + (validated.rationale ? ' — ' + validated.rationale : '');
  const embedding = await embed(embedText);
  const id = ulid();

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.claims)
      .values({
        id,
        kind: validated.kind,
        status: validated.status ?? 'hypothesis', // CRIT-02 belt
        confidence: String(validated.confidence),
        text: validated.text,
        ...
        topic_tags: (validated.topic_tags ?? []).map(canonicalizeTag), // DATA-10
```

**Existing `writeSource` idempotent return shape** (`src/onebrain/repo.ts:45-78`):

```ts
export async function writeSource(
  input: NewSource,
): Promise<{ source: Source; skipped: boolean }> {
  const validated = NewSourceSchema.parse(input);
  const hash = hashRawText(validated.raw_text);

  const existing = await db
    .select()
    .from(s.sources)
    .where(eq(s.sources.raw_text_hash, hash))
    .limit(1);
  if (existing.length > 0) {
    return { source: rowToSource(existing[0]), skipped: true };
  }
  ...
```

**Apply to `src/agents/tools/onebrain.ts`:**
- The tool wrapper is a thin SDK `tool()` that delegates to the repo function. Repo has the only validation surface for new claims — wrapper adds a *protocol-layer* check: if any `cites_source_ids[]` ULID is not in OneBrain at the moment of the call (in this turn or pre-existing), reject with structured error before calling `writeClaim`. The Layer 1 schema-level guard (Pitfall 19 quantitative-pattern) lives inside `writeClaim` itself — see `repo.ts` modification below.
- Returned shape mirrors `writeSource`'s discriminated `{ source, skipped }` so the SDK's caller (the sub-agent prompt) can react.

### `src/onebrain/repo.ts` (MODIFY: add quantitative-claim guard at writeClaim entry)

**Analog:** self (`src/onebrain/repo.ts:81-83` — the existing parse-then-act entry)

**Add at the very top of `writeClaim`** (Layer 1 of AGENT-08 / Pitfall 19, before the Zod parse on `repo.ts:82`):

```ts
import { matchesQuantitativePattern } from './quant-pattern.js';

export class QuantitativeClaimRequiresSourceError extends Error {
  constructor(public readonly text: string) {
    super(`quantitative claim requires cites_source_ids: ${text.slice(0, 80)}…`);
    this.name = 'QuantitativeClaimRequiresSourceError';
  }
}

export async function writeClaim(input: NewClaim): Promise<Claim> {
  const validated = NewClaimSchema.parse(input);
  // Layer 1 (Pitfall 19): TAM-shaped or ≥$1M numeric claims require a source row
  if (
    matchesQuantitativePattern(validated.text) &&
    (!validated.cites_source_ids || validated.cites_source_ids.length === 0)
  ) {
    throw new QuantitativeClaimRequiresSourceError(validated.text);
  }
  // ... existing embed + transaction body unchanged
```

**Pattern source:** the existing pattern of throwing typed errors from repo (`src/onebrain/repo.ts:172-189` `promoteClaimStatus` throws `Error('CRIT-06: ...')` on missing-edge precondition). Phase 2 evolves this to a *named* error class so the agent-tool wrapper can `catch` it specifically.

### `src/onebrain/quant-pattern.ts` (utility, pure)

**Analog:** `src/lib/tag-canonicalize.ts`

**Imports + small-pure-fn shape** (`src/lib/tag-canonicalize.ts:1-11`):

```ts
// src/lib/tag-canonicalize.ts
// Canonicalize tags at write time so 'Pricing Strategy' and 'pricing-strategy' coalesce.
// Used by repo.writeClaim() before insert.

export function canonicalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}
```

**Apply:** single named export `matchesQuantitativePattern(text: string): boolean`. RESEARCH.md §3.5 specifies the regex:

```ts
const QUANT_PATTERN = /(\$\s*[\d,]+(\.\d+)?\s*(M|B|T|million|billion|trillion))|(\b(TAM|SAM|SOM)\b)/i;
export function matchesQuantitativePattern(text: string): boolean {
  return QUANT_PATTERN.test(text);
}
```

### `src/onebrain/search.ts` (repo extension, read-only)

**Analog:** `src/onebrain/repo.ts` (`findEdgesFrom` query shape `:262-268`)

**Existing reader pattern** (`src/onebrain/repo.ts:262-268`):

```ts
export async function findEdgesFrom(fromTable: string, fromId: string): Promise<Edge[]> {
  const rows = await db
    .select()
    .from(s.edges)
    .where(and(eq(s.edges.from_table, fromTable), eq(s.edges.from_id, fromId)));
  return rows.map((r) => ({ ...r, weight: Number(r.weight) })) as unknown as Edge[];
}
```

**Apply:** `searchClaims({ q, embedding, tags?, limit }): Promise<ClaimSearchResult[]>` exported from `src/onebrain/search.ts`. The SQL is one query (RESEARCH.md §3.3 has the exact CTE). Use Drizzle's `sql` template tag for the FTS+vector union — Drizzle does not expose `to_tsvector`/`<=>` natively; use raw `sql\`\`` per the existing `db` import. Coerce numeric scores back to `number` (same pattern as `findEdgesFrom` weights).

**Spec authority for the SQL itself:** `02-RESEARCH.md` §3.3 (lines 150-173) — copy the CTE verbatim.

### `src/agents/tools/vault.ts` (agent-tool, file-I/O — compilation only)

**Analog:** `src/compilation/vault-writer.ts` (the underlying atomic-write impl) and `src/compilation/runner.ts` (the orchestration the tool delegates to)

**Existing atomic-write pattern** (`src/compilation/vault-writer.ts:31-36`):

```ts
export async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}
```

**Existing orchestration entry** (`src/compilation/runner.ts:36-43`):

```ts
export async function runCompile(
  opts: RunCompileOptions = {},
): Promise<RunCompileResult> {
  const vaultPath = opts.vaultPath ?? path.resolve(process.cwd(), 'vault');
  const now = opts.now ?? new Date();
  const runId = ulid();

  logger.info({ runId, vaultPath }, 'compile started');
```

**Apply to `src/agents/tools/vault.ts`:**

```ts
// Layer 2 belt-and-braces (RESEARCH §3.1) — runtime guard inside the tool impl
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { runCompile } from '@/compilation/runner.js';
import { env } from '@/lib/env.js';

export class ToolPermissionDenied extends Error {
  constructor(public readonly invoker: string, public readonly toolName: string) {
    super(`${toolName} invoked by ${invoker}, only 'compilation' allowed`);
    this.name = 'ToolPermissionDenied';
  }
}

export const vault_write_atomic = tool('vault_write_atomic', z.object({}), async (_, ctx) => {
  // Layer 2 — see RESEARCH §3.1
  if (ctx?.agentId !== 'compilation') {
    throw new ToolPermissionDenied(ctx?.agentId ?? '<unknown>', 'vault_write_atomic');
  }
  return await runCompile({ vaultPath: env.VAULT_PATH ?? undefined });
});
```

The tool delegates *entirely* to Phase 1's `runCompile()` — no new compile logic. The SDK's per-agent allowlist (Layer 1) is the protocol-layer guarantee; this Layer 2 catches accidental direct import-and-call from non-agent code paths.

### `src/agents/tools/tavily.ts` (agent-tool, external API)

**Analog:** `src/onebrain/embed.ts` (singleton-client + env-key + thin export pattern)

**Existing singleton client** (`src/onebrain/embed.ts:30-34`):

```ts
let _client: VoyageAIClientType | undefined;
function client(): VoyageAIClientType {
  if (!_client) _client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });
  return _client;
}
```

**Critical landmine carry-forward:** `voyageai@0.2.1` ships a broken ESM build, so `embed.ts:16-25` uses `createRequire` to load the CJS build. `02-RESEARCH.md` lines 220-223 mandate verifying `@tavily/core` ESM-cleanness *at install* and falling back to the same `createRequire` pattern (or direct REST `https://api.tavily.com/search`) if broken.

**Apply:** mirror the singleton-client + lazy-init pattern; wrap each Tavily method in an SDK `tool()` per RESEARCH.md §"RES-01" (lines 70-82). D-03 specifies search + extract on top 3-5 hits as default; `tavily_crawl` is wired but not invoked by default. Per D-01 the wrapper for `onebrain_write_claim` (NOT this file) returns elapsed-time/claim-count to the model — handle the counter at the onebrain.ts wrapper level.

### `src/agents/coordinator.ts` (agent-orchestrator)

**Analog:** none (NET-NEW)

**Spec authority:** `02-AI-SPEC.md` §3 "Entry Point Pattern" lines 218-277 has the canonical `runCoordinatorTurn` signature with all three MCP servers, `allowedTools`, `agents` map, and hooks wired. The planner's plan should reference these line numbers and copy the structure verbatim. Key invariants:

- Coordinator's `allowedTools` MUST list ZERO `mcp__vault__*` entries (RESEARCH.md pitfall #8).
- `settingSources: ['./CLAUDE.md']` reads at process start, not per turn (RESEARCH.md pitfall #10) — `tsx watch` for dev hot-reload of CLAUDE.md.
- Iterate the SDK iterator with `for await`, not `Promise.all` (RESEARCH.md pitfall #16).

### `src/agents/definitions/research.ts` and `compilation.ts` (sub-agent-definitions)

**Analog:** none (NET-NEW)

**Spec authority:** `02-AI-SPEC.md` §3 lines 244-265 (the `agents: { research: { ... }, compilation: { ... } }` map) and §4b "Structured Outputs with Zod" lines 404-415 (research sub-agent + `outputSchema: ResearchOutputSchema` wiring). Schema lives in `src/onebrain/types.ts` per D-21 — the Phase 1 single-source-of-truth Zod convention.

**ResearchOutputSchema verbatim source:** `02-AI-SPEC.md` lines 386-401:

```ts
export const ContradictionRefSchema = z.object({
  existing_claim_id: z.string(),
  new_claim_id: z.string(),
  reason: z.string().max(280),
});

export const ResearchOutputSchema = z.object({
  summary: z.string().max(900, 'summary must be ≤ 150 words'),
  claim_ids_written: z.array(z.string()).max(10),
  notable_contradictions: z.array(ContradictionRefSchema).max(5),
  proposed_tags: z.object({
    topic: z.array(z.string()),
    framework: z.array(z.string()),
  }),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
```

This goes in `src/onebrain/types.ts` alongside the existing Phase 1 schemas — see `src/onebrain/types.ts:5-15` for the import + enum-first convention to follow.

### `src/server/index.ts` and `src/server/routes/*.ts` (Hono server + SSE routes)

**Analog:** none (Phase 1 had no HTTP surface)

**Spec authority:** `02-RESEARCH.md` §INFRA-04 lines 24-34 has the `streamSSE` route shape:

```ts
app.post('/chat', async (c) => streamSSE(c, async (stream) => {
  const { message } = await c.req.json();
  for await (const ev of runCoordinatorTurn(message)) {
    await stream.writeSSE({ data: JSON.stringify(adaptToUIMessageChunk(ev)) });
  }
}));
```

CLAUDE.md project conventions to honor:
- TS NodeNext + `@/*` paths require `.js` suffix on internal imports (carry-forward Phase 1 D-22; see every `import` in `src/onebrain/repo.ts:7-12` for the convention).
- pino logger from `src/lib/log.ts` (`logger.info({ ... }, 'msg')` shape — see `src/onebrain/repo.ts` and `src/compilation/runner.ts:43`).
- Open question OQ-3 (RESEARCH.md): verify Hono 4's `streamSSE` matches assistant-ui's expected SSE format at executor time; fall back to hand-rolled `c.body(stream)` if not.

### `src/cli/commands/serve.ts` (CLI handler)

**Analog:** `src/cli/commands/compile.ts`

**Existing thinnest-handler pattern** (`src/cli/commands/compile.ts:1-32`):

```ts
// src/cli/commands/compile.ts
// D-05: human-readable table by default; --json for machine output.

import { runCompile } from '@/compilation/runner.js';
import { logger } from '@/lib/log.js';

export interface CompileOptions {
  json?: boolean;
  verbose?: boolean;
}

export async function compile(opts: CompileOptions): Promise<void> {
  logger.info('compile started');
  const result = await runCompile();
  ...
}
```

**Apply to `src/cli/commands/serve.ts`:** thin wrapper that imports a `startServer()` from `src/server/index.ts` and calls it. Subcommand registered in `src/cli/index.ts` mirroring the `program.command('compile')...action(...)` pattern at `src/cli/index.ts:42-50` — note the `await import(...)` lazy-load discipline at `src/cli/index.ts:36-39` to keep `bsp --help` fast.

### `src/cli/index.ts` (MODIFY: add serve subcommand)

**Analog:** self (`src/cli/index.ts:42-50`)

**Existing subcommand registration** (`src/cli/index.ts:42-50`):

```ts
program
  .command('compile')
  .description('Render OneBrain rows into the Obsidian vault (D-13/D-14)')
  .option('--json', 'Emit JSON instead of human-readable text (D-05)')
  .option('-v, --verbose', 'Verbose output (D-05)')
  .action(async (opts) => {
    const { compile } = await import('./commands/compile.js');
    await compile(opts);
  });
```

**Apply:** add a `program.command('serve')...action(async () => { const { serve } = await import('./commands/serve.js'); await serve(); })` block. `--port` option with default `3000`. Lazy import preserves the "CLI entry should never eagerly load network clients" comment at `src/cli/index.ts:11-14`.

### `src/lib/env.ts` (MODIFY: add new keys)

**Analog:** self (`src/lib/env.ts:18-31`)

**Existing schema** (`src/lib/env.ts:18-31`):

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres:// URL'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD required'),
  PGADMIN_DEFAULT_EMAIL: z.string().optional(),
  PGADMIN_DEFAULT_PASSWORD: z.string().optional(),
  VOYAGE_API_KEY: z.string({
    message: 'VOYAGE_API_KEY required (get from https://www.voyageai.com/)',
  }),
  RUN_VOYAGE_TESTS: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});
```

**Apply:** add three keys per RESEARCH.md landmine #5:

```ts
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY required (get from https://console.anthropic.com/)'),
  TAVILY_API_KEY: z.string().min(1, 'TAVILY_API_KEY required (get from https://app.tavily.com/)'),
  PHOENIX_ENABLED: z.string().optional(),
  RUN_AGENT_TESTS: z.string().optional(),
  RUN_TAVILY_TESTS: z.string().optional(),
```

**Caveat (carry-forward from RESEARCH.md landmine #5):** `VOYAGE_API_KEY` allows empty for Phase 1 test ergonomics. `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` should require non-empty at `bsp serve` boot but NOT at unit-test load time (else unit tests need real keys). The pattern: keep `.min(1)` but document that Phase 2 unit tests must inject these in their `vi.mock` for env.

### `migrations/1700000000008_claims_text_fts.sql` (new migration)

**Analog:** `migrations/1700000000003_claims.sql`

The Phase 1 migrations are raw SQL files numbered with timestamp prefix (see `ls migrations/`). The new file follows the same numbering and uses raw SQL DDL.

**Spec authority for the SQL:** `02-RESEARCH.md` §DATA-09 line 37 — `CREATE INDEX claims_text_fts ON claims USING gin (to_tsvector('english', coalesce(text,'') || ' ' || coalesce(rationale,'')));`. Existing pgvector HNSW index (Phase 1 migration `1700000000003_claims.sql`) and tag GINs are reused unchanged.

---

### Tests — Pattern Assignments

### `tests/agents/coordinator-config.spec.ts` (static-membership unit test)

**Analog:** `tests/unit/repo.test.ts`

**Existing reflective-export pattern** (`tests/unit/repo.test.ts:54-60`):

```ts
describe('repo append-only API surface (DATA-06 — architectural keystone)', () => {
  it('exports no delete/remove/drop/destroy functions', () => {
    const exportNames = Object.keys(repo);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toMatch(/^(delete|remove|drop|destroy)/);
    }
  });
```

**Apply to `tests/agents/coordinator-config.spec.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { coordinatorAllowedTools, researchDef, compilationDef } from '@/agents/coordinator';

describe('coordinator + sub-agent tool allowlist (COMP-10 / Pitfall 5)', () => {
  it('coordinator does NOT have vault_write_atomic in allowedTools', () => {
    expect(coordinatorAllowedTools).not.toContain('mcp__vault__vault_write_atomic');
  });
  it('research sub-agent does NOT have vault_write_atomic in tools', () => {
    expect(researchDef.tools).not.toContain('mcp__vault__vault_write_atomic');
  });
  it('compilation sub-agent IS the sole holder of vault_write_atomic', () => {
    expect(compilationDef.tools).toContain('mcp__vault__vault_write_atomic');
  });
});
```

### `tests/agents/quantitative-claim-guard.spec.ts` (5-case AGENT-08 fixture test)

**Analog:** `tests/integration/append-only.test.ts`

**Existing throw-on-precondition pattern** (`tests/integration/append-only.test.ts:110-120`):

```ts
it('promoteClaimStatus requires existing evidence edge (CRIT-06)', async () => {
  const c = await repo.writeClaim({
    kind: 'hypothesis',
    text: 'TestClaim',
    confidence: 0.4,
    created_by: 'test',
  });
  await expect(
    repo.promoteClaimStatus(c.id, 'validated', '01J9X9999999999999999999XX'),
  ).rejects.toThrow(/does not exist/);
});
```

**Existing voyage-mock-at-top integration pattern** (`tests/integration/append-only.test.ts:5-12`):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import * as repo from '@/onebrain/repo';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

beforeEach(async () => {
  await resetSchemaAndMigrate();
});
```

**Apply to `tests/agents/quantitative-claim-guard.spec.ts`:** five `it()` cases per AI-SPEC dimension #2 (RESEARCH.md §AGENT-08 + AI-SPEC §5 row 2):
- (a) sourced ≥$1M → ok
- (b) unsourced ≥$1M → throws `QuantitativeClaimRequiresSourceError`
- (c) sub-million unsourced → ok (below noise floor)
- (d) TAM keyword unsourced → throws
- (e) forward-ref source (claim references source ULID not yet in OneBrain) → throws (this case lives in the wrapper layer, requires the agent-tool wrapper test)

Use the same `vi.mock('@/onebrain/embed')` + `resetSchemaAndMigrate()` setup. Fixtures live in `tests/fixtures/quantitative-claims.ts` (see "Fixture pattern" below).

### `tests/agents/recompile-roundtrip.spec.ts` (full-pipeline integration)

**Analog:** `tests/integration/pipeline.test.ts` (the Phase 1 keystone)

**Existing tmp-vault + tmp-cwd setup** (`tests/integration/pipeline.test.ts:51-67`):

```ts
beforeEach(async () => {
  origCwd = process.cwd();
  await resetSchemaAndMigrate();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-root-'));
  tmpVault = path.join(tmpRoot, 'vault');
  await fs.mkdir(tmpVault, { recursive: true });
  process.chdir(tmpRoot);
});

afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});
```

**Existing frontmatter-assertion pattern** (`tests/integration/pipeline.test.ts:142-178`):

```ts
const md = await fs.readFile(
  path.join(tmpVault, 'topics', 'strategic-positioning.md'),
  'utf-8',
);
const fm = matter(md).data;
const requiredKeys = [
  'id', 'kind', 'title', 'slug', 'generated_at', 'generated_by',
  'compile_run_id', 'content_hash', 'claim_ids', 'entity_ids',
  ...
];
for (const k of requiredKeys) {
  expect(fm, `frontmatter missing key '${k}'`).toHaveProperty(k);
}
```

**Apply to `tests/agents/recompile-roundtrip.spec.ts`:** seed OneBrain via the existing strategic-positioning fixture (or a smaller fixture seeded directly via `repo.writeClaim`/`writeSource`), fire the compilation sub-agent (stubbed Anthropic SDK or gated by `RUN_AGENT_TESTS=1`), then assert (a) `vault/topics/<slug>.md` exists, (b) frontmatter `claim_ids[]` ⊇ seeded ULIDs, (c) `compile_runs.error IS NULL`. Reuse the tmp-vault setup verbatim.

### `tests/onebrain/search-hybrid.spec.ts` (hybrid search probe)

**Analog:** `tests/integration/pipeline.test.ts` (fixture-seed-then-assert pattern)

**Apply:** import `searchClaims` from `@/onebrain/search`, seed via the strategic-positioning fixture, run a query like "operational effectiveness", assert the relevant claim ULID is in the top-5 result. Run three baselines (FTS-only, vector-only, weighted-sum) per RESEARCH.md §3.3 to record the weighting choice. Reuse `vi.mock('@/onebrain/embed')` so embeddings are deterministic per-test (or use a seeded mock that produces stable vectors — see `tests/integration/pipeline.test.ts:30-33` for the random-vector mock pattern that must be replaced for *this* test with a stable embed mock).

### `tests/agents/tavily.spec.ts` (gated real-API integration)

**Analog:** `tests/integration/voyage-live.test.ts` (gating pattern with `RUN_VOYAGE_TESTS=1`)

The Phase 1 voyage-live test is gated by an env flag; Phase 2 mirrors this with `RUN_TAVILY_TESTS=1`. The package.json adds a `test:tavily` script alongside the existing `test:voyage` (`package.json:14`).

**Apply:** when `process.env.RUN_TAVILY_TESTS !== '1'`, the test calls a stubbed Tavily client returning canned data. Gated runs hit the real `@tavily/core` client. Mirror `voyage-live.test.ts`'s describe/skip-if pattern.

### `tests/ui/app-shell.spec.tsx` (jsdom)

**Analog:** `tests/integration/ui-scaffold.test.tsx`

**Existing jsdom setup** (`tests/integration/ui-scaffold.test.tsx:14-27`):

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import App from '@/ui/App';

afterEach(() => cleanup());

describe('UI scaffold (INFRA-05, D-19)', () => {
  it('renders <h1>Business Strategy Planner</h1>', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Business Strategy Planner');
  });
```

**Apply to `tests/ui/app-shell.spec.tsx`:** same `@vitest-environment jsdom` directive, `@testing-library/react`, `cleanup()` afterEach. Assert composer textarea + Recompile button + status pill present (UI-SPEC component inventory). The Phase 2 vitest config will need a new `ui` project (jsdom env) — see "Vitest config addition" below.

### `tests/ui/recompile-button.spec.tsx`, `streaming.spec.tsx`, `slash-command.spec.tsx`

**Analog:** `tests/integration/ui-scaffold.test.tsx` (env + render shape only)

The Phase 1 ui-scaffold test is the only React test in the repo. Phase 2's UI tests reuse:
- `@vitest-environment jsdom` directive
- `@testing-library/react` `render` + `screen` + `cleanup`
- Path alias `@/ui/*` (already configured in `vitest.config.ts:13` AND `tsconfig.json` paths)

For mock-fetch (streaming, recompile-button) the test will need a vi.spyOn(global, 'fetch') and a mocked SSE event source — there's no in-repo analog; spec authority is `02-VALIDATION.md` lines 53-56 + RESEARCH.md §UI-02/UI-06.

### `src/lib/ngram-overlap.ts` (helper, pure)

**Analog:** `src/lib/tag-canonicalize.ts` (small pure-fn export)

**Apply:** single named export `ngramOverlap(a: string, b: string, n: number = 12): { maxOverlapTokens: number; matches: string[] }`. Pure function; no I/O. Used by `tests/agents/prose-smuggling.spec.ts` AND at runtime by `src/agents/coordinator-output-guard.ts` (per RESEARCH.md §6 guardrail #5 lines 580 — both consumers import the same helper).

### `tests/fixtures/quantitative-claims.ts` (typed fixture)

**Analog:** `src/cli/fixtures/strategic-positioning.ts`

**Existing typed-fixture export pattern** (`src/cli/fixtures/index.ts:13-29`):

```ts
export interface Fixture {
  slug: string;
  source: Omit<NewSource, 'id'>;
  entities: Array<Omit<NewEntity, 'id'> & { localId: string }>;
  claims: Array<Omit<NewClaim, 'id'> & { localId: string }>;
  edges: Array<{ ... }>;
}

export const FIXTURES = Object.freeze({
  'strategic-positioning': strategicPositioning,
} as const);
```

**Apply:** export an array of `(input: NewClaim, expected: 'accept' | 'reject', reason: string)` tuples — five cases for AGENT-08 dimension #2. This fixture lives under `tests/` (not under `src/cli/fixtures/`) because it's test-only — the Phase 1 fixtures are runtime-loadable via `bsp ingest --fixture`, and these are not.

### `tests/fixtures/sub-agent-stubs.ts` (stub fixture)

**Analog:** `tests/setup/voyage-mock.ts` (the simplest mock-shape pattern in the repo)

**Existing mock pattern** (`tests/setup/voyage-mock.ts`):

```ts
import { vi } from 'vitest';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));
```

**Apply to `tests/fixtures/sub-agent-stubs.ts`:** export schema-conformant + malformed `ResearchOutput`-shaped JSON blobs as named consts. Tests that need to mock the SDK's sub-agent invocation import these and inject them. (Distinct from the voyage-mock — that one is a `vi.mock` setup file; this is a fixture-data export. Same module-shape principle.)

---

## Shared Patterns

### Internal `.js` import suffix (NodeNext + paths)

**Source:** every `import` in `src/onebrain/repo.ts` (e.g., `:7-12`)

```ts
import { db } from './db.js';
import * as s from './schema.js';
import { embed } from './embed.js';
import { ulid } from './ids.js';
import { hashRawText } from '@/lib/hash.js';
import { canonicalizeTag } from '@/lib/tag-canonicalize.js';
```

**Apply to:** every Phase 2 source file (server, agents, tools, ui). Internal `@/*` imports MUST use `.js` suffix per Phase 1 D-22 / RESEARCH.md landmine #4. `tsconfig.json` paths (already configured for `@/server`, `@/agents`, `@/eval`) plus `vite.config.ts` aliases (also already configured) make this work at build, dev, and test time uniformly.

### Pino structured logging

**Source:** `src/lib/log.ts` + every consumer (e.g., `src/compilation/runner.ts:43`)

```ts
import { logger } from '@/lib/log.js';
...
logger.info({ runId, vaultPath }, 'compile started');
```

**Apply to:** all server routes, all agent tool implementations, the compilation/research/coordinator entry points. Phase 2 logging goes through this same pino logger — it has redact rules for API keys baked in (`src/lib/log.ts:8-25`).

### Zod schema in `src/onebrain/types.ts` (single source of truth)

**Source:** `src/onebrain/types.ts:1-5`

```ts
// src/onebrain/types.ts
// SINGLE SOURCE OF TRUTH for all OneBrain row types (D-21).
// Frontend, backend, agents, CLI, tests all import from this file.

import { z } from 'zod';
```

**Apply to:** Phase 2's `ResearchOutputSchema`, `ContradictionRefSchema`, `RecompileResultSchema` (etc.) all live in `src/onebrain/types.ts` alongside the existing schemas — NOT in a parallel `src/agents/types.ts`. This is D-21 carry-forward.

### Voyage mock at module top in integration tests

**Source:** `tests/integration/append-only.test.ts:5-12` and `tests/integration/pipeline.test.ts:30-33`

```ts
vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));
```

**Apply to:** every Phase 2 integration test that exercises `repo.writeClaim`/`writeSource` (which call `embed()` internally). The integration project does NOT register the unit-suite voyage-mock setup file — each test mocks at module top.

### Throwing typed errors from boundaries

**Source:** `src/onebrain/repo.ts:172-189` (`promoteClaimStatus`), and Phase 2 will add:
- `QuantitativeClaimRequiresSourceError` in `src/onebrain/repo.ts`
- `ToolPermissionDenied` in `src/agents/tools/vault.ts`

**Apply to:** every coercive boundary in Phase 2 throws a *named* Error subclass so consumers (agent tool wrappers, the coordinator-output-guard) can `catch` specifically. The Phase 1 baseline uses `new Error('CRIT-06: ...')`; Phase 2 evolves to subclasses because the agent layer needs structured rejection (the SDK surfaces error classes back to the model in tool-call errors).

### Fixture-seed-then-assert integration test shape

**Source:** `tests/integration/pipeline.test.ts:74-94`

```ts
it('ingest --fixture strategic-positioning writes 1 source + 7 claims + 10 edges + 2 entities', async () => {
  await ingest(undefined, { fixture: 'strategic-positioning' });

  const sources = await findAllSources();
  const claims = await findAllClaims();
  ...
  expect(sources).toHaveLength(1);
  expect(claims).toHaveLength(7);
});
```

**Apply to:** every Phase 2 integration test that needs OneBrain rows (recompile-roundtrip, search-hybrid, research-no-vault-write). Seed via `ingest()` for the existing fixture OR via direct `repo.writeClaim()` for ad-hoc data; assert via `findAll*()` readers.

### `RUN_*_TESTS` gating for live-API tests

**Source:** `tests/integration/voyage-live.test.ts` (gated by `RUN_VOYAGE_TESTS=1`) + the script `package.json:14` `"test:voyage": "RUN_VOYAGE_TESTS=1 vitest run tests/integration/voyage-live.test.ts"`

**Apply to:** Phase 2 adds `test:tavily` (`RUN_TAVILY_TESTS=1`), `test:agent` (`RUN_AGENT_TESTS=1`), and a `test:full` that sets all three. The pushback-substance test (`tests/agents/pushback-substance.spec.ts`) and the prose-smuggling test (`tests/agents/prose-smuggling.spec.ts`) are gated by `RUN_AGENT_TESTS=1` because they call real Opus.

### Vitest config — projects pattern

**Source:** `vitest.config.ts:11-44` (existing `unit` + `integration` projects)

```ts
projects: [
  {
    extends: true,
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['./tests/setup/voyage-mock.ts'],
    },
  },
  {
    extends: true,
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.{ts,tsx}'],
      testTimeout: 30000,
      fileParallelism: false,
    },
  },
],
```

**Apply:** Phase 2 adds two more projects per RESEARCH.md §"Test Framework" + VALIDATION.md "Config additions":
- `ui` — jsdom env, `include: ['tests/ui/**/*.spec.{ts,tsx}']`, no DB
- `agents` — node env, `include: ['tests/agents/**/*.spec.ts']`, `testTimeout: 60000`, `fileParallelism: false` (Postgres advisory-lock collision with `resetSchemaAndMigrate` per RESEARCH.md landmine #3)

### Dynamic-import lazy-load in CLI handlers

**Source:** `src/cli/index.ts:36-39`

```ts
.action(async (input: string | undefined, opts) => {
  const { ingest } = await import('./commands/ingest.js');
  await ingest(input, opts);
});
```

**Apply to:** the new `bsp serve` subcommand. Per the architectural note at `src/cli/index.ts:11-14`, the CLI entry should never eagerly load network clients (Anthropic SDK, Tavily SDK, pg.Pool) — `bsp --help` must stay fast. Wrap the serve handler import in `await import()` inside `.action()`.

### Atomic file write via tmp + rename

**Source:** `src/compilation/vault-writer.ts:31-36` (and `:8-29` for the hash-aware variant)

**Apply to:** any new file-writing code in Phase 2 that lands inside the vault MUST go through `writeAtomic` or `writeIfChanged` — and that path is *only* reachable via `runCompile()` invoked by `vault_write_atomic` tool invoked by the compilation sub-agent (single-writer enforcement). Phase 2 should not introduce new direct vault writers.

---

## No Analog Found (NET-NEW — use spec authority)

Files where no in-repo analog exists. The planner's plan should cite the listed spec section as the authority and copy the structure verbatim from there.

| File | Role | Spec Authority |
|------|------|----------------|
| `src/server/index.ts` | Hono bootstrap | `02-AI-SPEC.md` §3 "Recommended Project Structure" lines 305-327; STACK.md Hono 4 pin |
| `src/server/routes/chat.ts` | SSE chat route | `02-RESEARCH.md` §INFRA-04 lines 26-34 (verbatim `streamSSE` example); §3.2 streaming-pipeline lines 122-144 |
| `src/server/routes/recompile.ts` | SSE recompile route | `02-RESEARCH.md` §COMP-11 lines 90-91 |
| `src/server/routes/health.ts` | health probe | `02-RESEARCH.md` §INFRA-04 line 25 (`{ status, version, db_ok }`) |
| `src/server/streaming.ts` | SDK→UIMessageChunk adapter | `02-RESEARCH.md` §3.2 lines 124-138 (5 event-mapping rules); `02-AI-SPEC.md` Common Pitfalls #8 line 300 |
| `src/agents/coordinator.ts` | top-level Agent SDK invocation | `02-AI-SPEC.md` §3 "Entry Point Pattern" lines 218-277 (full `runCoordinatorTurn` example) |
| `src/agents/coordinator-output-guard.ts` | n-gram-overlap output filter | `02-AI-SPEC.md` §6 guardrail #5 line 580 |
| `src/agents/definitions/research.ts` | research sub-agent definition | `02-AI-SPEC.md` §3 lines 244-255 + §4b lines 404-415 |
| `src/agents/definitions/compilation.ts` | compilation sub-agent definition | `02-AI-SPEC.md` §3 lines 256-265; `02-RESEARCH.md` §AGENT-06 lines 45-46 |
| `src/agents/prompts/research.md` | research sub-agent system prompt | `02-RESEARCH.md` §AGENT-02 line 43 (role + JSON shape + tool palette + hard stops + forbidden behaviors); D-04 + D-01 + D-05 + D-06 |
| `src/lib/tracing.ts` | OpenTelemetry → Phoenix wiring | `02-AI-SPEC.md` §5 lines 508-520 (verbatim NodeSDK setup); §7 line 604; opt-in via `PHOENIX_ENABLED=1` |
| `src/ui/App.tsx` (replacement) | assistant-ui Thread + Composer | `02-UI-SPEC.md` §"Component Inventory" #1 lines 146-152; §"Source Map" |
| `src/ui/runtime.ts` | `AssistantChatTransport` config | `02-RESEARCH.md` §UI-01 line 55; STACK.md `@assistant-ui/react-ai-sdk` |
| `src/ui/components/HeaderBar.tsx` | header bar shell | `02-UI-SPEC.md` §"Component Inventory" #2 lines 154-159 |
| `src/ui/components/RecompileButton.tsx` | recompile primary CTA | `02-UI-SPEC.md` §"Component Inventory" #3 lines 161-167; §"Copywriting Contract" |
| `src/ui/components/RecompileStatus.tsx` | status pill | `02-UI-SPEC.md` §"Component Inventory" #4 lines 169-173; §IC-4 |
| `src/ui/components/ToolTrace.tsx` | tool-call trace | `02-UI-SPEC.md` §"Component Inventory" #5 lines 175-181; §IC-3; D-11/D-12 |
| `src/ui/components/WikiCitation.tsx` | wiki-chunk + Obsidian deeplink | `02-UI-SPEC.md` §"Component Inventory" #6 lines 183-188; D-13/D-14 |
| `tests/server/chat-sse.spec.ts` | SSE-stream integration test | `02-VALIDATION.md` table row INFRA-04; Hono `app.request()` per Hono 4 docs (executor verifies at install) |
| `tests/agents/prose-smuggling.spec.ts` | n-gram overlap probe | `02-AI-SPEC.md` §5 dimension #3 + the helper at `src/lib/ngram-overlap.ts` |
| `tests/agents/pushback-substance.spec.ts` | CRIT-01 token-set probe (pre-gate) | `02-AI-SPEC.md` §5 dimension #4 + `02-VALIDATION.md` row CRIT-01 (3 token sets); the LLM-judge full rubric is hand-graded against `.planning/eval/phase2-reference-dataset.{md,json}` (Phase 4 mechanizes via Promptfoo) |
| `.planning/eval/phase2-reference-dataset.{md,json}` | 15-example reference dataset | `02-AI-SPEC.md` §5 "Reference Dataset" lines 540-558 (table of 15 scenarios verbatim) |
| `.planning/eval/pushback-rubric.md` | LLM-judge rubric | `02-AI-SPEC.md` §5 dimension #4 row + `02-RESEARCH.md` §CRIT-01 |

---

## Metadata

**Analog search scope:** `src/`, `tests/`, `migrations/`, `vitest.config.ts`, `vite.config.ts`, `tsconfig.json`, `package.json`, `.env.example`
**Files scanned:** 25 (8 src, 12 tests, 7 migrations, 5 config) — focused on the high-yield analogs per CLAUDE.md "Phase 1 already shipped" map; did not exhaustively read every `src/compilation/render/*.ts` since the Phase 2 compilation sub-agent does not touch the renderers (Phase 1 D-13/D-15 carry-forward).
**Pattern extraction date:** 2026-04-26
**Context preserved by:** stopping search at strong matches — repo.ts (CRUD analog), compile.ts (CLI handler analog), pipeline.test.ts (integration analog), ui-scaffold.test.tsx (jsdom analog), tag-canonicalize.ts (pure-utility analog), embed.ts (singleton-client analog) cover ≥30 of the 50 new/modified files between them.

**Carry-forward landmines for the planner to surface in plan files:**
1. `voyageai@0.2.1` ESM broken — `createRequire` workaround in `embed.ts`. Verify `@tavily/core`, `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk` ESM-cleanness at install (RESEARCH.md landmines #1, #12, #13).
2. `commander` rejects `-vv` short flag — use `--very-verbose` long form.
3. Vitest integration project requires `fileParallelism: false` (advisory-lock collision); same applies to the new `agents` project.
4. Internal `@/*` imports MUST use `.js` suffix.
5. `env.ts` allows empty `VOYAGE_API_KEY`; Phase 2 must require non-empty `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` at `bsp serve` boot but not at unit-test time.
6. Pin `@anthropic-ai/claude-agent-sdk` exact (`0.2.x` per STACK.md; 0.x churn).
7. MCP tool naming in `allowedTools`/`tools[]` MUST be the full `mcp__<server>__<tool>` form — typos silently disable the tool.
8. The single most likely architectural break: the coordinator inheriting `vault_write_atomic` "to be safe." Static-membership test in `tests/agents/coordinator-config.spec.ts` is the load-bearing prevention.
