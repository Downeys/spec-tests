# Phase 1: Walking Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 01-walking-skeleton
**Areas discussed:** A. CLI shape, B. Source → claims extraction, C. Demo page target, D. Frontend skeleton + project structure + dev workflow

---

## A. CLI shape & round-trip ergonomics

### A0. CLI longevity / role across phases

| Option | Description | Selected |
|--------|-------------|----------|
| X | Phase-1-only test harness — CLI is scaffolding, deleted in Phase 2 when HTTP routes land | |
| Y | Thin wrapper over shared lib code — same functions called by HTTP routes (Phase 2+) and agent tools (Phase 4+); CLI persists for dev/bulk/scripts/backup/`--full` recompile | ✓ |
| Z | CLI also becomes power-user / headless surface (e.g., `bsp run "research X"` boots coordinator headlessly) — useful for Promptfoo + CI | |

**User's choice:** Y
**Notes:** User asked the trajectory question explicitly ("How is this going to be driven after stage 1? Is this setup purely for testing in stage 1?"). This question reshaped A1 — once Y is chosen, the single-binary-with-subcommands approach becomes the right investment.

### A1. Command structure & invocation

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Single binary with subcommands (`bsp ingest` / `bsp compile` / etc.) at `src/cli/index.ts`, exposed via `package.json` `bin` | ✓ |
| 2 | npm scripts only — no binary; `npm run ingest -- <url>` etc. | |
| 3 | Standalone executables per command — separate `tsx` scripts, no router | |

**User's choice:** 1
**Notes:** Locked once trajectory Y was chosen.

### A1.1. Binary name

| Option | Description | Selected |
|--------|-------------|----------|
| bsp | Business Strategy Planner; short, project-coded | ✓ |
| briefcase | Evocative, memorable; longer to type | |
| onebrain | Names the data layer; could confuse later | |
| Other | User-defined | |

**User's choice:** bsp
**Notes:** "I like briefcase. It's really nice, but I think it's taken. I looked through quite a few alternatives, but all the good ones seem to be taken. Let's just go with bsp."

### A1.2. Subcommand router library

| Option | Description | Selected |
|--------|-------------|----------|
| commander | Dominant Node CLI library, well-typed, mature | ✓ |
| cac | Lighter, similar API; less ubiquitous | |
| Native `process.argv` | Fine for ≤3 commands; will hurt at 5+ | |
| Claude's discretion | Pick during planning | |

**User's choice:** commander
**Notes:** —

### A2. Re-ingest behavior on duplicate `raw_text_hash`

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Skip & report — exit 0, print "already ingested as `<id>` on `<date>`"; no new row, no Voyage call | ✓ |
| 2 | Error & exit non-zero — let unique-violation surface | |
| 3 | `--force` flag — would create a new row with same hash, breaking unique index (effectively a non-starter) | |
| 4 | Fingerprint-aware update — supersede source via edges (adds Phase 1 scope; not required by v1) | |

**User's choice:** 1
**Notes:** —

### A3. Output format & verbosity defaults

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Human-readable table by default; `--json` for machine output; `-v` / `-vv` for verbosity | ✓ |
| 2 | JSON-only output | |
| 3 | Silent on success, verbose on `-v` | |

**User's choice:** 1
**Notes:** —

### A4. DB + seed subcommands

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | `bsp db migrate` + `bsp db seed` | |
| 2 | `npm run migrate` / `npm run seed`; CLI focuses on ingest/compile only | |
| 3 | `bsp db migrate` only; fixtures invoked via `bsp ingest --fixture <name>` | ✓ |

**User's choice:** 3
**Notes:** One mental model — ingest. The `--fixture` flag is the seed-data path.

---

## B. Source → claims extraction without agents

### B1. Extraction strategy for Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Test-fixture only — URL/file paths stub-out claim extraction; only `bsp ingest --fixture` produces real claims | ✓ |
| 2 | Deterministic chunking — paragraph-or-N-tokens → claim row; no LLM | |
| 3 | Direct Anthropic SDK call — one-shot LLM extraction (INFRA-07 has the API key) | |
| 4 | Hybrid — fixture + deterministic chunks (no LLM) | |

