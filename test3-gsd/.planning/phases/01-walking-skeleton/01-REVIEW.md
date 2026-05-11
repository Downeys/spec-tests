---
phase: 01-walking-skeleton
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 56
files_reviewed_list:
  - .env.example
  - .gitignore
  - .prettierrc.json
  - README.md
  - docker-compose.yml
  - drizzle.config.ts
  - eslint.config.js
  - migrations/1700000000000_pgvector_extension.sql
  - migrations/1700000000001_enums.sql
  - migrations/1700000000002_sources.sql
  - migrations/1700000000003_claims.sql
  - migrations/1700000000004_entities.sql
  - migrations/1700000000005_edges.sql
  - migrations/1700000000006_decisions_tags_event_log.sql
  - migrations/1700000000007_compile_runs_artifacts.sql
  - package.json
  - src/cli/commands/compile.ts
  - src/cli/commands/db-migrate.ts
  - src/cli/commands/db-reset.ts
  - src/cli/commands/ingest.ts
  - src/cli/fixtures/index.ts
  - src/cli/fixtures/strategic-positioning.ts
  - src/cli/index.ts
  - src/compilation/render/claim-block.ts
  - src/compilation/render/contradiction.ts
  - src/compilation/render/frontmatter.ts
  - src/compilation/render/index-md.ts
  - src/compilation/render/log-md.ts
  - src/compilation/render/topic-page.ts
  - src/compilation/runner.ts
  - src/compilation/vault-writer.ts
  - src/lib/env.ts
  - src/lib/hash.ts
  - src/lib/log.ts
  - src/lib/tag-canonicalize.ts
  - src/onebrain/db.ts
  - src/onebrain/embed.ts
  - src/onebrain/ids.ts
  - src/onebrain/repo.ts
  - src/onebrain/schema.ts
  - src/onebrain/types.ts
  - src/ui/App.tsx
  - src/ui/index.html
  - src/ui/main.tsx
  - tests/integration/append-only.test.ts
  - tests/integration/eval-meta.test.ts
  - tests/integration/hash-stability.test.ts
  - tests/integration/pipeline.test.ts
  - tests/integration/reingest-skip.test.ts
  - tests/integration/schema-parity.test.ts
  - tests/integration/schema-shape.test.ts
  - tests/integration/ui-scaffold.test.tsx
  - tests/integration/voyage-live.test.ts
  - tests/setup/db-setup.ts
  - tests/setup/voyage-mock.ts
  - tsconfig.json
  - tsconfig.node.json
  - tsconfig.web.json
  - vite.config.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-04-26
**Depth:** standard
**Files Reviewed:** 56 (plus all 17 unit test files; see body)
**Status:** issues_found (2 warnings, 4 info — no critical findings)

## Summary

The walking-skeleton phase is in strong shape. The seven hard architectural commitments (write directionality, append-only OneBrain, ULID identity, hypothesis-by-default, contradictions preserved, provenance, schema source-of-truth) are all observably enforced — both by the code and by dedicated integration tests (`append-only.test.ts`, `pipeline.test.ts`, `hash-stability.test.ts`, `schema-shape.test.ts`, `schema-parity.test.ts`). Security mitigations from the plan (P19 .env handling, P21 pgAdmin loopback bind, T-01-05 ESLint raw-SQL guard, D-08 ingest allowlist, fixture path-traversal hardening) are all intact and verified.

