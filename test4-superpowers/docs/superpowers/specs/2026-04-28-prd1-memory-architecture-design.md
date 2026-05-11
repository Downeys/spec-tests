# PRD 1 — Memory Architecture (Hybrid OpenBrain + Karpathy Wiki)

**Project:** business-plan-builder
**Date:** 2026-04-28
**Status:** Draft for review

---

## 1. Context

### 1.1 What this PRD covers

The memory layer for an AI-assisted business-plan tool. It builds:

- **OpenBrain** — a Postgres-backed structured store of all research, claims, and provenance. The durable source of truth, query-time synthesis.
- **A Karpathy-style wiki vault** — a markdown directory in the project repo, generated from OpenBrain by a compilation agent, read by the user primarily through Obsidian.
- **A compilation agent** — deterministic templating that turns OpenBrain state into vault pages.
- **A dev CLI** — for ingesting, tagging, querying, compiling, linting, and resetting during development.
- **The supporting infrastructure** — docker-compose (postgres + pgadmin), node-pg-migrations, monorepo workspace.

### 1.2 Where this sits in the larger project

Decomposed PRDs (agreed during brainstorming):

| PRD | Scope |
|---|---|
| **PRD 1** (this doc) | Memory architecture |
| PRD 2 | Agent shell — chat UI + Node backend + Opus, wired to OpenBrain APIs and the vault |
| PRD 3 | Research capability — Tavily integration + ingestion pipeline |
| PRD 4 | Coordinator vs agent-team architecture decision and refactor |
| PRD 5 | Document production — strategic framework, marketing plan, business plan templates with LLM-driven compilation hooks |
| PRD 6 | Financial modeling — analysis + projections |

### 1.3 Goals, in priority order

1. **Knowledge compounding over weeks** — the agent's understanding of the user's business domain visibly deepens; it connects unrelated findings, catches contradictions with prior research.
2. **Reasoning quality** — structured memory + framework wiki produces noticeably better strategic thinking than a stateless agent.
3. **Recall fidelity** — reliably retrieves the right prior research without hallucinating or over-fetching.

Operator ergonomics (how painful manual maintenance is) is **explicitly not a primary goal**. The user accepts maintenance friction in service of compounding.

### 1.4 Memory architecture pattern

This project uses a hybrid memory pattern combining Andrej Karpathy's wiki RAG (`https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`) with Nate B Jones's OpenBrain extension. The user-stated boundary:

> Research goes into OpenBrain. The agent uses that intelligence to populate the Wiki RAG. The end goal for the Wiki RAG is to contain all of the strategic framework documents and plan documents and show how they're all linked together and linked to the underlying data that supports them.

OpenBrain holds the facts; the wiki holds the strategy compiled from those facts.

---

## 2. Architecture overview

```mermaid
flowchart LR
  CLI["ingest-source CLI<br/>(PRD 1)"] -->|writes| API
  Tavily["Tavily pipeline<br/>(PRD 3)"] -.->|writes| API
  ChatAgent["Chat agent<br/>(PRD 2)"] -.->|writes / reads| API

  subgraph Backend["Backend Node/TS — PRD 1"]
    API["OpenBrain Write/Read APIs"]
    Compiler["Compilation Agent"]
  end

  API -->|persist| OB[("OpenBrain<br/>Postgres")]
  Compiler -->|reads| OB
  Compiler -->|writes| Vault["Wiki vault<br/>vault/"]

  ChatAgent -.->|reads| Vault
  ChatAgent -.->|reads via Read API| OB
```

**In PRD 1 scope:** OpenBrain schema + APIs + compilation agent + vault structure + dev CLI + lint + docker/migrations infrastructure.

**Adjacent (other PRDs, shown for orientation):** Tavily research pipeline, chat agent, frontend, LLM-driven synthesis hooks for framework documents.

---

## 3. OpenBrain schema (Postgres)

Six tables. SQL shown is illustrative; final form lives in `migrations/1_initial_schema.ts`.

### 3.1 `sources` — raw artifacts

