# Architecture Research

**Domain:** Single-user local AI-agent app — hybrid Karpathy wiki + OneBrain memory (Postgres source-of-truth + Obsidian compiled view)
**Researched:** 2026-04-25
**Confidence:** HIGH on schema, build order, write-direction; HIGH on agent topology (constrained by Claude Agent SDK's spawn model); MEDIUM on compilation-agent diff strategy (chosen pattern is the safest of credible options).

This document is opinionated. The hybrid pattern, write directionality, single-writer wiki, confidence + status fields, contradiction preservation, and stable-ID provenance are hard commitments from `PROJECT.md` and are not re-debated here.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER (React, host)                      │
│  ┌──────────────────────────┐         ┌─────────────────────────────┐   │
│  │ assistant-ui Chat        │         │ Obsidian (external app)     │   │
│  │  - Thread / Composer     │         │  - Reads vault/             │   │
│  │  - Wiki-chunk citations  │         │  - Graph view, backlinks    │   │
│  │  - Confidence badges     │         │  - User browses; never      │   │
│  │  - Tool-call traces      │         │    edits (single-writer)    │   │
│  └────────────┬─────────────┘         └──────────────┬──────────────┘   │
│               │ SSE/stream (AI SDK 6 transport)       │ filesystem read  │
└───────────────┼───────────────────────────────────────┼──────────────────┘
                │                                       │
┌───────────────▼───────────────────────────────────────┼──────────────────┐
│                         APP LAYER (Node 22 + TS, host)│                  │
│                                                       │                  │
│  ┌────────────────────────────────────────────────────┼───────────────┐  │
│  │              Hono HTTP server                      │               │  │
│  │   POST /chat   POST /ingest   POST /recompile     │               │  │
│  │   GET  /health GET  /onebrain/:id (debug)         │               │  │
│  └─────────────┬───────────────────────┬─────────────┬┘               │  │
│                │                       │             │                │  │
│  ┌─────────────▼─────────────┐  ┌──────▼──────┐  ┌──▼──────────────┐ │  │
│  │ Coordinator agent         │  │ Compilation │  │ Ingest agent    │ │  │
│  │ (Claude Agent SDK query   │  │ agent       │  │ (sub-agent of   │ │  │
│  │  loop, Opus, system       │  │ (sub-agent  │  │  coordinator;   │ │  │
│  │  prompt = CLAUDE.md)      │  │  + scheduled│  │  may also be    │ │  │
│  │                           │  │  by cron)   │  │  invoked direct │ │  │
│  │  Spawns sub-agents:       │  │             │  │  by /ingest)    │ │  │
│  │  - research               │  │ Single      │  │                 │ │  │
│  │  - financial-analysis     │  │ writer to   │  │                 │ │  │
│  │  - ingest                 │  │ vault/      │  │                 │ │  │
│  │  - devils-advocate        │  │             │  │                 │ │  │
│  │  - compilation (on-demand)│  │             │  │                 │ │  │
│  └─────────┬─────────┬───────┘  └──────┬──────┘  └──────┬──────────┘ │  │
│            │         │                 │                │            │  │
│            │         │                 ▼                │            │  │
│            │         │     ┌────────────────────────┐   │            │  │
│            │         │     │ vault writer (lib)     │◄──┘            │  │
│            │         │     │  - gray-matter         │                │  │
│            │         │     │  - remark              │                │  │
│            │         │     │  - atomic file writes  │                │  │
│            │         │     └────────────┬───────────┘                │  │
│            │         │                  │                            │  │
│            ▼         ▼                  │                            │  │
│   ┌──────────────────────────────┐     │                             │  │
│   │  OneBrain repository (TS)    │     │                             │  │
│   │   - Drizzle queries          │     │                             │  │
│   │   - Zod row schemas          │     │                             │  │
│   │   - Voyage embed at write    │     │                             │  │
│   │   - HNSW + tag/status filters│     │                             │  │
│   └──────────────┬───────────────┘     │                             │  │
│                  │                     │                             │  │
│   ┌──────────────┴────────┐  ┌─────────┴────────┐  ┌──────────────┐ │  │
│   │ MCP / external tools  │  │ vault/ filesystem│  │ node-cron    │ │  │
│   │  - Tavily (web)       │  │ (Obsidian-native)│  │ scheduler    │ │  │
│   │  - qmd (Phase 2)      │  │                  │  │              │ │  │
│   └───────────────────────┘  └──────────────────┘  └──────────────┘ │  │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │ pg protocol (localhost:5432)
┌─────────────────────▼───────────────────────────────────────────────────┐
│                     DATA LAYER (Docker)                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Postgres 16 (pgvector/pgvector:pg16)  — OneBrain                  │ │
│  │   sources, claims, entities, edges, decisions, tags, log,          │ │
│  │   compile_runs, compile_artifacts, embeddings (pgvector HNSW)      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  pgAdmin (debug only)                                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Owns | Implementation |
|-----------|------|----------------|
| **Coordinator agent** | Orchestrates a chat turn end-to-end. Routes to sub-agents. Reads OneBrain + wiki for context. Emits a chat reply with citations. Never writes the wiki directly. | `query()` from Claude Agent SDK; `system prompt = CLAUDE.md`; `agents: { research, financial-analysis, ingest, devils-advocate, compilation }` |
| **Research sub-agent** | Web search via Tavily, claim extraction, writes findings to OneBrain (claims + edges + source rows). Never touches the vault. | Agent SDK sub-agent. Tools: `tavily_search`, `tavily_extract`, `onebrain_write_*`, `onebrain_search`. |
| **Financial-analysis sub-agent** | Numeric work — assumption/scenario claims, ratios, sensitivity. Writes calc-claims to OneBrain (kind=`finance.calc`, `finance.assumption`). | Agent SDK sub-agent. Tools: `onebrain_*`, possibly local code execution via Bash for math (post-MVP). |
| **Ingest sub-agent** | Convert a raw URL/file/transcript into OneBrain rows: 1 `sources` row + N `claims` + entity links. | Agent SDK sub-agent. Tools: `tavily_extract`, `onebrain_write_*`. Invoked by coordinator on user "log this article" intents OR directly by `POST /ingest`. |
| **Devil's-advocate sub-agent** | Reads a topic's claims from OneBrain, surfaces weak evidence and contradictions, writes counter-claims (kind=`counter`, status=`hypothesis`). | Agent SDK sub-agent. Tools: `onebrain_search`, `onebrain_write_*`. |
| **Compilation agent** | The **only** writer to `vault/`. Reads OneBrain → groups claims by topic/page → renders markdown with frontmatter + evidence links → diffs vs current vault file → writes if changed. | Agent SDK sub-agent (when invoked from chat) OR standalone Node entry point (when invoked by node-cron). Tools: `onebrain_search`, `vault_write_atomic`, `vault_read`. Wraps a deterministic Node renderer; LLM only for narrative paragraphs and contradiction framing. |
| **OneBrain repository** | Single Node module that owns all OneBrain SQL. Coercive: anything writing to OneBrain must go through it. | Drizzle queries over `node-pg-migrate` schema; Zod row validation; Voyage embedding generation on insert; pgvector cosine search. |
| **Vault writer** | Atomic, single-process writes to `vault/*.md`. Renders frontmatter via `gray-matter`, body via `remark`. Computes content hash for diff. | TS lib used only by compilation agent. Uses `fs.promises.writeFile` to a temp file then atomic rename. |
| **Hono HTTP server** | Thin router. Streams agent output via SSE. Owns no business logic. | `hono` + `@hono/node-server`. |
| **node-cron** | Triggers compilation agent on schedule (default every 6h; configurable). | In-process; runs in same Node app. |
| **Postgres + pgvector** | Durable source-of-truth. ACID across `claims`, `edges`, `embeddings`. | Docker; `pgvector/pgvector:pg16` image. |
| **Obsidian** | Read-only browser of the compiled vault. Never edits. (Karpathy gist explicitly endorses this stance: "you never write the wiki yourself.") | External app. Vault is `vault/` at repo root. |
| **CLAUDE.md** | Static behavioral spec for the coordinator: be critical, treat statements as hypotheses, evidence-first reasoning, write protocol, sub-agent usage rules. | Markdown at repo root, loaded via Agent SDK `settingSources`. |

---

## Recommended Project Structure

```
.
├── CLAUDE.md                        # Coordinator system prompt + write protocol
├── docker-compose.yml               # postgres + pgadmin only (app runs on host)
├── .env                             # ANTHROPIC_API_KEY, VOYAGE_API_KEY, TAVILY_API_KEY, DATABASE_URL
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── migrations/                      # node-pg-migrate (schema source of truth)
│   ├── 1700000000000_init.sql
│   ├── 1700000000001_pgvector_extension.sql
│   ├── 1700000000002_sources_claims_entities.sql
│   ├── 1700000000003_edges.sql
│   ├── 1700000000004_decisions_log.sql
│   └── 1700000000005_compile_runs.sql
│
├── src/
│   ├── server/                      # Hono HTTP layer
│   │   ├── index.ts                 # entry point: app, cron, server.listen
│   │   ├── routes/
│   │   │   ├── chat.ts              # POST /chat — streams coordinator output
│   │   │   ├── ingest.ts            # POST /ingest — runs ingest sub-agent
│   │   │   ├── recompile.ts         # POST /recompile — triggers compilation agent
│   │   │   └── debug.ts             # GET /onebrain/:id — inspect rows
│   │   └── streaming.ts             # SSE helpers for assistant-ui transport
│   │
│   ├── agents/                      # Claude Agent SDK definitions
│   │   ├── coordinator.ts           # query() factory; loads CLAUDE.md
│   │   ├── definitions/
│   │   │   ├── research.ts          # AgentDefinition
│   │   │   ├── financial.ts         # AgentDefinition
│   │   │   ├── ingest.ts            # AgentDefinition
│   │   │   ├── devils-advocate.ts   # AgentDefinition
│   │   │   └── compilation.ts       # AgentDefinition
│   │   └── tools/                   # createSdkMcpServer() tool implementations
│   │       ├── onebrain.ts          # write_source, write_claim, write_edge, search
│   │       ├── vault.ts             # vault_read, vault_write_atomic (compilation only)
│   │       ├── tavily.ts            # search, extract, crawl
│   │       └── qmd.ts               # Phase 2: MCP client to qmd
│   │
│   ├── onebrain/                    # OneBrain repository — owns all SQL
│   │   ├── schema.ts                # Drizzle table definitions (mirror of migrations)
│   │   ├── repo.ts                  # CRUD functions: writeSource, writeClaim, ...
│   │   ├── search.ts                # vector + tag + status hybrid search
│   │   ├── embed.ts                 # Voyage 3.5 wrapper
│   │   ├── ids.ts                   # claim ID minting (ULID-style stable IDs)
│   │   └── types.ts                 # Zod schemas for every row type
│   │
│   ├── compilation/                 # Compilation agent (deterministic core + LLM narrative)
│   │   ├── plan.ts                  # decide which pages to (re)compile based on diff
│   │   ├── render/
│   │   │   ├── page.ts              # render one page from its claim set
│   │   │   ├── frontmatter.ts       # build YAML frontmatter
│   │   │   ├── claim-block.ts       # render a single claim citation block
│   │   │   ├── contradiction.ts     # render a "contradictions on this topic" callout
│   │   │   ├── index-md.ts          # rebuild vault/index.md (catalog)
│   │   │   └── log-md.ts            # append to vault/log.md
│   │   ├── vault-writer.ts          # atomic file writes, content hashing
│   │   └── runner.ts                # cron + on-demand entry point
│   │
│   ├── ui/                          # React + assistant-ui (Vite app)
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Chat.tsx             # assistant-ui Thread + Composer
│   │   │   ├── WikiCitation.tsx     # renders an OneBrain claim citation inline
│   │   │   ├── ConfidenceBadge.tsx
│   │   │   └── ToolTrace.tsx
│   │   └── runtime.ts               # AssistantChatTransport configuration
│   │
│   ├── lib/
│   │   ├── log.ts                   # pino logger
│   │   ├── env.ts                   # zod-validated env loader
│   │   └── hash.ts                  # content hash for diff
│   │
│   └── eval/                        # promptfoo configs
│       ├── coordinator.yaml
│       ├── ingest.yaml
│       └── compilation.yaml
│
└── vault/                           # Obsidian vault — written ONLY by compilation agent
    ├── index.md                     # catalog (rebuilt every compile)
    ├── log.md                       # append-only chronological event log
    ├── frameworks/                  # SWOT, STP, 4Ps, Porter, brand pyramid, JTBD, ICP
    │   ├── swot.md
    │   ├── stp.md
    │   ├── porters-five-forces.md
    │   ├── 4ps.md
    │   ├── brand-pyramid.md
    │   ├── positioning-statement.md
    │   ├── jtbd.md
    │   ├── customer-journey.md
    │   ├── icp.md
    │   └── persona.md
    ├── entities/                    # one page per company / product / segment / framework / decision
    │   ├── competitor-acme.md
    │   ├── segment-smb-fintech.md
    │   └── ...
    ├── topics/                      # cross-cutting topical syntheses
    │   ├── pricing.md
    │   ├── go-to-market.md
    │   └── ...
    ├── decisions/                   # one page per decision (pulls from `decisions` table)
    │   └── 2026-04-25-pick-target-segment.md
    └── sources/                     # one page per ingested source (lightweight stub + link out)
        └── source-<id>.md
```

### Structure Rationale

- **`migrations/` is the schema source of truth, not Drizzle.** Project constraint says node-pg-migrate; Drizzle is query-only. `src/onebrain/schema.ts` is hand-mirrored and reviewed when migrations change.
- **`src/onebrain/` is a coercive boundary.** Every code path that touches Postgres goes through `repo.ts`. Agent tools (`src/agents/tools/onebrain.ts`) are thin wrappers over `repo.ts` — they exist to expose typed handlers to the Agent SDK, not to implement logic.
- **`src/compilation/` separates the deterministic renderer from the LLM narrative.** `render/page.ts` is plain TS that takes a typed claim set and emits markdown. The LLM is only used for the *prose connective tissue* and *contradiction framing*, not for the structural rendering. This is what makes "single-writer to vault" enforceable: 95% of the file content is generated deterministically from rows.
- **`vault/` is at repo root, not under `src/`.** It is the artifact, not source. Git-versioned (per Karpathy gist).
- **`src/agents/definitions/` are pure data.** Each file exports a single `AgentDefinition`. Easy to test, easy to iterate.
- **`src/ui/` is its own Vite-built app.** Hono serves it in production via static; Vite dev-serves it on port 5173 with proxy to Hono on port 3000 during development.

---

## OneBrain Schema (Postgres)

Concrete proposal. Conventions: `id` columns are ULIDs (text, sortable, stable, URL-safe); timestamps are `timestamptz`; `confidence` is `numeric(3,2)` in `[0,1]`; `status` is an enum; arrays use `text[]`. Embedding column uses `vector(1024)` (Voyage 3.5 default dimension; `output_dimension=1024` is the recommended choice for retrieval quality at this scale).

### Enum types

```sql
CREATE TYPE claim_status AS ENUM ('hypothesis', 'tested', 'validated', 'refuted', 'superseded');
CREATE TYPE claim_kind AS ENUM (
  'fact',           -- empirical statement extracted from a source
  'inference',      -- agent's reasoning step
  'hypothesis',     -- explicit hypothesis under test
  'counter',        -- devil's-advocate counter-claim
  'finance.calc',   -- numeric calculation result
  'finance.assumption', -- numeric input assumption
  'decision',       -- decision recorded by user
  'question'        -- open question to investigate later
);
CREATE TYPE edge_kind AS ENUM (
  'supports',       -- claim_a supports claim_b (evidence-of)
  'contradicts',    -- claim_a contradicts claim_b
  'supersedes',     -- claim_a supersedes claim_b (newer/better)
  'derived_from',   -- claim_a was derived from claim_b
  'about_entity',   -- claim_a is about entity_b
  'cites_source'    -- claim_a was extracted from source_b
);
CREATE TYPE source_kind AS ENUM ('web_article', 'paper', 'transcript', 'pdf', 'user_note', 'chat_excerpt', 'web_search_result');
CREATE TYPE entity_kind AS ENUM ('company', 'product', 'segment', 'persona', 'framework', 'topic', 'concept', 'person');
CREATE TYPE compile_trigger AS ENUM ('schedule', 'on_demand', 'source_added', 'manual_topic');
```

### Tables

#### `sources` — raw documents/articles/transcripts/notes

```sql
CREATE TABLE sources (
  id              text PRIMARY KEY,                  -- ULID
  kind            source_kind NOT NULL,
  url             text,                              -- nullable for user notes
  title           text NOT NULL,
  author          text,
  published_at    timestamptz,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  raw_text        text NOT NULL,                     -- the full extracted text
  raw_text_hash   text NOT NULL,                     -- sha256, for dedupe
  metadata        jsonb NOT NULL DEFAULT '{}',       -- domain-specific fields
  embedding       vector(1024)                       -- summary embedding
);
CREATE UNIQUE INDEX sources_hash_idx ON sources (raw_text_hash);
CREATE INDEX sources_url_idx ON sources (url) WHERE url IS NOT NULL;
CREATE INDEX sources_ingested_at_idx ON sources (ingested_at DESC);
CREATE INDEX sources_embedding_hnsw ON sources USING hnsw (embedding vector_cosine_ops);
```

#### `claims` — atomic facts/inferences/hypotheses (the heart of OneBrain)

```sql
CREATE TABLE claims (
  id              text PRIMARY KEY,                  -- ULID — this is the stable ID wiki cites
  kind            claim_kind NOT NULL,
  status          claim_status NOT NULL DEFAULT 'hypothesis',
  confidence      numeric(3,2) NOT NULL DEFAULT 0.50, -- [0,1]
  text            text NOT NULL,                      -- the claim, one sentence
  rationale       text,                               -- why the agent believes this
  topic_tags      text[] NOT NULL DEFAULT '{}',       -- e.g. {pricing, competitor, swot.weakness}
  framework_tags  text[] NOT NULL DEFAULT '{}',       -- e.g. {swot, porter}
  business_plan_id text,                              -- nullable; future-proofs multi-plan
  created_by      text NOT NULL,                      -- agent name: 'research' | 'financial' | ...
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  superseded_by   text REFERENCES claims(id),         -- supersede chain (also see edges)
  embedding       vector(1024) NOT NULL,
  -- denormalized counts for compile efficiency:
  supporting_count integer NOT NULL DEFAULT 0,
  contradicting_count integer NOT NULL DEFAULT 0
);
CREATE INDEX claims_status_idx     ON claims (status);
CREATE INDEX claims_kind_idx       ON claims (kind);
CREATE INDEX claims_topic_gin      ON claims USING gin (topic_tags);
CREATE INDEX claims_framework_gin  ON claims USING gin (framework_tags);
CREATE INDEX claims_updated_at_idx ON claims (updated_at DESC);
CREATE INDEX claims_embedding_hnsw ON claims USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

#### `entities` — people, companies, products, segments, frameworks, concepts

```sql
CREATE TABLE entities (
  id              text PRIMARY KEY,
  kind            entity_kind NOT NULL,
  name            text NOT NULL,
  aliases         text[] NOT NULL DEFAULT '{}',
  description     text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  embedding       vector(1024)
);
CREATE UNIQUE INDEX entities_kind_name_idx ON entities (kind, lower(name));
CREATE INDEX entities_aliases_gin ON entities USING gin (aliases);
CREATE INDEX entities_embedding_hnsw ON entities USING hnsw (embedding vector_cosine_ops);
```

#### `edges` — typed relationships (the graph)

```sql
CREATE TABLE edges (
  id              text PRIMARY KEY,
  kind            edge_kind NOT NULL,
  from_id         text NOT NULL,    -- claim id, entity id, or source id
  from_table      text NOT NULL,    -- 'claims' | 'entities' | 'sources'
  to_id           text NOT NULL,
  to_table        text NOT NULL,
  weight          numeric(3,2) NOT NULL DEFAULT 1.00, -- supporting strength, etc.
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edges_from_idx  ON edges (from_table, from_id);
CREATE INDEX edges_to_idx    ON edges (to_table, to_id);
CREATE INDEX edges_kind_idx  ON edges (kind);
CREATE UNIQUE INDEX edges_uniq ON edges (kind, from_table, from_id, to_table, to_id);
```

`edges` is intentionally polymorphic on `from_table`/`to_table`. We pay a small JOIN cost in exchange for one edge table that handles all graph relationships (claim→claim, claim→entity, claim→source). At single-user scale this is fine.

#### `decisions` — first-class strategic decisions

```sql
CREATE TABLE decisions (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  description     text NOT NULL,
  rationale       text NOT NULL,
  decided_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'active',  -- 'active' | 'reversed' | 'superseded'
  superseded_by   text REFERENCES decisions(id),
  topic_tags      text[] NOT NULL DEFAULT '{}',
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_decided_at_idx ON decisions (decided_at DESC);
CREATE INDEX decisions_topic_gin      ON decisions USING gin (topic_tags);
```

Supporting/contradicting evidence for a decision lives as edges from claim → decision (using the polymorphic edges table).

#### `tags` — controlled vocabulary (optional but useful)

```sql
CREATE TABLE tags (
  name            text PRIMARY KEY,
  category        text NOT NULL,    -- 'topic' | 'framework' | 'segment' | 'lifecycle'
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

This is a soft constraint — `claims.topic_tags` is `text[]`, not foreign-keyed. The `tags` table is a *known-vocabulary registry* the compilation agent uses to (a) generate index pages per category and (b) flag rogue/typo'd tags. Add tags lazily as the agent uses them; refactor periodically.

#### `event_log` — append-only operational log

```sql
CREATE TABLE event_log (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL,    -- 'ingest' | 'compile' | 'chat_turn' | 'lint' | 'recompile'
  actor           text NOT NULL,    -- agent name or 'user'
  summary         text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX event_log_at_idx ON event_log (at DESC);
CREATE INDEX event_log_kind_idx ON event_log (kind);
```

The compilation agent reads recent rows here when it appends to `vault/log.md`.

#### `compile_runs` and `compile_artifacts` — compilation idempotency + diffing

```sql
CREATE TABLE compile_runs (
  id              text PRIMARY KEY,
  trigger         compile_trigger NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  pages_planned   integer,
  pages_written   integer,
  pages_skipped   integer,
  error           text
);

CREATE TABLE compile_artifacts (
  id              text PRIMARY KEY,
  run_id          text NOT NULL REFERENCES compile_runs(id),
  page_path       text NOT NULL,                 -- e.g. 'frameworks/swot.md'
  page_kind       text NOT NULL,                 -- 'framework' | 'entity' | 'topic' | 'decision' | 'index' | 'log'
  source_claim_ids text[] NOT NULL,              -- which claim ULIDs this page cited
  content_hash    text NOT NULL,                 -- sha256 of rendered markdown
  written         boolean NOT NULL,              -- false if hash matched existing file
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compile_artifacts_page_path_idx ON compile_artifacts (page_path);
CREATE INDEX compile_artifacts_run_idx       ON compile_artifacts (run_id);
```

`compile_artifacts.content_hash` is what makes diff-based recompile work: skip writing if a page's rendered hash equals the most recent successful artifact's hash for the same `page_path`.

### Stable ID strategy

- **ULID** (`01J9X...` lexicographically sortable) for all primary keys. Rationale: stable, URL-safe, sortable by creation time, generated app-side (no DB round-trip), short enough to embed in markdown links (`[[claim:01J9XABC...]]`).
- Wiki citations link via stable IDs in frontmatter: `evidence: [01J9XABC..., 01J9XDEF...]`. The compilation agent never moves IDs.
- Supersedence is preferred over deletion. `claims.superseded_by` + `claims.status='superseded'` keeps history; an `edges.kind='supersedes'` row makes the relationship queryable from either direction.

### What gets embedded, at what granularity

| Row | Embedded text | Why |
|-----|---------------|-----|
| `sources.embedding` | First 4k chars of `raw_text` (Voyage 3.5 has 32k context — so we can do the full document for short articles, capped for long ones). | Source-level retrieval ("find sources about X"). |
| `claims.embedding` | `text` + ` — ` + `rationale` (if present). One claim = one sentence + reasoning. | The primary retrieval target. Coordinator searches `claims` by semantic + tag filter. |
| `entities.embedding` | `name` + aliases + `description`. | Entity disambiguation and "who is this competitor?" lookups. |
| `decisions.embedding` | Not embedded in v1; queried by `topic_tags` and `decided_at`. | Decisions are few; tag-based query is sufficient. |

**Embedding model:** `voyage-3.5` with `output_dimension=1024` (the default, best quality at this size). All Voyage 3.x/4.x models share a vector space, so we can swap to `voyage-3.5-lite` later for cost without re-indexing.

**HNSW parameters:** `m=16, ef_construction=64` (pgvector defaults). At single-user scale (low thousands of claims realistically) this is plenty; recall is ~95%+ on benchmarks. Set `SET LOCAL hnsw.ef_search = 80` per-query if recall ever feels low.

---

## Compilation Agent Design

### Triggers (all three, in this priority order)

1. **On-demand** (`POST /recompile` with optional `topic` query param). The user just had a session and wants the wiki current immediately. **This is the primary trigger.** Implemented first.
2. **Source-added** event. After `POST /ingest` completes successfully, the ingest sub-agent emits a `recompile-needed` event with the affected `topic_tags`. The recompile is queued (small in-memory queue — debounce 30s — so a batch of 5 ingests in a session triggers one recompile, not five).
3. **Scheduled** via node-cron, default `0 */6 * * *` (every 6 hours). This is the safety net: even if no one explicitly triggers a recompile, the wiki self-heals overnight. Includes the lint pass.

Do **not** make the compilation agent run on every claim write — that's chatty, expensive, and produces an unstable wiki.

### Granularity: topic-driven diff-based, with whole-vault as fallback

Three modes; the agent chooses based on trigger:

| Trigger | Mode | What gets recompiled |
|---------|------|---------------------|
| `on_demand` (no topic) | **Diff-based**: rebuild only pages whose underlying claim set changed since last successful run. | Pages where any claim with matching `topic_tags`/`framework_tags`/`about_entity` edge was written/updated since last run. |
| `on_demand` (topic specified) | **Topic-driven**: rebuild all pages tagged with that topic. | One topic's worth of pages (e.g. `pricing` recompiles `topics/pricing.md`, plus any framework page citing pricing claims). |
| `source_added` | **Diff-based** (debounced 30s). | Same as on-demand; usually 1–3 pages. |
| `schedule` | **Diff-based**, plus a **lint pass** (see below). | Same diff set, plus index.md and log.md always rewritten. |
| Manual `--full` flag (CLI) | **Whole-vault rebuild**. | Everything. Used after schema changes or template tweaks. |

**Diff detection algorithm** (deterministic, in `src/compilation/plan.ts`):

```
1. Read last successful compile_run.finished_at as `since`.
2. Find all claims/entities/decisions WHERE updated_at > since.
3. Map each changed row → set of page_paths that depend on it:
   - claim with framework_tag=swot → frameworks/swot.md
   - claim with topic_tag=pricing  → topics/pricing.md
   - claim with edge about_entity=competitor-acme → entities/competitor-acme.md
   - decision row → decisions/<slug>.md AND any framework page referencing it
4. Always-included: index.md, log.md
5. Render each affected page; compute hash; compare to compile_artifacts.content_hash
   for the same page_path on the previous run.
6. Write only if hash differs. Record artifact row regardless.
```

This makes the compilation agent **idempotent and cheap**. Re-running it without changes does ~0 file I/O.

### How contradictions are preserved

The renderer **never collapses contradictions** — it explicitly surfaces them:

1. When rendering a page (e.g. `topics/pricing.md`), the renderer pulls all relevant claims and groups them by stance using the `edges.kind='contradicts'` graph.
2. If two claims about the same proposition contradict, the renderer emits a callout block:

   ```markdown
   > [!warning] Contradiction
   > Two sources disagree on this point.
   > - **Claim A** (confidence 0.80, validated): "Customers will accept $99/mo."
   >   *— [[claim:01J9XABC]], cites [[source:01J9XSRC1]]*
   > - **Claim B** (confidence 0.65, hypothesis): "Customers will balk at anything over $49/mo."
   >   *— [[claim:01J9XDEF]], cites [[source:01J9XSRC2]]*
   ```

3. The frontmatter on every page includes `contradictions: <count>` so Dataview/index queries can surface "pages with unresolved tension" at a glance.
4. `topics/pricing.md` etc. are *required* to render the contradiction set even when one side has higher confidence. The compilation agent's CLAUDE.md-equivalent system prompt explicitly forbids smoothing.

### How confidence weighting and freshness work

- Frontmatter on every page: `confidence_avg`, `confidence_min`, `last_evidence_at`.
- Inline rendering: every claim citation shows its confidence as a badge: `[hypothesis 0.55]`, `[validated 0.92]`.
- Freshness filter at compile time: by default, claims with `status='superseded'` are excluded from page bodies but listed in a collapsed "Earlier views (superseded)" section to preserve audit trail.
- Stale data warning: if `last_evidence_at` for a page is > 90 days old, frontmatter gets `stale: true` and a banner is rendered at the top.

### Input/output contracts

**Input** (what the compilation agent receives from OneBrain):

```ts
interface CompilationInput {
  trigger: 'schedule' | 'on_demand' | 'source_added' | 'manual_topic';
  topic?: string;            // when topic-driven
  full?: boolean;            // when --full flag
  since: Date;               // last successful run time
}

// Repository function: src/compilation/plan.ts
async function planCompile(input: CompilationInput): Promise<{
  pages: Array<{
    path: string;
    kind: 'framework' | 'entity' | 'topic' | 'decision' | 'index' | 'log';
    claimIds: string[];           // stable ULIDs
    entityId?: string;
    contradictionEdges: Edge[];
  }>;
  runId: string;
}>;
```

**Output** (what the compilation agent writes to the vault):

```ts
// For each planned page:
async function renderAndWrite(page: PlannedPage): Promise<{
  pagePath: string;
  contentHash: string;
  written: boolean;             // false if hash matched existing
}>;
```

The Node renderer is deterministic and pure (claim set in → markdown out). The LLM is invoked from inside the renderer **only** for two specific narrative tasks:

1. **Section intros** (1–2 sentence prose connecting claims) — bounded, prompt-pinned, low temperature.
2. **Contradiction framing** — turning the structural contradiction-pair into 1 sentence of context. Also bounded.

This is the "deterministic core + LLM narrative" pattern: it makes compilation cheap, reproducible, and makes the wiki structurally trustworthy.

### Lint pass (scheduled trigger only)

Run once per scheduled compile (so daily-ish). The lint pass is a separate sub-agent invocation with a different prompt:

- Find orphan pages (no inbound `[[wikilinks]]`).
- Find concepts mentioned in claim text without a corresponding entity row.
- Find stale claims (`status='hypothesis'` and `created_at > 30 days ago` with no edges).
- Find tag rogues (`topic_tags` not in the `tags` registry).
- Write a `vault/lint-report.md` page (overwritten each run) with findings.
- Append a single `## [<date>] lint` entry to `vault/log.md`.

The lint pass **does not modify other pages** — it only writes the report. The user reviews and triggers cleanup explicitly.

---

## Wiki Vault Structure (Obsidian)

### Directory layout

```
vault/
├── index.md                         # The catalog (Karpathy's content-oriented index)
├── log.md                           # Append-only chronological log
├── lint-report.md                   # Latest lint findings (overwritten)
│
├── frameworks/                      # Strategic framework families (one page per framework)
│   ├── swot.md
│   ├── stp.md
│   ├── porters-five-forces.md
│   ├── 4ps.md
│   ├── brand-pyramid.md
│   ├── positioning-statement.md
│   ├── voice-and-tone.md
│   ├── messaging-architecture.md
│   ├── jtbd.md
│   ├── customer-journey.md
│   ├── icp.md
│   └── persona.md
│
├── entities/                        # One page per company / product / segment / etc.
│   ├── _<slug>.md                   # underscore prefix sorts these to top in Obsidian file tree
│   └── ...
│
├── topics/                          # Cross-cutting topical syntheses
│   ├── pricing.md
│   ├── go-to-market.md
│   ├── competitive-positioning.md
│   └── ...
│
├── decisions/                       # One page per decision row
│   └── 2026-04-25-target-segment.md
│
└── sources/                         # Lightweight stub per ingested source — link out + 1-paragraph summary
    └── source-01J9XSRC1.md
```

### Frontmatter convention (every page)

```yaml
---
id: 01J9XPAGE...                    # ULID for the page itself (stable across renames)
kind: framework                      # framework | entity | topic | decision | source | index | log
title: SWOT Analysis
slug: frameworks/swot
generated_at: 2026-04-25T14:32:00Z
generated_by: compilation-agent
compile_run_id: 01J9XRUN...
content_hash: sha256:abc123...
claim_ids:                           # stable IDs of every claim cited on this page
  - 01J9XABC...
  - 01J9XDEF...
entity_ids: []
topic_tags: [swot, strengths, weaknesses, opportunities, threats]
framework_tags: [swot]
confidence_avg: 0.74
confidence_min: 0.40
contradictions: 2
last_evidence_at: 2026-04-22T09:15:00Z
stale: false
status_breakdown:
  hypothesis: 4
  tested: 3
  validated: 2
  refuted: 0
---
```

### Link conventions

- **Wiki-links between pages**: standard Obsidian `[[entities/competitor-acme|Acme]]`.
- **Claim citations** (the critical evidence link): every claim is rendered as a quote block with a stable-ID footnote:

  ```markdown
  > Acme's Q4 pricing announcement put their entry tier at $39/mo.
  > — [[claim:01J9XABC]] confidence=0.85 status=validated
  > — sources: [[source:01J9XSRC1]] *(Acme Q4 press release, 2026-02-14)*
  ```

  The `[[claim:01J9XABC]]` syntax is a custom resolver — Obsidian will display it as plain text by default, which is fine; it's primarily an audit hook and a way for the chat UI to back-link.

- **Decision references**: `[[decisions/2026-04-25-target-segment]]` from any framework page. The decision page back-links to all claims that supported it via the `edges` table.

- **Source pages** are intentionally minimal (2–4 lines of summary + the URL + ingestion date). They exist to make the graph view show "this entity is connected to these sources" — the actual source content lives in `sources.raw_text` in Postgres, not the markdown.

### Index and log per Karpathy

- **`index.md`** is rebuilt from scratch each compile. Organized by the `kind` field:

  ```markdown
  # Index

  ## Frameworks
  - [[frameworks/swot|SWOT]] — 9 claims, 2 contradictions, last updated 2026-04-22
  - [[frameworks/stp|STP]] — 6 claims, 0 contradictions, last updated 2026-04-21
  ...

  ## Entities
  ### Companies
  - [[entities/competitor-acme|Acme]] — 14 claims, ICP match: yes
  ...

  ## Topics
  - [[topics/pricing|Pricing]] — 22 claims, 3 contradictions
  ...

  ## Decisions
  - 2026-04-25 — [[decisions/2026-04-25-target-segment|Target SMB fintech]]
  ...

  ## Sources (47)
  Listed in [[log|log.md]] chronologically.
  ```

- **`log.md`** is append-only. Entry prefix is `## [YYYY-MM-DD HH:MM] <kind> | <summary>` so the user (and the agent) can `grep "^## \[" log.md | tail -10` to see recent activity. Exactly the Karpathy convention.

### Mapping to the strategic-framework families in scope

| Family (PROJECT.md) | Page(s) under `vault/frameworks/` |
|---------------------|-----------------------------------|
| Classical positioning | `swot.md`, `stp.md`, `porters-five-forces.md`, `4ps.md` |
| Brand strategy | `brand-pyramid.md`, `positioning-statement.md`, `voice-and-tone.md`, `messaging-architecture.md` |
| JTBD / customer | `jtbd.md`, `customer-journey.md`, `icp.md`, `persona.md` |

Each framework page renders its claims in framework-specific structure (e.g. `swot.md` has four explicit `## Strengths / Weaknesses / Opportunities / Threats` sections that pull claims by `topic_tag`). Templates live in `src/compilation/render/page.ts` keyed by framework name.

---

## Multi-Agent Topology — Recommendation

### Recommended: Hierarchical Coordinator + Specialized Sub-agents

**One coordinator agent** (the chat-facing agent, system prompt = CLAUDE.md, model = Opus) that delegates to **five specialized sub-agents** via the Claude Agent SDK's `agents` parameter:

```
                          ┌──────────────────────────────┐
                          │   Coordinator (Opus)         │
                          │   - reads OneBrain + wiki    │
                          │   - chooses sub-agents       │
                          │   - synthesizes chat reply   │
                          └──────────────┬───────────────┘
                                         │ Agent tool
            ┌───────────────┬────────────┼────────────┬──────────────────┐
            ▼               ▼            ▼            ▼                  ▼
      ┌──────────┐    ┌──────────┐  ┌─────────┐  ┌─────────────┐  ┌──────────────┐
      │ research │    │ ingest   │  │financial│  │ devils-     │  │ compilation  │
      │ (Sonnet) │    │ (Sonnet) │  │ (Opus)  │  │ advocate    │  │ (Sonnet)     │
      │          │    │          │  │         │  │ (Sonnet)    │  │              │
      └─────┬────┘    └─────┬────┘  └────┬────┘  └──────┬──────┘  └──────┬───────┘
            │               │            │              │                │
            └────────┬──────┴────────────┴──────────────┘                │
                     ▼                                                   ▼
              ┌────────────┐                                    ┌────────────────┐
              │ OneBrain   │  (multi-writer safe)               │ vault/         │
              │ (Postgres) │                                    │ (single writer)│
              └────────────┘                                    └────────────────┘
```

### Why this topology, not the alternatives

**Vs. flat single-agent-with-tools.**
- Flat agents bloat one system prompt with everything (research instructions, financial-modeling instructions, ingest formatting, devil's-advocate framing, compilation rules). Quality degrades. Ablation studies on agent eval suites consistently show specialized prompts beat monolithic ones for tasks like ours.
- Context isolation matters here. The research sub-agent can read 20 web pages without poisoning the coordinator's context. The Agent SDK explicitly enables this — only the sub-agent's final message returns to the coordinator.
- Anthropic's "Building Effective Agents" guidance: choose the orchestrator-workers pattern when "you can't predict the subtasks needed." A research-dive on a competitor surfaces dozens of subtasks. This is exactly that.

**Vs. peer-to-peer agent-team with explicit communication channels.**
- Peer-to-peer (e.g. CrewAI's process model, LangGraph swarm) shines when peers genuinely need to converse mid-task. Our sub-agents don't — research collects evidence, financial calculates ratios, ingest structures sources. Each is a one-shot "input → write to OneBrain → return summary." Coordination through OneBrain rows is sufficient and robust.
- The Claude Agent SDK doesn't model peer-to-peer at all. Sub-agents cannot spawn sub-agents (per the SDK docs). So adopting peer-to-peer would mean abandoning the chosen framework — a stack-research-honoring red flag.
- Operationally simpler: there's exactly one chat conversation surface (the coordinator) and one human user. Peer-to-peer agent-teams pay a complexity tax we don't get a benefit from.

**Vs. one shared graph state (LangGraph supervisor-with-swarm).**
- Production-scale pattern; this is a single-user local app. Stack research already rejected LangGraph for this reason. Architecturally consistent with that decision.

### Sub-agent definitions

Each sub-agent is one `AgentDefinition` in `src/agents/definitions/`. Tool restrictions are enforced via the SDK's `tools` field:

| Sub-agent | Model | Tools (Allowed) | Notes |
|-----------|-------|-----------------|-------|
| `research` | Sonnet | `tavily_search`, `tavily_extract`, `tavily_crawl`, `onebrain_search`, `onebrain_write_source`, `onebrain_write_claim`, `onebrain_write_edge` | Reads web, writes structured findings to OneBrain. Cannot touch vault. |
| `ingest` | Sonnet | `tavily_extract`, `onebrain_write_source`, `onebrain_write_claim`, `onebrain_write_entity`, `onebrain_write_edge` | Convert one URL/file/transcript → 1 source row + N claims. Idempotent on `raw_text_hash`. |
| `financial` | **Opus** | `onebrain_search`, `onebrain_write_claim`, `onebrain_write_edge`, `Bash` (post-MVP for sympy/python eval) | Numeric reasoning is the harder model regime; uses Opus. v1 = no Bash; pure prompt math against retrieved assumptions. |
| `devils-advocate` | Sonnet | `onebrain_search`, `onebrain_write_claim`, `onebrain_write_edge` | Reads claim sets, writes counter-claims and `contradicts` edges. Explicit prompt: "your job is to surface weakness, not to be balanced." |
| `compilation` | Sonnet | `onebrain_search`, `vault_read`, `vault_write_atomic` | The *only* sub-agent allowed to invoke `vault_write_atomic`. Coordinator's tools list does NOT include `vault_write_atomic`, enforcing single-writer at the framework level. |

Models are chosen for cost/latency: Sonnet for retrieval and rendering, Opus for reasoning-heavy roles (coordinator and financial). Adjust based on observed quality.

### Coordinator's CLAUDE.md (key clauses)

The system prompt (`CLAUDE.md`) covers:

- **Identity**: critical thinking partner, evidence-first, hypothesis-by-default.
- **Write protocol** (the architectural commitment, restated for the agent):
  - All new findings go to OneBrain via the appropriate sub-agent.
  - The coordinator never writes to the vault. Period. The vault is the compilation agent's output.
  - The coordinator may invoke compilation on-demand if the user explicitly asks (e.g. "regenerate the SWOT page").
- **Confidence discipline**: when stating a claim, always retrieve from OneBrain first; cite the claim ID; if confidence < 0.5, frame as a hypothesis verbally.
- **Sub-agent usage rules**: when to invoke each sub-agent; required output shape (each sub-agent must return a structured summary so the coordinator can quote it back to the user).
- **Devil's-advocate trigger**: any claim with `confidence > 0.75` and `supporting_count < 2` should optionally trigger devils-advocate.

---

## Data Flow

### Ingest cycle (research → OneBrain → compilation → wiki)

```
User: "Research Acme's pricing model and add it to the wiki"
                 │
                 ▼
        ┌───────────────────┐
        │  Coordinator      │  decides to delegate
        └─────────┬─────────┘
                  │ Agent tool: invoke 'research' sub-agent
                  ▼
        ┌───────────────────┐    Tavily search + extract
        │ Research sub-agent├────────────────────────┐
        └─────────┬─────────┘                        │
                  │                                  ▼
                  │                    ┌─────────────────────────┐
                  │                    │ Web (Tavily API)        │
                  │                    └─────────────────────────┘
                  │ extracts N claims
                  ▼
        ┌───────────────────────────────────────────────────────┐
        │  OneBrain repository                                   │
        │   1. embed(source.raw_text) via Voyage                 │
        │   2. INSERT INTO sources (...) RETURNING id            │
        │   3. for each claim:                                   │
        │      - embed(claim.text)                               │
        │      - INSERT INTO claims (...) RETURNING id           │
        │      - INSERT INTO edges (kind=cites_source, ...)      │
        │   4. INSERT INTO event_log (kind=ingest, ...)          │
        └─────────┬─────────────────────────────────────────────┘
                  │ returns summary to research sub-agent
                  ▼
        ┌───────────────────┐
        │ Research sub-agent│  returns: "Added 7 claims about
        │  (final message)  │   Acme pricing, contradicting 1
        │                   │   existing claim. Topics: pricing,
        │                   │   competitor.acme."
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐  Coordinator emits chat reply.
        │  Coordinator      │  Also: enqueues recompile event
        │                   │  (debounced 30s) with topics.
        └─────────┬─────────┘
                  │
        (30s passes; no further ingests)
                  │
                  ▼
        ┌───────────────────┐  Compilation agent triggered
        │ Compilation agent │  by source_added event
        └─────────┬─────────┘
                  │ planCompile(since=last_finished_at)
                  ▼
        ┌───────────────────────────────────────────────────────┐
        │  OneBrain — list pages affected:                       │
        │   - topics/pricing.md   (claim topic_tag=pricing)      │
        │   - entities/competitor-acme.md (edge about_entity)    │
        │   - frameworks/porters-five-forces.md (claim framework)│
        │   - index.md, log.md (always)                          │
        └─────────┬─────────────────────────────────────────────┘
                  │ for each page:
                  ▼
        ┌───────────────────┐   render markdown deterministically
        │ Renderer (TS)     │   + LLM for narrative connectives
        │   src/compilation │
        │   /render/page.ts │
        └─────────┬─────────┘
                  │ markdown string + content_hash
                  ▼
        ┌───────────────────┐    if hash != prev: write
        │ Vault writer      │    atomic temp + rename
        │  (vault/*.md)     │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────────────────────────────────────────┐
        │  Postgres: INSERT INTO compile_artifacts (...)         │
        │            UPDATE compile_runs SET finished_at=now()   │
        │            INSERT INTO event_log (kind=compile, ...)   │
        └───────────────────────────────────────────────────────┘

User opens Obsidian → sees updated pages.
```

**Direction is enforced by tool gating.** The research sub-agent has no `vault_write_atomic` tool. The coordinator has no `vault_write_atomic` tool. Only the compilation sub-agent does. Trying to write to the vault from the wrong agent is a tool-not-found error from the SDK.

### Query cycle (user question → OneBrain + wiki cache → reply)

```
User: "What's our current SWOT view? What are the weakest claims?"
                 │
                 ▼
        ┌───────────────────┐
        │  Coordinator      │  classifies as a query
        └─────────┬─────────┘
                  │
       ┌──────────┴──────────────────────────────┐
       │ parallel reads (no sub-agents needed)   │
       ▼                                         ▼
┌──────────────┐                        ┌──────────────┐
│ vault read:  │                        │ OneBrain     │
│ frameworks/  │                        │ search:      │
│ swot.md +    │                        │ claims WHERE │
│ frontmatter  │                        │ framework_   │
│              │                        │ tag=swot     │
└──────┬───────┘                        │ ORDER BY     │
       │                                │ confidence   │
       │                                │ ASC LIMIT 10 │
       │                                └──────┬───────┘
       │                                       │
       └────────────────┬──────────────────────┘
                        ▼
        ┌───────────────────────────┐
        │  Coordinator synthesizes  │
        │   - quotes wiki narrative │
        │   - lists weak claims     │
        │   - cites claim IDs       │
        └─────────┬─────────────────┘
                  │ stream chunks via SSE
                  ▼
        ┌───────────────────┐
        │ assistant-ui chat │  renders message + citations
        └───────────────────┘
```

The wiki is the **cache for synthesis**, OneBrain is the **truth for filters**. Most queries pull from both. Pure structured queries ("list every claim with confidence < 0.4") skip the wiki entirely.

### Phase-2 wiki search (qmd)

Once the wiki has more than ~50 pages, qmd's MCP server is attached to the coordinator. The coordinator now has a `qmd_search` tool that does hybrid BM25+vector+rerank over the markdown files. Use this when the relevant claim set is too broad to assemble from tag filters alone (e.g., "summarize everything we know about why customers churn").

---

## Build Order — The "Smallest End-to-End Slice" Path

The hard constraint is: **OneBrain first, then compilation, then advanced features.** The path that gets us there with the smallest meaningful slice:

### Slice 0 — Walking Skeleton (the smallest end-to-end slice)

Goal: One source → one claim row → one rendered page. Zero polish.

1. Postgres + pgvector via Docker Compose.
2. `migrations/init.sql` with just `sources` + `claims` (no edges yet).
3. `src/onebrain/repo.ts` with `writeSource()` and `writeClaim()` only.
4. Voyage embedding client.
5. `src/compilation/render/page.ts` with one template (a single `topics/scratch.md`).
6. CLI script: `npm run scratch -- "https://example.com/article"` — fetches, ingests, compiles a one-page summary.

No agents, no chat, no UI. Verify: ingest writes to DB; recompile reads from DB; markdown appears in vault. **Stop here and validate the loop before adding anything else.**

### Slice 1 — Agents and Chat

1. Hono server + `POST /chat` SSE endpoint.
2. Coordinator agent (Claude Agent SDK `query()`) with CLAUDE.md.
3. Research sub-agent + Tavily integration (no ingest sub-agent yet — coordinator calls research directly with web URL or topic).
4. Add `entities` and `edges` tables.
5. assistant-ui chat in React (Vite app proxied through Hono).
6. Manual `POST /recompile` (no scheduling yet).

Now: chat with the agent, ask it to research X, see claims appear in pgAdmin, hit `/recompile`, see vault update.

### Slice 2 — Full Compilation + Schedule

1. `compile_runs` + `compile_artifacts` tables.
2. Diff-based plan algorithm (`src/compilation/plan.ts`).
3. Frontmatter, content-hash diffing, atomic vault writes.
4. node-cron triggering compilation every 6h.
5. `index.md` and `log.md` rendering.
6. Source-added debounced auto-recompile.

### Slice 3 — Multi-agent Maturity

1. Add `ingest`, `financial`, `devils-advocate` sub-agents.
2. Decisions table + decisions pages.
3. Confidence + status discipline enforced in CLAUDE.md.
4. Contradiction detection edges + rendering.
5. Promptfoo eval suite for "does the agent push back on weak evidence?"

### Slice 4 — Wiki Maturity

1. All strategic-framework pages (SWOT, STP, 4Ps, Porter, brand pyramid, JTBD, ICP, persona).
2. Lint pass (scheduled).
3. Stale flagging.
4. UI: confidence badges, claim citation rendering, tool-call traces.

### Slice 5 — Scale Tooling (only if needed)

1. qmd MCP server attached to coordinator (when wiki > 50 pages).
2. Exa as a secondary research tool (if semantic discovery becomes needed).
3. Financial sub-agent gets Bash + Python for real numeric work.

### Phase Dependencies (gates)

```
Slice 0 (DB + repo + render)
    │
    ├──→ Slice 1 (agents + chat) ──→ Slice 2 (compilation + cron) ──→ Slice 3 (multi-agent)
    │                                          │                              │
    │                                          └──→ Slice 4 (wiki maturity) ──┘
    │                                                       │
    │                                                       └──→ Slice 5 (scale tooling)
    │
    └──→ (UI scaffolding can begin in parallel with Slice 1)
```

**Things that can be built in parallel safely**:
- UI scaffolding (Vite + assistant-ui shell) parallel with Slice 1's coordinator.
- Promptfoo eval harness parallel with Slice 3 (write tests against agents as they're built).
- Migration files for later tables (`decisions`, `compile_runs`) can be drafted early but applied just-in-time.

**Things that gate strictly**:
- No agents until Slice 0 proves the round-trip.
- No diff-based compilation until `compile_artifacts` exists (Slice 2).
- No devil's-advocate sub-agent until `edges` exists with `contradicts` kind.
- No qmd until index.md exists (Slice 2 dependency for Slice 5).

---

## Boundary Design — What Lives Where

| Concern | Lives in… | Why |
|---------|-----------|-----|
| Behavioral identity (be critical, evidence-first, hypothesis-by-default) | `CLAUDE.md` (root) | Loaded by Agent SDK as the coordinator's system prompt. Easy to iterate without redeploying. |
| Sub-agent personalities and tool restrictions | `src/agents/definitions/*.ts` | TypeScript so they're typechecked and version-controlled with the schema they use. |
| Write protocol enforcement (vault is single-writer) | Tool gating via Agent SDK `tools` field + repository pattern | Two layers: agent-side (no tool means no action) + code-side (only `src/compilation/vault-writer.ts` calls `fs.writeFile` on `vault/`). |
| Database schema (truth) | `migrations/*.sql` | Constraint requirement (node-pg-migrate). Single source of truth. |
| Database queries (typed) | `src/onebrain/repo.ts` (Drizzle) | Type-safe queries; mirrors migrations but is *not* the truth. |
| Domain validation rules (claim text non-empty, confidence ∈ [0,1]) | `src/onebrain/types.ts` (Zod) | Validated at the API boundary AND when an agent tool writes. Belt + suspenders. |
| OneBrain row data | Postgres tables | Durable, transactional, queryable. |
| Embeddings | Postgres `vector(1024)` columns | Co-located with the rows they describe — eliminates drift. |
| Compiled wiki pages | `vault/**.md` files (filesystem) | Obsidian-native; git-versioned; user-browsable. |
| Page-to-claim provenance | Frontmatter `claim_ids:` array + `compile_artifacts.source_claim_ids` | Two copies: in-file (for portability) + in-DB (for query). |
| Compilation run history | `compile_runs` + `compile_artifacts` | Diff detection requires DB-side state; vault file timestamps are insufficient. |
| HTTP server logic | `src/server/routes/*.ts` (Hono) | Thin; no business logic. |
| Streaming protocol | Hono SSE + AI SDK 6 transport | assistant-ui-compatible. |
| Chat UI | `src/ui/` (Vite) | Standard React app. Vault rendering happens in Obsidian, not here. |
| Scheduled jobs | `node-cron` registered in `src/server/index.ts` | In-process; no Redis. |
| Web research | `src/agents/tools/tavily.ts` | Tool definition; called only from research sub-agent. |
| Wiki search (Phase 2) | `qmd` MCP server (out-of-process) | Attached to coordinator via Agent SDK MCP integration. |
| Logs (operational) | `event_log` table + pino to stderr | DB log is queryable from agents; pino log is for the developer. |

**The Karpathy "schema document"**: in Karpathy's gist, this is the AGENTS.md/CLAUDE.md that tells the LLM how the wiki is structured. In our hybrid, this role splits in two:
- **Coordinator behavior** lives in `CLAUDE.md` (what Karpathy calls the schema doc).
- **Wiki page templates** live in `src/compilation/render/page.ts` (deterministic; not in CLAUDE.md). This is a deliberate departure from Karpathy: in the pure-wiki model, the LLM owns the rendering decisions. In our hybrid, the LLM only writes narrative connectives and contradiction framing — the structure is code. This keeps the wiki structurally trustworthy across hundreds of recompiles.

---

## Architectural Patterns

### Pattern 1: Single-Writer Wiki via Tool Gating

**What:** Multiple agents and code paths all need to "update the wiki." Instead of letting any of them write, only one (the compilation agent) has the `vault_write_atomic` tool. All other agents update OneBrain; the compilation agent reads OneBrain and writes the vault.

**When to use:** Whenever you have a high-write-contention artifact (markdown, JSON, anything with merge conflicts) being maintained from multiple concurrent sources.

**Trade-offs:** Requires a compilation step (latency between OneBrain write and wiki visibility). The trade is worth it: zero merge conflicts, the wiki is always coherent, history is trivially traceable.

```typescript
// src/agents/definitions/compilation.ts
export const compilationAgent: AgentDefinition = {
  description: 'Renders the Obsidian vault from OneBrain. The only writer to vault/.',
  prompt: COMPILATION_SYSTEM_PROMPT,
  tools: ['onebrain_search', 'vault_read', 'vault_write_atomic'], // <- only here
  model: 'sonnet',
};

// src/agents/definitions/research.ts
export const researchAgent: AgentDefinition = {
  description: 'Researches topics on the web and writes findings to OneBrain.',
  prompt: RESEARCH_SYSTEM_PROMPT,
  tools: ['tavily_search', 'tavily_extract', 'onebrain_write_claim', /* note: NO vault_* */],
  model: 'sonnet',
};
```

### Pattern 2: Deterministic Renderer + LLM Connectives

**What:** Wiki rendering is mostly deterministic TypeScript that takes typed claim sets and emits markdown. The LLM is invoked from inside the renderer only for two narrow tasks: section intros (1–2 sentences) and contradiction framing.

**When to use:** Any time you're producing a structured artifact from structured data and want to (a) keep output stable across runs, (b) make diffing meaningful, (c) avoid LLM hallucination in structural choices.

**Trade-offs:** Less expressiveness than letting the LLM render freely. Pages look templated. For our use case (investor-grade defensibility), templated is exactly what we want.

```typescript
// src/compilation/render/page.ts
export async function renderFrameworkPage(
  framework: 'swot' | 'stp' | '4ps' | 'porter',
  claims: Claim[],
  edges: Edge[]
): Promise<{ markdown: string; hash: string }> {
  const grouped = groupClaimsForFramework(framework, claims); // deterministic
  const contradictions = findContradictionPairs(claims, edges); // deterministic

  const sections = await Promise.all(
    grouped.map(async (group) => {
      const intro = await llmIntro(group); // LLM, bounded prompt
      return renderSection(group, intro); // deterministic
    })
  );
  const contradictionBlock = await renderContradictions(contradictions); // LLM only for framing

  return assemble(frontmatter(framework, claims), sections, contradictionBlock);
}
```

### Pattern 3: Repository as Coercive Boundary

**What:** Every code path that talks to OneBrain goes through `src/onebrain/repo.ts`. Agent tools, HTTP routes, the compilation agent — all of them. There is no `db.query(...)` outside this file.

**When to use:** Whenever multiple callers need consistent invariants around a data store (validation, embedding generation, audit logging).

**Trade-offs:** A small amount of indirection. The win: when we change "every claim write must also generate an embedding," we change one place.

### Pattern 4: Idempotent Compilation via Content Hash

**What:** Each rendered page produces a sha256 hash. Before writing, compare to the most recent successful `compile_artifacts.content_hash` for the same `page_path`. Skip the write if equal.

**When to use:** Any artifact-producing pipeline where the producer might be triggered more often than the inputs change.

**Trade-offs:** Small CPU cost (hashing). Eliminates spurious file changes, makes git history meaningful, makes Obsidian's "modified at" timestamps trustworthy.

### Pattern 5: Stable IDs in Frontmatter for Bidirectional Provenance

**What:** Every wiki page lists its supporting claim ULIDs in YAML frontmatter. The chat UI can take a wiki excerpt, parse frontmatter, and surface "this section is supported by these specific claims; click to inspect." The compilation agent can find pages affected by a claim by querying frontmatter directly (or `compile_artifacts.source_claim_ids`).

**When to use:** Any system where downstream artifacts need to be traceable back to upstream rows after generation.

**Trade-offs:** Frontmatter bloat (can be 50+ ULIDs on dense pages). Acceptable; markdown is cheap.

---

## Anti-Patterns (Specific to This System)

### Anti-Pattern 1: Letting the Coordinator Write to the Vault

**What people do:** "The chat just decided X — let me also drop a paragraph about it into `frameworks/swot.md` so it's saved."
**Why it's wrong:** Breaks single-writer guarantee. Two writers means merge conflicts, inconsistent state, and a wiki that drifts from OneBrain truth.
**Do this instead:** Coordinator writes a claim to OneBrain (kind=`inference` or `decision`). Trigger recompile. Compilation agent updates the SWOT page from claims.

### Anti-Pattern 2: Embedding Whole Documents Instead of Atomic Claims

**What people do:** "I'll embed the whole article and search by article."
**Why it's wrong:** Retrieval returns articles, not claims. Synthesis quality plummets because the agent can't pin a specific assertion to a specific source. Also makes evidence-linking back to OneBrain useless ("which sentence in this 4000-word article supports X?").
**Do this instead:** Embed both. The `claims.embedding` is the primary retrieval target for synthesis; `sources.embedding` is for "find the source document for this article" lookups.

### Anti-Pattern 3: Smoothing Contradictions Into "On Average"

**What people do:** Two claims disagree on price; render synthesis says "approximately $74/mo."
**Why it's wrong:** Nate B Jones explicitly called this out as the wiki's most dangerous failure mode — confident-sounding misinformation that erases the strategic signal of disagreement.
**Do this instead:** Both claims are rendered, both confidences shown, the disagreement is the page's key feature, not a bug.

### Anti-Pattern 4: Storing Confidence as a Free-Text Field

**What people do:** `claims.confidence text NOT NULL DEFAULT 'medium'`.
**Why it's wrong:** Can't filter, can't sort, can't compute averages, can't apply mathematical decay over time.
**Do this instead:** `numeric(3,2)` in `[0, 1]`. Mappings to verbal labels happen at the rendering layer (`>= 0.85` = "validated"; `0.5–0.85` = "supported"; `< 0.5` = "hypothesis").

### Anti-Pattern 5: Recompiling on Every Claim Write

**What people do:** "When the user adds a claim, regenerate the whole wiki."
**Why it's wrong:** Expensive (token cost), slow, produces an unstable wiki (every chat turn rewrites pages), and will fight with Obsidian's file watcher.
**Do this instead:** Debounced source-added triggers (30s window) + on-demand button + scheduled (every 6h). Diff-based: only pages whose claim set changed get rerendered.

### Anti-Pattern 6: One Mega-Tool That Does Everything

**What people do:** A single `onebrain` tool with operations like `{op: 'write_claim', ...}` or `{op: 'search', ...}`.
**Why it's wrong:** The agent has to learn the discriminated union; tool descriptions become long; argument validation is harder; the LLM picks the wrong `op` more often than you'd expect.
**Do this instead:** Distinct tools per operation: `onebrain_write_claim`, `onebrain_write_source`, `onebrain_write_edge`, `onebrain_search`. Each has a tight Zod schema. The LLM picks the right tool by description.

### Anti-Pattern 7: Putting Wiki Page Templates in CLAUDE.md

**What people do:** "Tell the LLM in CLAUDE.md how to render a SWOT page so it can do it itself."
**Why it's wrong:** Karpathy's pattern works at small scale because there's a single LLM doing both ingest and rendering with a coherent style. At our scale (multi-agent, scheduled, idempotent), letting the LLM choose structure means non-deterministic rendering — pages drift in style across compiles, hashes never match, the diff system breaks.
**Do this instead:** Templates in code (`src/compilation/render/`). LLM only for narrative connectives. CLAUDE.md handles behavior, not rendering.

### Anti-Pattern 8: Trusting Filesystem Timestamps for "What Changed"

**What people do:** "If the file's mtime is older than the latest claim's `updated_at`, recompile."
**Why it's wrong:** Obsidian touches files (plugin sync, formatting); user might `git checkout` an older vault; mtime gets reset on rename. Filesystem timestamps lie.
**Do this instead:** `compile_artifacts.content_hash` is the source of truth for "what was last written by us." Compare claim updates to last successful run, then compare rendered hash to artifact hash.

---

## Scaling Considerations

This is a single-user local app, but for completeness:

| Scale | What Breaks First | Adjustment |
|-------|-------------------|------------|
| 1 user, < 1k claims, < 50 wiki pages (v1) | Nothing. index.md scan + pgvector HNSW handles it. | Ship as designed. |
| 1 user, 1k–10k claims, 50–200 wiki pages | index.md becomes too large to scan; coordinator wastes tokens reading it. | Attach qmd MCP server. Wiki retrieval becomes hybrid BM25+vector+rerank. |
| 1 user, 10k–100k claims, > 200 wiki pages | Compilation full-rebuild becomes slow (minutes); diff detection still scales fine. | Topic-driven recompile becomes the only sensible mode; full rebuild becomes a `--maintenance` flag. |
| 1 user, > 100k claims | HNSW build/insert latency starts mattering on bulk imports. | Keep using HNSW; consider `IVFFlat` only if bulk-import speed beats query latency in priority. |
| Multi-user (out of scope; future) | node-cron in-process; no auth; vault is per-user. | Replace node-cron with BullMQ; add auth; partition vault by user; OneBrain rows get `user_id`. |

For v1: zero scaling work needed. The architecture explicitly supports the >1k case via diff-based compilation + qmd, and we know exactly what to do.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API (Claude Opus/Sonnet) | Claude Agent SDK (server-side) | API key in `.env`. Agent SDK handles streaming, retries, message formatting. |
| Voyage AI (embeddings) | `voyageai` npm SDK, called from `src/onebrain/embed.ts` | Synchronous on write — claim is not committed until embedded. Acceptable; Voyage latency is < 200ms typical. Batch when possible (research sub-agent finds 7 claims → batch-embed in one call). |
| Tavily (web search) | `@tavily/core` SDK, exposed as agent tool | Tool args validated by Zod; the agent picks `search`, `extract`, or `crawl` based on task. |
| qmd (Phase 2) | MCP client → qmd's MCP server (local) | Started as a child process by the app, attached via `mcpServers` in coordinator's options. |
| Obsidian | Filesystem only — read `vault/*.md` | The app never talks to Obsidian via API. Obsidian opens `vault/` as a regular folder. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Coordinator ↔ Sub-agents | Agent SDK Agent tool (in-process; subagent's final message returns to coordinator) | Per Agent SDK docs: subagent context isolated; only final message returned. |
| Sub-agents ↔ OneBrain | Custom Agent SDK tool (`onebrain_*`) → `src/onebrain/repo.ts` → Drizzle/pg | Tool args are Zod-validated. Repo applies invariants (embed-on-write, audit log row). |
| Compilation agent ↔ vault | Custom Agent SDK tool (`vault_write_atomic`) → `src/compilation/vault-writer.ts` → fs | Atomic via temp file + rename. Hash check before write. |
| App ↔ Postgres | `pg` driver pool (connection-pooled) | Single pool created at startup. |
| Cron ↔ Compilation agent | Function call (in-process) | node-cron schedules a function that invokes the compilation agent's runner. |
| Frontend ↔ Backend | HTTP + SSE on `localhost` | assistant-ui's `AssistantChatTransport` configured against Hono's `/chat` endpoint. |
| Frontend ↔ Obsidian | Independent processes; no integration | User opens Obsidian separately. The chat UI displays markdown chunks inline (not Obsidian's renderer). |

---

## Sources

### Hard architectural commitments (from project)
- `.planning/PROJECT.md` — hybrid pattern, single-writer wiki, confidence + status fields, contradiction preservation, stable IDs
- `.planning/inputs/karpathy-llm-wiki-gist.md` — three-layer pattern, index/log conventions, "you don't write the wiki yourself"
- `.planning/inputs/nate-b-jones-hybrid-transcript.md` — write/query fork, contradiction-as-signal, AI-as-writer-vs-reader, compilation agent on schedule + on-demand

### Stack research (already decided; honored here)
- `.planning/research/STACK.md` — Claude Agent SDK, Hono, Drizzle + node-pg-migrate, pgvector + Voyage 3.5, node-cron, assistant-ui, Tavily, qmd

### Anthropic guidance (HIGH confidence)
- [Building Effective Agents — Anthropic](https://www.anthropic.com/engineering/building-effective-agents) — orchestrator-workers when subtasks unpredictable; start simple, add complexity only when warranted
- [Subagents in the SDK — Claude Agent SDK Docs](https://code.claude.com/docs/en/agent-sdk/subagents) — subagent context isolation, final-message-only return, `tools` field for restriction, no nested subagents
- [Claude Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — `query()` API, `agents` parameter, tool gating

### pgvector (HIGH confidence)
- [pgvector v0.8.2](https://github.com/pgvector/pgvector) — HNSW + IVFFlat, distance ops (`<=>` cosine, `<->` L2, `<#>` IP), 2000-dim limit, default `m=16, ef_construction=64`

### Voyage embeddings (HIGH confidence)
- [Voyage embeddings docs](https://docs.voyageai.com/docs/embeddings) — `voyage-3.5` default 1024-dim, 32k context, configurable `output_dimension`, shared vector space across 3.x/4.x

### Patterns
- Karpathy's wiki pattern (compile-on-ingest) and Nate B Jones's hybrid commentary are the load-bearing references. The deterministic-renderer-with-LLM-connectives pattern is a deliberate departure justified above (Anti-Pattern 7).

---

*Architecture research for: Single-user local AI-agent app with Karpathy wiki + OneBrain hybrid memory*
*Researched: 2026-04-25*