Specific verifications performed:
- `repo.ts` exports zero `delete*`/`remove*`/`drop*`/`destroy*` functions (commitment #3 — verified by grep AND by `tests/unit/repo.test.ts` reflective assertion).
- No raw `sql\`...\`` interpolation found in `src/onebrain/repo.ts`. The `sql\`...\`` usages in `src/onebrain/schema.ts` are all static literals (`'{}'::jsonb`, `'{}'::text[]`) for column defaults, which the ESLint rule's `Expression` selector correctly does not match.
- `docker-compose.yml` uses `${POSTGRES_PASSWORD}` / `${PGADMIN_DEFAULT_EMAIL}` / `${PGADMIN_DEFAULT_PASSWORD}` interpolation — no literal credentials (P19).
- `.env` is in `.gitignore`; `.env.example` ships placeholders only (P19).
- pgAdmin port binding is `127.0.0.1:5050:80` (P21 — loopback only).
- Fixture allowlist (`src/cli/fixtures/index.ts`) uses `Object.freeze` + `Object.prototype.hasOwnProperty.call` for the lookup, which correctly defeats prototype-chain attacks and rejects path-traversal strings as "unknown fixture" (`tests/unit/cli-fixture-allowlist.test.ts` covers `../../../etc/passwd`).
- CLI `ingest` rejects bare URL/file input per D-08 (`tests/unit/cli-ingest-rejects-bare-input.test.ts`).
- `npm run db:push` is the FORBIDDEN trap (exits 1) per P4 (`tests/integration/schema-parity.test.ts`).
- `process.exit` paths in CLI handlers are followed by defensive `return;` (dead but harmless).
- No `eval`, `innerHTML`, `dangerouslySetInnerHTML`, or hardcoded credentials anywhere in `src/`.
- `child_process.spawnSync` invocations use array-form arguments (no shell injection from interpolation).

The two Warnings below identify integrity gaps that don't violate Phase 1 success criteria but will become real risks in Phase 2/3 once external callers (research sub-agent, compilation sub-agent, chat handler) start hitting `repo.writeClaim` directly. The Info items are minor.

## Warnings

### WR-01: NewClaimSchema accepts `status: 'superseded'` (or any other terminal status) directly, bypassing the supersede flow

**File:** `src/onebrain/types.ts:127` and `src/onebrain/repo.ts:95`
**Issue:** `NewClaimSchema.status` is `ClaimStatusSchema.default('hypothesis')`, which permits **all five** statuses including `superseded`, `validated`, and `refuted`. In `writeClaim`, the explicit value is preserved (`validated.status ?? 'hypothesis'`). This means any caller can mint a fresh claim row with `status: 'superseded'` — no `superseded_by` pointer, no `supersedes` edge, no audit trail. The same hole applies to `validated`/`refuted`: those should only be reachable through `promoteClaimStatus` (which enforces the CRIT-06 evidence-edge requirement). The `default('hypothesis')` is doing belt-and-suspenders work for the omission case but does not constrain what an explicit caller can pass.

This is a *future*-tense risk, not a present-tense bug — the only `writeClaim` caller in Phase 1 is `cli/commands/ingest.ts`, which loads from the trusted fixture registry. But Phase 2 will wire `writeClaim` to a research sub-agent over the agent-tool boundary; if the agent's tool schema accepts `status` as an enum, the agent can write a "pre-superseded" claim and the audit trail breaks. Commitment #5 (hypothesis by default) and #3 (append-only — supersede via edges) are both compromised.

**Fix:** Restrict `NewClaimSchema.status` at the boundary so only writable values are accepted on insert:
```ts
// src/onebrain/types.ts
export const NewClaimSchema = z.object({
  kind: ClaimKindSchema,
  // Inserted claims may only START as hypothesis. tested/validated/refuted
  // require an evidence edge (CRIT-06, promoteClaimStatus); superseded is
  // only set transitively by supersede(). Constrain at the schema boundary
  // so an agent cannot mint a row in a terminal state.
  status: z.literal('hypothesis').default('hypothesis'),
  // ...rest unchanged
});
```
Or, if optional flexibility is desired for tooling, narrow to a writable subset: `z.enum(['hypothesis']).default('hypothesis')`. The repo-layer belt at `repo.ts:95` should keep using `validated.status ?? 'hypothesis'` as defense-in-depth.

---

### WR-02: Vault file writes occur outside the compilation sub-agent boundary

**File:** `src/cli/commands/ingest.ts:14, 162-167` (calls `appendLogEntry`); `src/cli/commands/db-reset.ts:9, 65` (calls `resetLog`); `src/compilation/render/log-md.ts:16-26` (`appendLogEntry` is the writer)
**Issue:** Architectural commitment #2 in `CLAUDE.md` says "only the compilation sub-agent has `vault_write_atomic`. Other agents are rejected at the tool layer." Today, `src/cli/commands/ingest.ts` directly imports `appendLogEntry` from `src/compilation/render/log-md.ts` and writes to `vault/log.md`, and `src/cli/commands/db-reset.ts` deletes `vault/topics/*.md`, `vault/index.md`, and calls `resetLog` to delete `vault/log.md`. There is no tool-layer gate between the CLI and the file-system writes — both are plain in-process function calls.

D-17 explicitly authorizes `log.md` writes from `ingest`, `compile`, and `reset`, so this is a deliberate Phase 1 design choice. But the structural separation that commitment #2 demands (rejection at the tool layer) is **not** implemented anywhere — `vault-writer.ts`, `log-md.ts`, and the `fs.unlink` calls in `db-reset.ts` are equally accessible to any module that imports them. When Phase 2/3 introduces agents with tool calls, the existing import graph will not stop a non-compilation agent from `import { writeAtomic } from '@/compilation/vault-writer'` and writing the vault directly.

Two distinct issues here:
1. **`db-reset.ts:50-65` performs vault `fs.unlink` calls of its own (not via any vault-writer abstraction).** Even if `vault-writer.ts` later becomes a guarded surface, db-reset bypasses it. That code should live in a single place.
2. **The "single writer" boundary is currently a comment-and-convention, not a code mechanism.** No file enforces it.

**Fix:** Two-part. Both can wait for Phase 2 if the team agrees this is documented intent for Phase 1; if shipping today, do (a):

(a) Consolidate all vault-mutating operations behind `src/compilation/vault-writer.ts` (rename to e.g. `vault-io.ts`) so there is exactly one module the rest of the codebase imports from. Move `appendLogEntry` / `resetLog` / the `db-reset` `unlink` loop into that module:
```ts
// src/compilation/vault-io.ts (consolidated)
export async function writeAtomic(filePath: string, content: string): Promise<void> { /* existing */ }
export async function writeIfChanged(filePath: string, markdown: string, expectedHash: string): Promise<{ written: boolean }> { /* existing */ }
export async function appendLogEntry(vaultPath: string, kind: LogKind, summary: string, when?: Date): Promise<void> { /* moved from log-md.ts */ }
export async function resetVaultArtifacts(vaultPath: string): Promise<void> {
  // single canonical reset path: topics/*.md + index.md + log.md
}
```

(b) When agent tool wiring lands in Phase 2, expose `vault-io.ts` only through the compilation sub-agent's tool registry; the research/chat agents get NO import of this module. Encode as an ESLint `no-restricted-imports` rule scoped to `src/agents/**` non-compilation paths.

## Info

### IN-01: Implicit `process.cwd()` dependency for vault path

**File:** `src/cli/commands/ingest.ts:162`; `src/cli/commands/db-reset.ts:48`; `src/compilation/runner.ts:39`
**Issue:** Three independent call sites use `path.resolve(process.cwd(), 'vault')` to locate the vault directory. If a user runs `bsp` from a directory other than the project root, the CLI silently creates `vault/` in their cwd instead of erroring. This makes "lost log entries" or unintentional directory creation possible. Tests guard against this by `process.chdir(tmpRoot)` in `beforeEach`, so it's invisible in CI.
**Fix:** Resolve once in a single `getVaultPath()` helper that either (a) reads from `BSP_VAULT_PATH` env, falling back to `process.cwd()/vault`, or (b) walks up from `process.cwd()` looking for a marker file (`package.json` with `name: "business-strategy-planner"`) to anchor the project root. Keep behavior identical to today by default, but make the dependency explicit in one place.

### IN-02: Repeated `as unknown as Claim/Source/Entity/Edge` double-cast pattern bypasses TS structural checking

**File:** `src/onebrain/repo.ts:34, 213, 232, 267, 279, 283`
**Issue:** Six `as unknown as <Type>` casts paper over a real impedance mismatch: Drizzle returns `confidence`/`weight` as strings (Postgres `numeric`), while the Zod-derived `Claim`/`Edge` types declare them as `number`. The cast pattern hides the mismatch and means a future schema change (e.g., adding a non-null DB column not present in the Zod type) will compile cleanly but produce runtime-broken rows. `rowToClaim` does the right thing for `confidence` but `rowToSource` returns `row as unknown as Source` with no transformation, even though `Source` schemas declare `embedding: z.array(z.number()).length(1024).nullable()` and Drizzle's `customType.fromDriver` produces `number[]` — close, but the runtime check is gone.
**Fix:** Either (a) parse outputs through the Zod schemas (`SourceSchema.parse(row)`) so the type is verified at the boundary instead of asserted, or (b) define explicit `dbRowToSource(row)`/`dbRowToEdge(row)` mappers analogous to `rowToClaim` that perform every needed coercion. (a) is safer; the cost is one Zod parse per row read, which for read-all queries is negligible compared to the embedding column transfer.

### IN-03: `renderClaimBlock` is unused outside its own unit test

**File:** `src/compilation/render/claim-block.ts:6-12`
**Issue:** `renderClaimBlock(claim, _sources)` is exported and tested (`tests/unit/claim-block.test.ts`) but never called by production code — `topic-page.ts` uses `renderClaimBlockWithSources` exclusively. The `_sources` parameter is unused (only there to match a pre-cleanup signature). It's not strictly dead code (the test is real), but the function exists only to be tested.
**Fix:** Either remove `renderClaimBlock` and the corresponding tests if the no-sources rendering path is genuinely unused, or call it from somewhere in `topic-page.ts` for claims with zero `cites_source` edges (today `renderClaimBlockWithSources` is always used and emits no "sources:" line when the array is empty, which makes `renderClaimBlock` redundant). Recommend deletion.

### IN-04: Ingest's polymorphic edge-loop assigns `toTable` after the conditional but TypeScript cannot prove definite assignment in all branches

**File:** `src/cli/commands/ingest.ts:130-147`
**Issue:** `let toTable: 'sources' | 'claims' | 'entities';` is declared without an initializer; the value is assigned inside an `if/else if/else` chain. The chain exhaustively covers `e.toLocalRef.kind === 'source' | 'claim' | 'entity'` (the type literally enumerates those three), but if the type definition ever broadens (e.g., adding `'decision'`), the `else` branch silently sets `toTable = 'entities'` for the new kind — a wrong assignment. The current code compiles only because `Fixture.edges[*].toLocalRef.kind` is the closed `'source' | 'entity' | 'claim'` literal union.
**Fix:** Use a switch with an exhaustiveness check instead of the `if/else if/else` chain:
```ts
let toId: string | undefined;
let toTable: 'sources' | 'claims' | 'entities';
switch (e.toLocalRef.kind) {
  case 'source':
    toId = source.id; toTable = 'sources'; break;
  case 'claim':
    toId = claimIdMap.get(e.toLocalRef.localId); toTable = 'claims'; break;
  case 'entity':
    toId = entityIdMap.get(e.toLocalRef.localId); toTable = 'entities'; break;
  default: {
    const _exhaustive: never = e.toLocalRef.kind;
    throw new Error(`unknown toLocalRef.kind: ${_exhaustive}`);
  }
}
```
The `never`-typed default branch makes any future `kind` extension a compile error rather than a silent miscategorization.

---

_Reviewed: 2026-04-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