```sql
sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL,                         -- 'web' | 'pdf' | 'transcript' | 'note' | 'manual'
  url          TEXT,                                   -- nullable for non-web sources
  title        TEXT NOT NULL,
  author       TEXT,
  published_at TIMESTAMPTZ,                            -- when the source itself was published
  content      TEXT,                                   -- full extracted text when available
  content_hash TEXT,                                   -- sha256 of content for re-ingest dedup
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingested_by  TEXT,                                   -- 'cli' | 'tavily' | 'agent' | 'user'
  metadata     JSONB                                   -- flexible: page count, retrieval query, etc.
);
CREATE INDEX ON sources (ingested_at);
CREATE INDEX ON sources (content_hash);
```

Rationale: the agent must be able to return to originals (Karpathy's point — wiki staleness drifts; raw sources stay true). `content_hash` prevents duplicate insertion on re-ingest. `metadata` JSONB absorbs forward schema churn from new source types in PRD 3.

### 3.2 `claims` — atomic statements with hypothesis lifecycle

```sql
claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement         TEXT NOT NULL,
  type              TEXT NOT NULL,                     -- 'finding' | 'hypothesis' | 'decision' | 'observation' | 'estimate'
  status            TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'validated' | 'refuted' | 'superseded' | 'retired'
  confidence        INT,                                -- 0–100 nullable
  source_id         UUID REFERENCES sources(id),       -- nullable: user-stated decisions need no source
  source_excerpt    TEXT,                               -- direct quote/passage
  source_locator    TEXT,                               -- 'page 3', 'section II.B', URL fragment
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT,                               -- 'cli' | 'tavily-extract' | 'agent' | 'user'
  status_changed_at TIMESTAMPTZ,
  status_reason     TEXT,                               -- short note: why validated/refuted
  metadata          JSONB
);
CREATE INDEX ON claims (status);
CREATE INDEX ON claims (type);
CREATE INDEX ON claims (source_id);
CREATE INDEX ON claims (created_at);
```

Key decisions:

- **Default `status='open'`** encodes the "every statement is a hypothesis" rule. Promotion to `validated` or `refuted` requires `status_reason` to be populated (enforced at the API — see §6.3). The reason should typically reference a `relations` row pointing at supporting or contradicting evidence, but the API does not enforce that linkage; it is a discipline reinforced by lint and review. Promotion to `superseded` additionally requires a `supersedes` relation pointing at the newer claim (enforced at the API). The system never auto-promotes.
- **`type` separates kinds of claims.** A `decision` (user choice) is treated structurally the same as a `finding` (research extract): both can be supported, contradicted, retired. This keeps the schema lean — no separate `decisions` table.
- **`source_id` is nullable** so user-stated decisions exist without an external citation.
- **`source_excerpt` + `source_locator`** make wiki citations resolvable to specific spans, not just "see article X."

### 3.3 `relations` — claim-to-claim edges

```sql
relations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_claim  UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  to_claim    UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                           -- 'supports' | 'contradicts' | 'refines' | 'supersedes' | 'related_to'
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  CHECK (from_claim <> to_claim),
  UNIQUE (from_claim, to_claim, type)
);
CREATE INDEX ON relations (from_claim);
CREATE INDEX ON relations (to_claim);
CREATE INDEX ON relations (type);
```

The contradictions surface (`vault/contradictions.md`) is just a query against this table. Self-loops are forbidden; duplicate edges are forbidden.

### 3.4 `tags` and `claim_tags`

```sql
tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,                    -- 'smb-restaurants', 'pricing-strategy' (URL/file safe)
  display     TEXT NOT NULL,                            -- 'SMB Restaurants', 'Pricing Strategy'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tags (slug);

claim_tags (
  claim_id  UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (claim_id, tag_id)
);
```

`tags.slug` is the bridge between database and filesystem: `vault/concepts/<slug>.md` is the page that aggregates claims with that tag. Slug is canonical; display is for humans.

### 3.5 `compilation_runs` — audit trail

```sql
compilation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger       TEXT NOT NULL,                          -- 'cli' | 'api' | 'cron'
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',        -- 'running' | 'success' | 'error'
  pages_written INT DEFAULT 0,
  pages_skipped INT DEFAULT 0,
  notes         TEXT,
  error_message TEXT
);
```

Frontmatter on each generated page references `compilation_runs.id` so any vault page is traceable to the run that produced it.

### 3.6 Things deliberately NOT in the schema

- **Full-text search columns (`tsvector`)** — defer until query patterns demand it.
- **Vector embeddings** — Karpathy's gist explicitly says BM25/index-based retrieval works at this scale (~100s–1000s of items). Add later if needed.
- **A dedicated `concepts` table** — tags do that job. If a concept needs structured fields beyond name+description, we'll know by the time we hit it.
- **A `users` table or multi-tenancy** — no auth (personal project).
- **A claim-status history table** — only the latest status is tracked (`status`, `status_changed_at`, `status_reason`). If full history is needed later, an event-sourced `claim_events` table can be added without breaking the current shape.

---

## 4. Wiki vault structure

### 4.1 Directory layout

```
vault/
├── CLAUDE.md            — schema rules the compilation agent obeys (hand-maintained, never regenerated)
├── index.md             — catalog of all pages by category
├── log.md               — chronological event log
├── sources.md           — single aggregate source catalog (anchored entries)
├── contradictions.md    — surfaced unresolved 'contradicts' relations
├── assets/              — images/charts (Obsidian's "Attachment folder path")
├── notes/               — user-owned notes; compilation never reads or writes here
└── concepts/            — strategy lives here; one page per tag
    ├── smb-restaurants.md
    └── pricing-strategy.md
```

`sources/` (per-source pages) is **deliberately absent**. Sources live in OpenBrain only; the wiki contains a single `sources.md` aggregate catalog. This keeps the vault strategy-focused and prevents the graph view from being dominated by source nodes.

`vault/notes/` is reserved for user-authored content; the compilation agent and lint never touch it. Use it for draft thoughts, observations, or any hand-written content that should live alongside the agent-generated wiki.

### 4.2 File naming

- `concepts/<slug>.md` — slug from `tags.slug`. Stable across regenerations.
- Frontmatter, citations, and cross-links never rely on file paths shifting.

### 4.3 Frontmatter schema

Every generated page has YAML frontmatter so Dataview can query metadata across the vault.

```yaml
---
type: concept | source-index | index | log | contradictions
slug: smb-restaurants                 # for concept pages
display: SMB Restaurants              # for concept pages
generated_at: 2026-04-28T19:42:00Z
compilation_run: 7c4a1e2f-3d92-...
claim_count: 17                       # for concept pages
status_summary: { open: 12, validated: 4, refuted: 1 }
source_count: 47                      # for source-index page
---
```

`compilation_run` is the FK back to `compilation_runs.id`.

### 4.4 Cross-link conventions

- Concept-to-concept: `[[concepts/pricing-strategy|Pricing Strategy]]`
- Concept-to-source: `[[sources#^src-7c4a1e2f|Square 2026]]`
- Claim block-id: each quoted claim is followed by `^claim-<short-uuid>` so other pages can deep-link to it via `[[concepts/smb-restaurants#^claim-1a2b]]`

Explicit paths, not bare names. Programmatic writers benefit from unambiguous resolution; Obsidian renders display aliases for readability.

### 4.5 Page body conventions

**Concept page** (representative):

```markdown
---
type: concept
slug: smb-restaurants
display: SMB Restaurants
generated_at: 2026-04-28T19:42:00Z
compilation_run: 7c4a1e2f-...
claim_count: 17
status_summary: { open: 12, validated: 4, refuted: 1 }
---

# SMB Restaurants

## Validated findings

- "62% of independent restaurants under $1M revenue manage scheduling
  manually." [[sources#^src-7c4a1e2f|Square 2026]] ^claim-1a2b3c4d
  - Refines: [[concepts/scheduling-pain]]

## Open hypotheses

- "SMB restaurants prefer SMS over email for ops alerts."
  [[sources#^src-3a9d2c1b|Toast Field Survey]] ^claim-3c4d5e6f

## Refuted

- ~~"Most SMB owners use a single POS."~~ [[sources#^src-5e6f7g8h|NRA 2026 report]] ^claim-5e6f7g8h
  - Contradicted by: [[concepts/smb-restaurants#^claim-1a2b3c4d]]
```

**`sources.md`** (representative):

```markdown
---
type: source-index
generated_at: 2026-04-28T19:42:00Z
source_count: 47
---

# Sources

## Square 2026 State of Restaurants ^src-7c4a1e2f
- **URL:** https://square.com/...
- **Type:** web · **Published:** 2026-02-14 · **Ingested:** 2026-04-28
- **Author:** Square Research
```

**`contradictions.md`** lists unresolved pairs (deduplicated by sorting `(from, to)` lexicographically), each with both claims, both sources, and the relation's `created_at`.

### 4.6 `CLAUDE.md` (hand-maintained schema doc)

`CLAUDE.md` is the agent's instruction manual for the vault. It contains:

- The directory layout
- Frontmatter schema per page type
- Cross-link conventions
- The "every claim has a status" rule
- The "contradictions are preserved, never smoothed" rule
- The provenance requirement: every claim quoted in the wiki must have a `[[sources#^src-...]]` link
- The boundary: agent owns `concepts/`, `sources.md`, `index.md`, `log.md`, `contradictions.md`. User owns `notes/` and `assets/`. `CLAUDE.md` itself is co-evolved.

This file is read by the compilation agent at the start of every run and is never regenerated.

---

## 5. Compilation agent

### 5.1 Behavior in one sentence

Reads current OpenBrain state, generates the desired set of vault pages via deterministic templating, writes only what changed, records the run.

### 5.2 Triggers in PRD 1

- **CLI only:** `pnpm cli compile`
- **Deferred:** HTTP-on-demand endpoint (lands with PRD 2 chat agent), scheduled cron (lands when activity volume justifies it). The schema (`compilation_runs.trigger`) is forward-compatible.

### 5.3 Deterministic templating, no LLM in PRD 1

All five PRD-1 page types (`concepts/<slug>.md`, `sources.md`, `index.md`, `log.md`, `contradictions.md`) are mechanical formatting of OpenBrain rows — they don't need synthesis to be useful.

The architecture leaves a clean seam for LLM-synthesis hooks (a `synthesize?(claims): Promise<string>` per page type), and **PRD 5 (document production)** is where strategic-framework templates begin invoking Opus for narrative sections.

PRD 1 ships fast, idempotent, fully reproducible, cheap to run.

### 5.4 Per-page generation strategy

| Page | Source query | Output |
|---|---|---|
| `concepts/<slug>.md` | `claims JOIN claim_tags JOIN tags WHERE tag.slug=X AND claim.status NOT IN ('retired')`, plus inbound/outbound `relations` per claim | Sections grouped by status (validated / open / refuted / superseded), each claim with statement + source citation + claim block-id + active relations |
| `sources.md` | `SELECT * FROM sources ORDER BY ingested_at DESC` | Anchored stubs per source (title, URL, type, dates, author) |
| `index.md` | List of all generated pages + tag count | Catalog by category: control pages, concepts, source index |
| `log.md` | `compilation_runs` (recent) + journal entries appended over time | Chronological list with consistent prefix `## [YYYY-MM-DD HH:MM] <event-type> | <subject>` (Karpathy's grep-friendly format) |
| `contradictions.md` | `relations` WHERE `type='contradicts'` AND both claims status NOT IN (`retired`, `superseded`) | Pairs side-by-side, each with sources, plus an "unresolved since" date |

### 5.5 Idempotence and write strategy

- Generate full desired content per page (frontmatter + body).
- Compute a content hash **excluding** `generated_at` and `compilation_run` frontmatter fields (those are time-varying noise).
- If the hash matches the existing file's hash, skip the write — no git diff churn, no Obsidian "file changed" reload spam.
- If it differs, write atomically: temp file + rename.

### 5.6 Locking

A single filesystem lock at `vault/.compile.lock` containing the running `compilation_run` UUID and start time. New runs refuse to start if the lock is fresh; recover (with a logged warning) if the lock is stale (>10 minutes AND the corresponding `compilation_runs` row has `finished_at IS NULL`). No Postgres advisory lock needed for PRD 1.

### 5.7 Orphan handling

If a tag has zero active claims at compile time, the concept page is regenerated as a stub with `claim_count: 0` in frontmatter and a "no active claims" body note. **Compilation never deletes pages automatically** — leaves user-visible artifacts in place so unintended schema/tag changes don't silently destroy work. User can `rm` stubs they no longer want.

### 5.8 Module shape (preview)

```
backend/src/compilation/
├── runCompilation.ts       — orchestrator (lock, transaction, dispatch, write, log)
├── compilers/
│   ├── concepts.ts
│   ├── sources.ts
│   ├── index.ts
│   ├── log.ts
│   └── contradictions.ts
├── render/                 — shared frontmatter / citation / block-ref helpers
└── types.ts                — Compiler interface, CompilationContext
```

Each compiler is a pure function `(ctx: CompilationContext) => Promise<RenderedPage[]>`. The orchestrator owns side effects (filesystem, DB writes). Easy to unit-test.

---

## 6. OpenBrain APIs

Thin TypeScript modules over the `pg` driver. **No ORM** — explicit SQL is easier to reason about for this scope; the user did not ask for one.

### 6.1 Write surface (representative)

```ts
createSource(input): Promise<Source>
upsertSourceByHash(input): Promise<Source>           // dedup on re-ingest
createClaim(input): Promise<Claim>
updateClaimStatus(id, status, reason): Promise<Claim>
createRelation(input): Promise<Relation>
findOrCreateTag(slug, display, description?): Promise<Tag>
addClaimTag(claimId, tagSlug): Promise<void>          // idempotent
```

### 6.2 Read surface (representative)

```ts
getSource(id): Promise<Source | null>
getSourceMeta(id): Promise<SourceMeta | null>         // metadata only, no full content
getSourceByHash(hash): Promise<Source | null>
getClaim(id): Promise<Claim | null>
getClaims(filter): Promise<Claim[]>                   // by tag, status, type, sourceId, since
getClaimWithProvenance(id): Promise<ClaimDetail>      // claim + source + active relations
getRelations(filter): Promise<Relation[]>
getContradictionPairs(): Promise<ContradictionPair[]> // used by compilation
listTags(): Promise<Tag[]>
getRecentCompilationRuns(limit): Promise<CompilationRun[]>
```

All write functions accept a `pg.PoolClient` so callers can compose them into transactions. CLI, compilation agent, and future PRD 2/3 callers all use the same surface.

### 6.3 Status promotion rule, encoded in the API

`updateClaimStatus(id, 'validated' | 'refuted', reason)` requires a non-empty `reason` string at both the TypeScript type level and runtime. `'superseded'` requires that there is a `supersedes` relation pointing at the new claim. The system never auto-promotes; promotion is always a deliberate call with a reason recorded.

---

## 7. Dev CLI

Single binary `pnpm cli <subcommand>`.

| Command | Purpose |
|---|---|
| `ingest-source <file-or-url>` | Create a `sources` row from a JSON manifest or markdown file with frontmatter |
| `add-claim --source <id> --statement "..." --type finding` | Create a claim |
| `tag-claim <claim-id> <tag-slug>` | Tag a claim (creates tag if missing) |
| `add-relation <from> <to> <type> [--note "..."]` | Create relation |
| `set-claim-status <claim-id> <status> --reason "..."` | Promote/demote a claim |
| `show-source <id-or-slug>` | Print full source content (the in-Obsidian "verify a citation" path) |
| `show-claim <id>` | Print claim with full provenance — source excerpt, tags, active relations |
| `compile` | Run compilation agent |
| `lint` | Run vault lint |
| `reset [--db | --vault | --all] [--snapshot <path>] [--yes]` | Wipe dev/test data (see § 7.1) |
| `migrate up` / `migrate down` | Pass-through to node-pg-migrations |

Default output is plain text; `--json` flag for machine consumption.

### 7.1 Reset behavior

| Flag | Behavior |
|---|---|
| `--db` | Truncates `sources`, `claims`, `relations`, `tags`, `claim_tags`, `compilation_runs`. Does NOT touch `pgmigrations` — schema stays. |
| `--vault` | Deletes `vault/concepts/`, `sources.md`, `index.md`, `log.md`, `contradictions.md`. Preserves `CLAUDE.md`, `assets/`, `notes/`. |
| `--all` | Both, in sequence. |
| `--snapshot <path>` | Before resetting, write a tarball of the vault + a `pg_dump` of OpenBrain to `<path>`. Lets the user preserve a dev experiment before going live. |
| `--yes` | Skip confirmation (for scripts/CI). Default behavior requires the user to type the literal target (`db`, `vault`, or `all`) — typed-confirmation prevents reflex enter-presses. Comparison is case-insensitive and trims surrounding whitespace. |

Migration history is preserved on `--db`. To go to true ground-zero (drop schema too), use `pnpm migrate down --to 0 && pnpm migrate up`. `CLAUDE.md` is preserved on `--vault` because the user co-evolves it; if removal is desired, do it manually.

---

## 8. Lint

Single command `pnpm cli lint` runs all checks against the current vault + DB state.

| Check | Severity | What it catches |
|---|---|---|
| Orphan claim (no source AND no tag AND no relations) | warn | Likely a mistake or a claim that fell out of the graph |
| Tag with zero active claims | info | Concept page is a stub — candidate for cleanup |
| Page hash doesn't match expected output | warn | Lint runs the compiler in dry-mode against current OpenBrain state, computes expected per-page hashes (excluding `generated_at` / `compilation_run`), and compares to current vault file hashes. A mismatch means the file was hand-edited; compilation will overwrite on the next run unless the edit is migrated into OpenBrain. |
| Missing required frontmatter on a generated page | error | Page is malformed — Dataview queries will fail |
| Wiki page references a `^claim-<id>` block that doesn't exist in DB | error | Stale citation, broken link |
| `contradicts` relation between two claims, both still `open` for >14 days | info | Aging unresolved disagreement worth surfacing |
| Source with no claims extracted | info | Ingested but never processed — work-in-progress signal |
| `vault/CLAUDE.md` missing | error | Compilation will fail on next run |

Output: console report grouped by severity. Exit code = highest severity (0 / 1 / 2 for none / warn / error). `--json` flag for tooling.

---

## 9. Infrastructure

### 9.1 Repo layout (monorepo)

```
.
├── docker-compose.yml          — postgres + pgadmin services
├── package.json                — workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── migrations/                 — node-pg-migrations files
│   ├── 1_initial_schema.ts
│   └── 2_seed_optional.ts
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── db/pool.ts
│       ├── openbrain/          — write/read API
│       │   ├── sources.ts
│       │   ├── claims.ts
│       │   ├── relations.ts
│       │   ├── tags.ts
│       │   └── index.ts
│       ├── compilation/
│       ├── lint/
│       └── cli/
├── docs/
│   └── superpowers/specs/      — this directory
└── vault/                      — compilation output (committed to git)
```

`frontend/` will appear alongside `backend/` in PRD 2.

### 9.2 docker-compose

Two services:

- `postgres:16` with persistent named volume, port `5432`
- `dpage/pgadmin4` with default email/password from `.env`, port `5050`
- Healthcheck on postgres so `pnpm migrate up` waits until ready

### 9.3 `.env.example`

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/business_plan
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/business_plan_test
PGADMIN_DEFAULT_EMAIL=admin@local
PGADMIN_DEFAULT_PASSWORD=admin
VAULT_PATH=./vault
```

### 9.4 Migrations

`migrations/1_initial_schema.ts` creates all six tables and indexes from §3, fully reversible. Subsequent migrations are additive — superseding a column means a new column + backfill + drop later.

### 9.5 Tooling defaults

- **Package manager:** pnpm (workspaces, fast)
- **Test runner:** Vitest with `c8` for coverage
- **TypeScript:** strict mode
- **Vault is committed to git**, not gitignored — version history on strategy artifacts is valuable. Compilation idempotence (skip-write-on-no-change) keeps git noise low.

---

## 10. Error handling

| Category | Where caught | User-visible behavior |
|---|---|---|
| DB connectivity / pool exhaustion | `db/pool.ts` wrapper | CLI prints clear error + suggestion to check `docker compose ps`. Compilation aborts cleanly without partial writes. |
| Schema validation (bad input to APIs) | TS types + runtime checks | API rejects with named error: `InvalidStatementError`, `InvalidStatusError`, `MissingReasonError`, etc. CLI prints which field failed. |
| Constraint violations (duplicate relation, self-loop) | DB CHECK + UNIQUE; re-thrown as named errors | `addClaimTag` is idempotent; `createRelation` errors on exact duplicate but identifies the existing one. |
| Compilation: vault write failure | Per-file atomic temp+rename; orchestrator catches and marks run `error` | Run aborts; no half-written page. Retry-safe. |
| Compilation: lock contention | Lock-file check on start | Second attempt: "Compilation already in progress (run X started Y minutes ago). Wait or `rm vault/.compile.lock` if stale." |
| Compilation: stale lock recovery | Lock TTL (10 min) + DB cross-check | Auto-cleared with a warning logged in the next run's notes. |
| CLI: bad args | Argument parser | Unknown command → usage. Missing required flag → named error. |

---

## 11. Edge cases addressed by design

| Edge case | Handling |
|---|---|
| Empty database, first compile run | All control pages render with `claim_count: 0` and a friendly placeholder body. Not an error. |
| Source ingested with zero claims extracted | Lives in `sources` and on `sources.md`; lint flags it as info-severity. |
| Claim with no source (user-stated) | `source_id IS NULL` allowed. Vault citation renders as `*(user statement)*` with `created_by` and `created_at`. |
| Symmetric contradiction (A↔B) | `contradictions.md` deduplicates pairs by sorting `(from, to)` lexicographically; one entry per pair. |
| Long source content (multi-MB articles) | `getSourceMeta(id)` returns metadata only; `getSource(id)` returns full record. Compilation only loads metadata for `sources.md`. |
| Tag rename | **Not supported in PRD 1.** Workflow: create new tag, re-tag claims, retire old. A `rename-tag` command may land in PRD 5+. |
| User manually edits a generated page | Hash-mismatch lint warning. Compilation overwrites on next run. The "agent owns these pages" rule is documented in `CLAUDE.md`. Stable hand-edited content belongs in `vault/notes/`. |
| Mid-compilation crash | Lock + DB run row both preserved; next run detects stale lock + run row with `finished_at IS NULL`, logs recovery, proceeds. |
| Schema drift between code and DB | Startup check queries `pgmigrations` for highest applied migration; warns if code expects a higher number. Does not auto-migrate. |
| Vault path missing/unwritable | Validated on every CLI command that touches vault; clear error with the path. Lint catches missing `CLAUDE.md` separately. |

---

## 12. Testing strategy

### 12.1 Test infrastructure

- **Runner:** Vitest, coverage via `c8`.
- **Database:** A separate `business_plan_test` database in the same Postgres container (configured via `DATABASE_URL_TEST`). Migrations run once per suite; each test wraps its body in a transaction that rolls back at teardown. Fast, isolated, no testcontainers dependency.

### 12.2 Test layers

| Layer | What's tested | How |
|---|---|---|
| Unit | Pure helpers — slug generation, citation rendering, frontmatter serialization, content hash, lock-file parser | Vitest, no DB |
| API integration | Each `openbrain/*.ts` write/read function — happy paths + named errors + constraint violations | Real DB, transaction rollback per test |
| Compilation snapshots | Given fixed OpenBrain state, render output matches golden snapshots | Snapshot files committed; intentional changes via `vitest -u` |
| Compilation idempotence | Run compile twice; second run writes zero files | Real DB + tempdir vault |
| Compilation incrementality | Modify one claim's tag; assert only affected concept pages re-write | Real DB + tempdir vault |
| Lock semantics | Concurrent compile attempts produce expected error; stale lock recovered | Real DB + tempdir vault |
| Reset | `--db` empties data, preserves `pgmigrations`. `--vault` deletes generated pages, preserves `CLAUDE.md` + `assets/` + `notes/`. `--snapshot` produces valid tarball + dump. | Real DB + tempdir vault |
| Lint | Each lint check has a fixture exercising it; output classification asserted | Real DB + tempdir vault |
| CLI | Subcommand parsing, exit codes, `--help` output | Spawned subprocess or in-process invocation |

### 12.3 Coverage targets

85% line + 80% branch on `backend/src/openbrain/*` and `backend/src/compilation/*`. Coverage is a sanity check; the integration + snapshot suites are the real safety net.

### 12.4 Out of scope for PRD 1 testing

- LLM behavior (no LLM calls in compilation path).
- Network ingestion (Tavily lands in PRD 3).
- Concurrent multi-process writes (single-user system; revisit if it becomes plural).

---

## 13. Out of scope / deferred

| Item | Where it lands |
|---|---|
| Tavily research pipeline | PRD 3 |
| Chat agent UI / backend | PRD 2 |
| LLM-driven synthesis hooks in compilation | PRD 2 (basic) / PRD 5 (framework templates) |
| HTTP endpoint for compilation | PRD 2 |
| Scheduled cron compilation | When activity volume justifies it |
| Strategic-framework page templates (Lean Canvas, Porter's, etc.) | PRD 5 |
| Financial modeling | PRD 6 |
| Tag rename command | PRD 5+ |
| Vector embeddings / `tsvector` full-text columns | When query patterns demand it |
| Frozen-page mechanism (prevent agent from overwriting hand-edited generated pages) | If `vault/notes/` proves insufficient |
| Q&A outputs filed back into the wiki as new pages | PRD 2 (chat agent) |
| Multi-agent / coordinator architecture | PRD 4 |

---

## 14. Decisions log

Notable decisions made during brainstorming and the reasoning behind them:

1. **Hybrid OpenBrain (Postgres) + wiki (markdown vault) — not pure wiki, not pure DB.** Compounding goal needs structured, queryable storage; Obsidian-readable strategy artifacts need markdown. Source: Karpathy gist + Nate B Jones's hybrid extension.
2. **Claim-level granularity in OpenBrain (sources + claims + relations), not document-level.** Required to deliver hypothesis lifecycle, contradiction surfacing, and per-claim provenance in wiki citations.
3. **Sources live in OpenBrain only; the vault has a single `sources.md` aggregate.** Keeps the wiki strategy-focused and prevents the Obsidian graph view from being dominated by source nodes.
4. **Deterministic templating in compilation (no LLM calls in PRD 1).** Cheap, fast, idempotent, easy to test. LLM synthesis hooks land later when framework templates need them.
5. **Compilation never auto-deletes pages; produces stubs for orphan tags.** Defensive against unintended schema/tag changes.
6. **Migration history preserved across `--db` reset.** Schema lives, data goes. True ground-zero is `migrate down --to 0 && migrate up` (deliberate, separate path).
7. **`CLAUDE.md` and `vault/notes/` and `vault/assets/` preserved across `--vault` reset.** Hand-maintained content survives wipes; only generated artifacts are cleared.
8. **Vault is committed to git, not gitignored.** Version history on strategy artifacts is valuable; compilation idempotence keeps git noise low.
9. **Status promotion (`validated` / `refuted`) requires an explicit `reason`.** Encoded at the API level. The "every statement is a hypothesis" rule applies until a deliberate, reasoned promotion occurs.
10. **No ORM.** Explicit SQL via `pg`. Simpler to reason about and maintain at this scope.