**User's choice:** 1
**Notes:** "1 sounds good. Yeah, we can curate a fixture from a real world article for maximum realism." User confirmed real-world-article approach over synthetic fixture.

### B2. Fixture file format & location

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | TypeScript module at `src/cli/fixtures/<slug>.ts` exporting typed object | ✓ |
| 2 | JSON file at `fixtures/<slug>.json` | |
| 3 | Markdown with YAML frontmatter at `fixtures/<slug>.md` | |
| 4 | Plain text + sidecar JSON | |

**User's choice:** 1
**Notes:** —

### B3. Stub behavior for non-fixture URLs/files

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Reject with helpful error pointing to Phase 2 (research sub-agent); no schema landfill | ✓ |
| 2 | Accept + write source row + placeholder claim | |
| 3 | Accept source only, no claim row (violates success criterion #2) | |

**User's choice:** 1
**Notes:** —

### B4. Fixture content shape

| Option | Description | Selected |
|--------|-------------|----------|
| As proposed | 1 source + 6–8 claims (varied kind/confidence) + 6–8 cites_source + 1 contradicts + 2–3 entities + about_entity edges + real topic_tags + framework_tags | ✓ |

**User's choice:** Approved
**Notes:** —

### B5. Voyage embedding handling for fixture claims

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Live Voyage call at ingest — fixture defines text only, embedding generated on insert; mockable seam for unit tests | ✓ |
| 2 | Pre-computed embeddings in fixture file — zero API calls at ingest, regenerate on text change | |
| 3 | Stub embedding in fixture, real Voyage in tests gated by `RUN_VOYAGE_TESTS=1` | |

**User's choice:** 1
**Notes:** Mock seam comes via `vi.mock()` in unit tests; one integration test runs against real Voyage gated by env var.

---

## C. The "one rendered page" demo target

### C1. Demo page kind

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Generic topic page at `vault/topics/<demo-slug>.md` — natural, no scope creep | ✓ |
| 2 | Framework-shaped page (e.g., `frameworks/swot.md`) — Phase 5 owns 11 framework renderers; risk of premature templating | |
| 3 | Entity page at `vault/entities/<entity-slug>.md` — works only for entity-heavy fixtures | |
| 4 | All applicable kinds (topic + entity per entity + sources stub per source) — multiplies Phase 1 scope | |

**User's choice:** 1
**Notes:** —

### C2. Phase 1 renderer scope

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Demo page kind + index.md + log.md only; other renderers are placeholders / `NotImplementedError` | ✓ |
| 2 | Demo page + sources stub per source row + index + log | |
| 3 | All page kinds with stub renderers (topic, entity, source-stub, decision, framework) | |

**User's choice:** 1
**Notes:** —

### C3. Page rendering shape (no LLM intros — those land in COMP-06, Phase 3)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Grouped by `topic_tag`, claims listed in stable ULID order; contradicting pairs as Obsidian callouts inline | ✓ |
| 2 | Flat list, ULID order, contradictions at top | |
| 3 | Grouped by `kind` (fact / inference / hypothesis) | |
| 4 | Confidence-bucketed (high / medium / low) | |

**User's choice:** 1
**Notes:** "I don't love this last one but it makes sense based on the scope of this phase. 1 is acceptable as long as we have a clean way of removing those test files later." This concern triggered the C4 cleanup-story discussion.

### C4. Cleanup story for fixture/demo data (raised by user during C3 review)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | `bsp db reset --confirm` as explicit dev operation — drops schema, re-migrates, clears vault. Append-only invariants govern *live* DB writes; reset is meta. | ✓ |
| 2 | Plan/workspace separation from start (leverage `claims.business_plan_id`) | |
| 3 | Separate dev DB + dev vault via `BSP_ENV=dev` | |
| 4 | Accept demo residue as historical record (pure append-only) | |

**User's choice:** 1
**Notes:** "I agree with your read, option 1." Adds a 4th Phase 1 subcommand: `bsp db reset --confirm`. Captures the reframing: append-only governs row-level writes within a live DB, not meta-operations on the DB itself (analogous to `git reset --hard` not violating commit immutability).

---

## D. Frontend skeleton + project structure + dev workflow

### D1. Frontend skeleton scope (INFRA-05)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Minimal Vite app — `<h1>` placeholder + Vite config; React 19 deps installed | ✓ |
| 2 | Skeleton with route stubs (react-router) primed for Phase 2 | |
| 3 | Just Vite config; no UI components yet | |

**User's choice:** 1
**Notes:** —

### D2. Project structure — single root vs workspaces

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Single root `package.json` per ARCHITECTURE.md diagram; shared-types discipline via path aliases | ✓ |
| 2 | pnpm workspaces with `apps/cli`, `apps/server`, `apps/web`, `packages/onebrain` | |

**User's choice:** 1 (after pushback)
**Notes:** User initially leaned toward 2 for shared types: "I would think the workspace's shared types would benefit our architechture if we're builing a frontent to consume the backend - unless you have a good reason to keep them separate then let's go with 2." Claude pushed back with: shared types are achievable via TypeScript path aliases without workspace ceremony; cited industry pattern (Next.js, Remix, T3 stack) of using path aliases not workspaces; named concrete workspace costs (build orchestration, multiple package.jsons, daily friction); flagged that ARCHITECTURE.md's diagram already commits to single-root and that the choice is reversible later if OneBrain ever extracts as a published library. User accepted: "Ok, good feedback. Thanks. D2.1 it is." Companion commitment: shared-types discipline (`src/onebrain/types.ts` as single source of truth + path aliases mirrored in vite.config.ts) locked alongside.

### D3. Dev workflow — npm scripts in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Minimal: `npm test` runs Vitest; `npm run migrate` aliases migration runner; `npm run dev` runs Vite (optional) | ✓ |
| 2 | Concurrently: vite + (later) hono in dev — `npm run dev` parallelizes both | |
| 3 | No npm scripts; CLI-only | |

**User's choice:** 1
**Notes:** Phase 2 picks up the parallel-dev story when Hono server arrives.

### D4. Lint / format toolchain

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Biome — single tool for lint + format, fast, minimal config | |
| 2 | ESLint + Prettier — industry standard, more configurable | ✓ |
| 3 | Just Prettier; no linter | |
| 4 | Claude's discretion | |

**User's choice:** 2
**Notes:** Sets precedent for all later phases.

---

## Claude's Discretion

Decisions delegated to the planner/executor within the bounds of the locked decisions:

- The specific real-world article chosen for the fixture (must satisfy: contains naturally-contradicting positions on at least one point; publicly accessible URL; topic maps cleanly to `topic_tags`/`framework_tags`)
- Exact `commander` command/option layout within its idioms
- Exact ESLint config (preset choice — likely `recommended-type-checked` + plugins for React + TS) and Prettier config (line width, quotes)
- Exact tsconfig paths shape and extension keys
- Postgres connection pooling strategy (likely `pg.Pool` via Drizzle's `node-postgres` adapter)
- Drizzle schema-mirror file shape (must mirror migrations 1:1; review process is a planner concern)
- ULID generation library choice (`ulid` npm package is the obvious pick)
- Vault page rendering nuances (callout spacing, exact `>` quote formatting, optional status-legend footer)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Highlights:

- Plan/workspace separation (multi-plan support) — schema's `business_plan_id` column already nullable; UX deferred to v2+
- Direct Anthropic SDK extraction in CLI — replaced by research/ingest sub-agents in Phase 2/4
- Deterministic chunking → claims — non-starter for Phase 1; could return as `bsp ingest --chunked` if a no-API smoke path is ever needed
- Framework-shaped page renderers (SWOT/STP/4Ps/Porter/etc.) — Phase 5
- Source / entity / decision page renderers — Phase 2/3 as data accumulates
- LLM intros / connective prose (COMP-06) — Phase 3
- Diff-based recompile (COMP-08), node-cron schedule (COMP-12), source-added debounce (COMP-13), human-edit guard (COMP-14), paired backup (COMP-15) — Phase 3
- Hono server, chat UI, agents — Phase 2
- Promptfoo evals (EVAL-02/03) — Phase 4
- pnpm workspaces — reversible if OneBrain ever extracts as a published library
- Headless Obsidian visual regression — v2+ if a harness emerges
