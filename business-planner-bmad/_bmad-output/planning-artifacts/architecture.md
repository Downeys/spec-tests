---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-business-planner-bmad.md
  - _bmad-output/planning-artifacts/product-brief-business-planner-bmad-distillate.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
project_name: 'business-planner-bmad'
user_name: 'Downe'
date: '2026-04-22'
completedAt: '2026-04-22'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 43 FRs across 7 categories.

| Category | FRs | Architectural driver |
|---|---|---|
| Chat & Conversation | FR1–FR6 | Streaming token display with expandable thinking/tool-call detail. Drives streaming-first API + conversation-view component with virtualization for 200+ messages. |
| Research & Evidence | FR7–FR11 | Sourced web research via Tavily; evidence + source-URL persistence; confidence-level signaling. Drives a research tool with structured output that survives into Pinecone. |
| Critical Thinking & Challenge | FR12–FR19 | Skeptic sub-agent with calibrated pushback; steelmanning mode; intelligence preservation independent of user decisions; immutable decision logs. Drives the multi-agent topology decision and decision-log schema. |
| Knowledge Management | FR20–FR25 | Pinecone project-scoped storage; retrieval; staleness flagging; checkpoint data; explicit "no-data" findings. Drives Pinecone schema + RAG retrieval strategy. |
| Methodology Wiki | FR26–FR32 | **Karpathy three-layer wiki pattern** (see below). Wiki is markdown + git + wikilinks + `index.md`-driven navigation; Obsidian is the user's IDE. Agent has direct filesystem access for read/write. No vector DB for wiki at Phase 1 scale. |
| Session Management | FR33–FR38 | Context-health gauge; user-triggered checkpoint; Pinecone-based resume with context reconstruction; stopping-point suggestions; last-checkpoint summary. Drives session-state schema + resume protocol. |
| Project Management | FR39–FR43 | Multiple projects via `projectId`; isolated intelligence per project; wiki carryover; per-project cost visibility. Drives namespacing discipline + cost-meter architecture. |

**Non-Functional Requirements:** 14 NFRs.

| Category | NFRs | Architectural driver |
|---|---|---|
| Integration | NFR1–NFR5 | Graceful handling of Claude/Tavily/Pinecone failures; `.env`-only API keys; degraded modes when services unreachable. Drives per-dependency error-handling patterns + explicit "degraded" UI signaling. |
| Data Integrity | NFR6–NFR10 | Confirmed Pinecone writes; atomic wiki writes (temp-file + rename); immutable decision logs; checkpoints sufficient for reconstruction; Postgres in Docker with named volume. |
| Performance | NFR11–NFR14 | UI stays responsive during processing; streaming starts within 3s of send; resume within 15s; 200+ message history without rendering lag. Drives streaming-first API + virtualized conversation view + non-blocking backend work patterns. |

**Scale & Complexity:**

- **Complexity level:** medium. High technical ambition (multi-agent orchestration, RAG, session continuity) offset by radical simplifications (single user, no auth, no multitenancy, no mobile/responsive, Chrome-only, local deploy, no compliance).
- **Primary domain:** full-stack web SPA with AI-agent orchestration backend.
- **Estimated architectural components (high-level):** chat UI + streaming transport + agent orchestrator + skeptic sub-agent + research tool + wiki file-store (Karpathy pattern) + Pinecone client/schema (intelligence only) + session checkpoint service + cost meter + project manager.

### Reference Pattern: Karpathy's LLM Wiki

The methodology wiki implements [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). Non-negotiable elements of that pattern:

- **Three layers**
  - **Raw sources** (immutable, human-curated) — documents, articles, PDFs, clippings the user feeds in.
  - **Wiki** (LLM-owned markdown) — summaries, entity pages, concept pages, synthesis pages, cross-linked via `[[wikilinks]]`. The agent owns this layer entirely: creates pages, updates them, maintains cross-references, keeps it consistent.
  - **Schema file** (human-curated rules) — a CLAUDE.md-like document encoding wiki structure, page conventions, ingest/query/lint workflows, contradiction policy. Co-evolves with the user over time.
- **`index.md` is primary navigation.** Agent reads the index first, then drills into relevant pages by link-following. At Phase 1 scale, **this replaces vector-based wiki retrieval entirely.**
- **Three core workflows:** ingest (process a new source → summary page + cross-reference updates), query (answer user question by reading pages, optionally file the synthesis back as a new page), lint (periodic health-check for contradictions, stale claims, orphans, missing pages).
- **Git-versioned.** The wiki is a git repo; version history, diff, rollback come free.
- **Append-only `log.md`** records every ingest/query/lint pass with timestamps. Complements (not replaces) Pinecone's decision log.
- **Obsidian is the user's IDE** for wiki browsing and editing. The chat UI does not need a wiki editor surface — dramatically simplifies FR26–FR32.
- **Hybrid search (`qmd` or similar) is deferred.** Not needed at Phase 1 scale; revisit if index.md becomes unwieldy.

### Technical Constraints & Dependencies

- **Hard tech stack constraints (already decided):** React frontend, Node/TypeScript backend, Claude Opus primary model, Pinecone (serverless) vector store, Tavily (or equivalent) web research, Postgres in local Docker (Phase 2), Chrome latest desktop-only, local deploy, no auth.
- **Wiki implementation pattern (decided):** Karpathy three-layer LLM wiki with Obsidian as the user's IDE.
- **External API hard dependencies:** Claude, Tavily, Pinecone — no offline mode. Each must fail gracefully without crashing the chat.
- **Orchestration framework — UNRESOLVED:** LangChain/LangGraph vs. Claude Agent SDK.
- **Agent topology — UNRESOLVED:** coordinator pattern vs. agent-team, driven by skeptic sub-agent context-sharing needs.
- **NotebookLM — UNRESOLVED, speculative:** candidate role as (a) human-facing Q&A layer over the wiki, (b) source-curation staging area before wiki ingest, or (c) reference model for citation UX. Step 4 evaluation must weigh its limited API surface.
- **Schema file vs. CLAUDE.md — UNRESOLVED:** Karpathy's schema file and the agent's business-planning identity (CLAUDE.md) overlap. Step 4 must define the file boundary.
- **Financial compute constraint (Phase 2 forward-looking):** agent does NOT perform math; deterministic compute layer in Node API exposed as tools. Phase 1 architecture must not preclude this.
- **Data-integrity constraints:** confirmed writes before user sees "saved" (NFR6); atomic wiki writes via temp-file + rename (NFR7); immutable decision logs (NFR8).
- **Dev-experience constraint:** solo developer prioritizing code quality over speed; architecture must support maintainable, readable code, not expedient shortcuts.

### Cross-Cutting Concerns Identified

1. **Streaming & real-time UI updates** — every feature surface streams (tokens, thinking, tool calls, skeptic, tool results). Transport choice (SSE vs. WebSockets) affects every component.
2. **External-API resilience** — Claude, Tavily, Pinecone each need retry/fallback patterns; UI must distinguish "agent thinking" from "API failing" from "degraded capability."
3. **Cost tracking** — Claude tokens, Tavily queries, Pinecone operations must all be metered per session and per project (FR43).
4. **Project-scoped data isolation** — `projectId` is the namespace key for Pinecone (and future Postgres). The wiki explicitly crosses this boundary (global methodology). Every data access path must be either `projectId`-scoped or explicitly cross-project.
5. **Context/session continuity** — context-health gauge, checkpoint format, resume reconstruction span the full session lifecycle and touch UI, backend, and Pinecone.
6. **Observability of agent internals** — thinking, tool calls, sub-agent activity, costs, context health, and wiki ingest/query/lint events all need to be visible without polluting signal with noise. Drives a structured "agent event" stream that the UI renders selectively.
7. **Immutability vs. mutability discipline** — decision logs immutable (Pinecone); wiki editable with git as the safety net; Pinecone intelligence generally append-only with staleness flagging; `log.md` append-only. Conventions must be explicit so AI coding agents don't accidentally overwrite.
8. **Wiki filesystem as a first-class data store** — the wiki is not a "cache" or "document" — it is a primary data store the agent reads and writes on every turn. Filesystem access from the Node backend must be safe, transactional, and auditable.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack TypeScript with explicit frontend/backend split:
- **Frontend:** React SPA (no SSR, no routing framework, Chrome desktop only)
- **Backend:** Long-lived Node service for AI orchestration, streaming, and heavy I/O to Claude/Tavily/Pinecone + filesystem wiki

Single-framework full-stack starters (Next.js, T3, Remix) were ruled out — SSR/app-router overhead is wasted for a local single-user SPA, and API routes are awkward for long-running streaming + multi-agent orchestration.

### Starter Options Considered

| Option | Verdict | Why |
|---|---|---|
| Next.js / T3 / Remix full-stack | Rejected | SSR unused; NextAuth/Prisma assumptions inapplicable (no auth; Postgres comes later and we're not using Prisma); API routes awkward for streaming + sub-agent orchestration |
| Two separate folders, no monorepo | Rejected | Duplicated TS types and schema drift risk — streaming event schema, `projectId` shape, and decision-log shape are central to nearly every feature |
| **pnpm monorepo: Vite+React+TS ↔ Fastify+TS + shared types package** | **Selected** | Clean separation of concerns; shared types eliminate drift; room for Phase 2 compute package; Turborepo caching available when wanted |

### Selected Starter: pnpm monorepo (assembled from official templates)

**Rationale for Selection:**
- No canonical "BMAD-like" opinionated starter exists for this niche (local single-user AI workbench). Commercial boilerplates bundle auth/SSR/marketing pages we don't want.
- Assembled monorepo uses **official, current, well-maintained scaffolds only** (Vite `react-ts` template, Fastify ecosystem, pnpm workspaces, Turborepo).
- Shared types package directly addresses one of our top integration risks: frontend and backend must agree on streaming event shape, agent event types, and domain types (Project, Session, DecisionLog, ResearchFinding).
- Fastify's streaming support is first-class, matching our streaming-first architecture.
- Both candidate orchestration frameworks (Claude Agent SDK, LangGraph-JS) are Node-native — this starter doesn't bias the Step 4 decision.

**Target Repository Structure:**

```
business-planner/
├── apps/
│   ├── web/          # Vite + React + TS SPA (chat UI)
│   └── server/       # Fastify + TS (AI orchestration, tool surface)
├── packages/
│   └── shared/       # TS types: streaming event schema, API contract, domain types
├── wiki/             # Karpathy wiki (git-tracked markdown, Obsidian vault)
├── docker/           # docker-compose for Postgres + pgAdmin (Phase 2)
├── pnpm-workspace.yaml
├── turbo.json        # optional
└── package.json
```

**Initialization Commands:**

```bash
# 1. Scaffold monorepo
mkdir business-planner && cd business-planner
pnpm init
# Add pnpm-workspace.yaml with: packages: ['apps/*', 'packages/*']

# 2. Frontend
pnpm create vite@latest apps/web -- --template react-ts

# 3. Backend
mkdir -p apps/server && cd apps/server
pnpm init
pnpm add fastify @fastify/cors
pnpm add -D typescript @types/node tsx vitest
cd ../..

# 4. Shared types package
mkdir -p packages/shared/src && cd packages/shared
pnpm init
cd ../..

# 5. (Optional) Turborepo
pnpm add -D -w turbo
# Add turbo.json with build/dev/test pipelines
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (strict mode) both sides
- Node 22 LTS (latest LTS at setup time — verify current version when scaffolding)
- pnpm 9.x workspaces as package manager

**Frontend Stack (Vite `react-ts` template):**
- React 19 (latest major)
- Vite 5.x (latest major — verify at setup)
- TypeScript strict
- React Compiler disabled by default (can enable later if desired)

**Backend Stack (Fastify assembled):**
- Fastify 5.x (latest major — verify at setup)
- `@fastify/cors` for local dev cross-origin
- `tsx` for dev-time TS execution
- Plugin-oriented architecture aligned with our bounded contexts

**Build Tooling:**
- Vite (frontend bundler, HMR)
- `tsx` (backend dev runner)
- Turborepo (optional — incremental builds and task caching when wanted)

**Testing Framework:**
- Vitest on both sides (unified; TS-native; fastest)

**Code Organization:**
- Monorepo with `apps/` and `packages/` convention (Turborepo's standard split)
- `packages/shared` for cross-cutting TS types — enforces single source of truth for schemas
- Wiki directory at repo root (Obsidian-vault-compatible)

**Development Experience:**
- HMR on frontend via Vite
- Backend hot reload via `tsx watch`
- ESLint + Prettier (flat config)
- Shared TS types: change once, both apps pick it up

**Additional Styling/State Decisions (recommended — finalize in Step 4):**
- Tailwind CSS for styling
- TanStack Query for server-state caching (streaming event state stays in React; structured data comes through Query)

**Decisions DEFERRED to Step 4:**
- Orchestration framework (Claude Agent SDK vs. LangGraph-JS)
- Streaming transport (SSE vs. WebSocket)
- Pinecone client library + schema
- Agent topology (coordinator vs. agent-team)
- Wiki module API boundary
- Styling confirmation (Tailwind)
- Server-state library confirmation (TanStack Query)

**Note:** Project scaffolding using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**
- Orchestration framework: **Claude Agent SDK for TypeScript (v1 stable)**
- Agent topology: **orchestrator + single skeptic sub-agent; research is a tool, not a sub-agent**
- Vector store schema: **single Pinecone index, namespace = projectId, metadata-filter by `record_type`**
- Streaming transport: **Server-Sent Events (SSE)**
- API style: **REST + JSON + SSE (no tRPC, no GraphQL)**
- Session checkpoint format: **Pinecone record with prose `conversation_summary` as embedding source**
- Cost-tracking mechanism: **append-only JSONL at `data/costs/{projectId}.jsonl`**
- Wiki/agent rule split: **two files — `CLAUDE.md` (agent identity) + `wiki/SCHEMA.md` (Karpathy schema rules)**

**Important Decisions (shape architecture):**
- Embedding model: **Voyage AI `voyage-3-large`** (1024-d, MIT-compatible cost profile at scale)
- Context gauge thresholds: **green <60% / yellow 60–80% / red >80%**
- Skeptic context strategy: **explicit bundle-passing** (orchestrator hands skeptic only the claims + evidence packet it needs)
- Tool registration: **native Claude SDK tools with `PreToolUse` / `PostToolUse` hooks** for cost metering + audit
- Per-dependency retry policy: **Claude exponential backoff ×3; Tavily single retry then surface "research degraded"; Pinecone write blocks until confirmed, read falls back to prior cached result**
- Frontend state: **Zustand (streaming/session) + TanStack Query (HTTP reads)** — no Redux, no Context-as-store
- Component organization: **`features/*` folders, no React Router** (single SPA view)
- Dark mode: **default and only theme** (preference memory)
- Observability surface: **in-UI only, no external APM**
- Runtime data root: **`./data/` in-repo, gitignored, 5 log streams**

**Deferred Decisions (post-Phase 1, explicit out-of-scope now):**
- NotebookLM integration — functional overlap with existing Pinecone + orchestrator; revisit only if Phase 2 needs a polished human-facing Q&A surface
- Postgres schema + deterministic compute layer — Phase 2 concern; docker-compose file in repo now, no migrations yet
- Wiki hybrid search (Karpathy's `qmd`-style) — not needed while `index.md` navigation suffices
- PDF/PPTX export, NotebookLM output piping, polished branded docs — explicitly Phase 2+

### Data Architecture

**Vector store — Pinecone serverless (`@pinecone-database/pinecone` v4.x line):**
- **Single index** named `business-planner-intelligence`
- **Namespace per project**, keyed on `projectId` (FR39–FR41 isolation)
- **Metadata filter `record_type`** routes queries across 5 record types in the same namespace:
  1. `research_finding` — structured research output, sourced, confidence-tagged (FR9, FR10)
  2. `evidence` — individual citations with source URL, extracted quote, timestamp (FR8)
  3. `decision_log` — **immutable** (NFR8); captures decision + user choice + evidence state at decision time + "decided against evidence" flag (FR17, FR18)
  4. `session_checkpoint` — prose summary + open-questions + intelligence manifest + context stats (FR35, FR36, FR38)
  5. `intelligence_brief` — agent-authored syntheses over findings (FR11)
- **Embedding model:** Voyage AI `voyage-3-large` via `voyageai` SDK. Rationale: higher retrieval quality than OpenAI `text-embedding-3-small` at comparable cost; no sycophancy bias from the same vendor as the primary model.
- **Write confirmation (NFR6):** every Pinecone write awaits the server ack before the UI surfaces "saved"; failed writes raise `pinecone_write_failure` and surface a retry affordance — no silent drops.
- **Staleness signaling (FR22):** each record carries `created_at` + `superseded_by` + `last_verified_at`; retrieval annotates age, and any record older than 90 days surfaces a "verify freshness" hint.
- **Research findings are append-only**; updates are new records with `supersedes` pointer, never in-place rewrites.

**Methodology wiki — filesystem-as-data-store (Karpathy pattern, decided Step 2):**
- `wiki/` directory at repo root, git-versioned
- `wiki/index.md` is primary navigation; agent reads it first every turn
- `wiki/SCHEMA.md` encodes wiki conventions, cross-link rules, ingest/query/lint workflows, contradiction policy
- `wiki/log.md` append-only — every ingest/query/lint pass timestamped
- **Atomic writes (NFR7):** write-to-temp-file + `fs.rename` on same filesystem; never partial writes
- **No vector DB for wiki at Phase 1** — `index.md` navigation replaces retrieval entirely at current scale
- **Obsidian is Downe's IDE** — chat UI has no wiki editor surface

**Runtime data root — `./data/` (gitignored):**
- `data/costs/{projectId}.jsonl` — append-only cost events (one JSON per line)
- `data/sessions/{projectId}/{sessionId}.jsonl` — agent-event transcript for replay/debug
- `data/logs/server.jsonl` — Pino structured backend log

**Postgres (Phase 2 forward-looking, not built in Phase 1):**
- Local Docker container + pgAdmin container via `docker/docker-compose.yml`
- node-pg-migrations for schema
- Named volume for persistence (NFR10)
- Deterministic-compute layer for all financial math; agent exposes it as SDK tools (no LLM arithmetic)

### Authentication & Security

- **No authentication.** Single-user local tool; auth is permanently out of scope (PRD-confirmed).
- **No authorization layer.** No roles, no permissions, no ACLs.
- **Secrets management:** `.env` file at repo root, `.env.example` committed with placeholders, `.env` gitignored (NFR2). Loaded via `dotenv` in backend bootstrap.
- **API keys required:** `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `VOYAGE_API_KEY`.
- **Transport:** backend binds to `127.0.0.1` only; no external exposure. Frontend and backend both local.
- **CORS:** `@fastify/cors` configured for `http://localhost:5173` (Vite dev) in dev; in single-process run, Fastify serves built SPA via `@fastify/static`, same-origin.
- **No rate limiting** on own endpoints (single user). Upstream rate limits handled per-dependency (see below).
- **No encryption at rest** beyond OS-level defaults; this is a local-only tool on the user's own machine.

### API & Communication Patterns

**Transport layer:**
- **Server-Sent Events (SSE)** via `@fastify/sse-v2` for all agent-stream responses. Chosen over WebSockets: one-way server→client flow matches agent streaming exactly; automatic reconnect; simpler client code; no bidirectional upgrade overhead.
- **REST + JSON** for non-streaming CRUD (projects, sessions, checkpoints, cost queries).
- **No tRPC, no GraphQL.** `packages/shared` providing TS types gives end-to-end type safety without the extra layer.

**Endpoint shape (illustrative — finalized in Step 5/6):**
- `POST /api/projects/:projectId/sessions/:sessionId/messages` → streams `text/event-stream` of `AgentEvent`s
- `POST /api/projects/:projectId/sessions/:sessionId/checkpoint` → creates checkpoint, returns summary
- `GET  /api/projects/:projectId/sessions/:sessionId/resume` → returns reconstructed state + last checkpoint summary
- `GET  /api/projects/:projectId/costs` → per-session and per-project cost breakdown
- `GET  /api/projects` / `POST /api/projects` / `GET /api/projects/:projectId`
- `POST /api/wiki/ingest` / `POST /api/wiki/lint` — wiki operations surface as tools but also have HTTP entry points for scripted use

**Streaming event schema (shared types):**
Single discriminated union `AgentEvent` in `packages/shared/src/events.ts`. Event variants cover message tokens, thinking start/delta/end, tool started/completed, sub-agent started/event/completed, skeptic challenge, cost update, context update, error, response complete. Frontend pattern-matches on `type` to decide UI routing.

**Error envelope:** shared `ErrorCode` union across frontend and backend. Every error event carries `code`, `message`, `retryable: boolean`. Codes cover Claude rate limit/timeout/error, Tavily failure, Pinecone read/write failure, wiki write failure, tool execution error, invalid input, not found, internal error.

**Per-dependency resilience:**
- **Claude:** exponential-backoff retry ×3 on rate-limit or 5xx; on terminal failure, emit `claude_error` event and preserve partial output. Never auto-retry tool-call invocations.
- **Tavily:** single retry; on failure, emit `tavily_failure` and mark the research attempt as "research degraded" rather than blocking the turn.
- **Pinecone write:** block until ack (NFR6); on failure, emit `pinecone_write_failure` and surface retry button. Never claim "saved" optimistically.
- **Pinecone read:** on failure, fall back to most recent in-memory result for current session + emit `pinecone_read_failure` warning. Do not crash the turn.
- **Wiki write:** atomic temp+rename; on failure, emit `wiki_write_failure`. Git acts as rollback.

### Frontend Architecture

**State management split:**
- **Zustand** for streaming state, session state, cost meter, context gauge — anything that mutates per-event
- **TanStack Query** for HTTP reads (projects list, session history, cost history) with standard stale/refetch semantics
- **No Redux, no Context-as-store.** React Context reserved for true app-global config (theme, projectId).

**UI kit:**
- **Tailwind CSS** for styling (Vite Tailwind plugin)
- **shadcn/ui** component primitives (copy-in, not dependency) — buttons, dialogs, popovers, tooltips
- **Lucide icons**
- **Dark mode default and only** — no light-mode toggle (user preference on file)

**Component organization:**
- `apps/web/src/features/*` — each feature is a folder: `Chat`, `SkepticPanel`, `Sources`, `CostMeter`, `ContextGauge`, `SessionControls`, `ProjectSwitcher`
- Inside each feature folder: components, hooks, types, store slice if applicable
- `apps/web/src/components/ui/*` — shared shadcn primitives
- **No React Router.** Single view; project/session switching is state, not URLs.

**Conversation performance:**
- **react-virtuoso** for conversation message list (200+ messages, NFR14)
- Token streaming appends to last message; expanded thinking/tool-call blocks render on demand

**Markdown rendering:**
- **react-markdown** + **remark-gfm** (tables, strikethrough, task lists) + **rehype-highlight** for code fences
- No raw HTML; sanitized by default

**Forms:**
- **No form library.** Controlled inputs only; validation lives in the handler. Chat input, project create dialog, and checkpoint note are the only forms in Phase 1.

**Event-to-component mapping (locked):**
- `message.token` → append to current `ChatMessage`
- `thinking.*` → expandable `ThinkingBlock` in `ChatMessage`
- `tool.*` → `ToolCallBlock` with status + duration + cost
- `subagent.*` (skeptic) → render in `SkepticPanel` side surface
- `skeptic.challenge` → inline skeptic bubble in conversation + `SkepticPanel` log entry
- `cost.update` → `CostMeter`
- `context.update` → `ContextGauge`
- `error` → toast + in-line error row on affected block
- `response.complete` → finalize message, release input

### Infrastructure & Deployment

**Hosting strategy:**
- **100% local.** `pnpm dev` runs Vite (web) and Fastify (server) in parallel via Turborepo. `pnpm start` builds web and serves the static bundle from Fastify.
- **No cloud.** No Vercel, no Netlify, no AWS. External APIs only (Claude, Tavily, Pinecone, Voyage).

**CI/CD:**
- **None for Phase 1.** Single user, local only. Optional `pnpm lint && pnpm typecheck && pnpm test` pre-commit hook via husky — finalized in Step 5.

**Environment configuration:**
- `.env` at repo root
- `apps/server/src/config.ts` parses + validates env with `zod`; fails fast at boot with clear error if a required key is missing
- No multi-env management (no staging, no prod)

**Monitoring & logging — 5 streams:**
1. **Backend app log** — Pino JSON lines → stdout + `data/logs/server.jsonl`
2. **Agent event transcript** — SSE event mirror → `data/sessions/{projectId}/{sessionId}.jsonl` (full replay/debug)
3. **Wiki activity log** — `wiki/log.md` append-only markdown (Karpathy pattern)
4. **Cost events** — `data/costs/{projectId}.jsonl` one JSON per cost-bearing event
5. **Decision log** — Pinecone `record_type=decision_log` (immutable, queryable via RAG)

Frontend-visible observability: conversation event stream, `ContextGauge`, `CostMeter`, `SkepticPanel`. No external APM, no Sentry, no analytics.

**Scaling strategy:**
- **None.** Single user, one process, one machine. Scale concerns redirect to "does it handle 200+ message history smoothly" (NFR14) and "does it stay responsive during heavy agent work" (NFR11).

**Container footprint:**
- `docker/docker-compose.yml` defines `postgres` + `pgadmin` services for Phase 2
- Phase 1 runs Node + Vite natively on the host; Docker is not required to use the app

### Decision Impact Analysis

**Implementation sequence (coarse — refined in Step 6):**
1. **Scaffold monorepo** (Step 3 starter commands) + TS strict + ESLint/Prettier
2. **Define `packages/shared`** — `AgentEvent` union, `ErrorCode` union, core domain types (Project, Session, CheckpointRecord, ResearchFinding, DecisionLog)
3. **Fastify bootstrap** — config validation, CORS, SSE plugin, static serving, Pino
4. **Pinecone client module** — index bootstrap (idempotent), record-type CRUD helpers, staleness helpers
5. **Voyage embedding client** — wraps `voyage-3-large`
6. **Claude Agent SDK orchestrator** — main agent with tools registered, `PreToolUse`/`PostToolUse` hooks wired to cost + event emitters
7. **Skeptic sub-agent** — isolated context, bundle-pass input, event bridge back to orchestrator
8. **Research tool** — Tavily client + evidence extraction + Pinecone persistence
9. **Wiki tools** — read (`index.md` + linked pages), ingest, lint (Karpathy workflows)
10. **Session checkpoint service** — summary generation + Pinecone write + resume reconstruction
11. **Cost meter** — JSONL writer + aggregator + SSE push
12. **Web app shell** — Zustand stores, TanStack Query setup, Tailwind + shadcn, dark theme
13. **Chat feature + virtualized conversation** — event-to-component wiring
14. **Side surfaces** — `SkepticPanel`, `ContextGauge`, `CostMeter`, `ProjectSwitcher`, `SessionControls`
15. **Error/retry UX** — toasts, inline retries, degraded-mode banners

**Cross-component dependencies:**
- **`packages/shared` is upstream of everything UI-facing.** Any event or domain change ripples to both apps; the monorepo exists specifically to make this ripple compile-checked rather than drift-prone.
- **Cost tracking depends on Agent SDK hooks.** `PreToolUse`/`PostToolUse` must fire before UI can show per-tool cost; orchestration-framework choice is load-bearing for this.
- **Checkpoint/resume depends on Pinecone schema stability.** `conversation_summary` as embedding source means the summarization prompt and the retrieval query live or die together — treat as a matched pair.
- **Skeptic bundle-pass depends on orchestrator's knowledge of what's "established evidence."** The orchestrator's state tracking of active claims drives what the skeptic can see; this is architecturally the tightest coupling in the system and gets its own pattern in Step 5.
- **Wiki `index.md` is the agent's entry point.** Agent startup logic must unconditionally read it; it is a hard pre-flight, not an optional one.
- **`projectId` is the cross-cutting key.** It appears in Pinecone namespace, cost file name, session file name, URL path, Zustand store. A project-switch event must propagate atomically or user sees cross-contaminated data — this becomes a Step 5 pattern.
- **Dark-mode default is a styling constant, not a runtime toggle** — Tailwind config sets it; no theme provider runtime.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Conflict points identified:** 12 areas, grouped into five categories — naming, structure, wire formats, process patterns, and enforcement.

### Naming Patterns

**File & directory naming:**
- `PascalCase.tsx` for React components — e.g., `ChatMessage.tsx`, `SkepticPanel.tsx`
- `camelCase.ts` for hooks, services, utilities — e.g., `useStreamingSession.ts`, `pineconeClient.ts`
- `kebab-case` for non-code assets and root config files — e.g., `docker-compose.yml`, `pnpm-workspace.yaml`
- Tests co-located: `Foo.tsx` + `Foo.test.tsx` side by side

**Identifier naming (TypeScript):**
- `camelCase` for variables, functions, parameters
- `PascalCase` for types, interfaces, classes, React components
- `SCREAMING_SNAKE_CASE` for module-level constants that are truly immutable (env config, schema version)
- `kebab-case` for string literals used as IDs, keys, event names

**Wire-format identifiers:** see Format Patterns below — **`snake_case` in JSON** is the rule.

**API endpoint naming:**
- Plural nouns, nested where natural: `/api/projects/:projectId/sessions/:sessionId/messages`
- Path params in `:camelCase` form: `:projectId`, `:sessionId`, `:messageId`
- Explicit action verbs only for non-CRUD actions on resources: `/checkpoint`, `/resume`, `/ingest`, `/lint`
- Path segments are kebab-case if multi-word (none currently needed)

**Event naming (`AgentEvent.type`):**
- Format: `namespace.action` using lowercase dot-separated segments
- Locked Phase 1 vocabulary: `message.token` · `thinking.start` · `thinking.delta` · `thinking.end` · `tool.started` · `tool.completed` · `subagent.started` · `subagent.event` · `subagent.completed` · `skeptic.challenge` · `cost.update` · `context.update` · `error` · `response.complete`
- Adding a new event requires adding it to the `AgentEvent` union in `packages/shared/src/events.ts` first — string-literal emission fails at compile time

### Structure Patterns

**Backend module boundaries (`apps/server/src/`):**
Bounded contexts as folders, each with an `index.ts` barrel — cross-folder imports use barrels only:
- `agent/` — orchestrator, skeptic sub-agent, system prompts, tool registration
- `tools/` — Claude SDK tool definitions: research, wiki read/ingest/lint, pinecone CRUD, checkpoint
- `clients/` — thin adapters wrapping external SDKs: `claude.ts`, `tavily.ts`, `pinecone.ts`, `voyage.ts`
- `domain/` — pure-TypeScript services: checkpoint service, cost service, project service
- `routes/` — Fastify route modules, one file per resource family
- `config/` — zod-based env parsing and validation
- `events/` — SSE emitter plumbing and typed event builders

**Frontend feature boundaries (`apps/web/src/`):**
- `features/<FeatureName>/` — one folder per feature (`Chat`, `SkepticPanel`, `Sources`, `CostMeter`, `ContextGauge`, `SessionControls`, `ProjectSwitcher`), each containing `components/`, `hooks/`, `store.ts`, `types.ts` as needed, plus an `index.ts` barrel exposing only the public surface
- `components/ui/` — shadcn primitives (button, dialog, popover, tooltip, etc.)
- `lib/` — pure utilities, no React
- `api/` — TanStack Query hooks and fetchers
- `app/` — root shell, providers, global styles

**Shared package layout (`packages/shared/src/`):**
One file per type family, zero runtime code:
- `events.ts` — `AgentEvent` discriminated union
- `errors.ts` — `ErrorCode` union and error envelope shape
- `domain.ts` — `Project`, `Session`, `CheckpointRecord`, `ResearchFinding`, `DecisionLog`, `EvidenceRecord`, `IntelligenceBrief`
- `http.ts` — request/response envelopes for REST endpoints
- `costs.ts` — cost event shapes
- `index.ts` — barrel

**Test organization:**
- Unit tests co-located with source: `foo.ts` + `foo.test.ts`
- Integration tests under `apps/server/tests/integration/`, gated behind `INTEGRATION=1` env flag so default `pnpm test` stays offline and fast
- Shared test utilities under `apps/<app>/tests/helpers/`

### Format Patterns

**API response envelopes:**
- Non-streaming JSON responses return the payload directly — `{ "projects": [...] }`, not `{ "data": { "projects": [...] } }`
- Error responses use a consistent envelope: `{ "error": { "code": ErrorCode, "message": string, "retryable": boolean } }` with appropriate HTTP status
- SSE events are already typed via `AgentEvent` — no additional wrapper

**Wire JSON conventions:**
- **Field names are `snake_case` on the wire** — matches Pinecone and most third-party APIs we interop with, eliminates mid-pipeline casing translation
- **TypeScript shapes in `packages/shared` mirror the wire exactly** — `record.record_type`, `record.project_id`, `record.created_at`. No auto-conversion layer, no `toCamelCase` middleware. One convention, end-to-end.
- **Dates:** ISO-8601 UTC strings everywhere on the wire and in JSONL logs — e.g., `2026-04-22T15:23:01.123Z`
- **IDs:** UUID v4 for all internal IDs (`project_id`, `session_id`, `message_id`, `checkpoint_id`, `decision_id`); generated server-side, never client-side
- **Nullability:** `null` means "explicitly no value"; omit the field if it's "not applicable". Never use empty string as a semantic signal.
- **Booleans:** `true`/`false` only, never `1`/`0`

### Process Patterns

**Error handling:**
- Backend throws typed `AppError extends Error { code: ErrorCode; retryable: boolean }`
- Single Fastify error hook maps thrown errors to the JSON envelope; stack traces never leak to the client
- Every caught error with external-dependency impact emits an `error` event on the active SSE stream **and** logs to Pino with structured context `{ code, requestId, sessionId, projectId }`
- Frontend `error` events render as toast + inline degraded banner on the affected feature — never a modal, never silent
- **Pinecone write failure is the only class that blocks UI progress** — user sees "save failed, retry?" and must act; all other errors degrade gracefully

**Loading and streaming state:**
- No global loading spinner — each feature owns its own local loading state in its Zustand slice
- Streaming state is authoritative for in-flight messages — each message carries `status: 'streaming' | 'complete' | 'error'`
- TanStack Query handles HTTP loading/refetch UI via its built-in states
- Zustand updates use the `immer` middleware globally — actions mutate drafts, never spread manually
- Zustand action names are verbs: `appendToken`, `completeMessage`, `setProjectId`, `recordCostEvent`

**Logging levels (Pino):**
- `error` — external API failure, data-integrity violation, unhandled exception
- `warn` — retry in progress, degraded mode entered, staleness threshold crossed
- `info` — session start/stop, checkpoint created, project switched, tool invocation summary
- `debug` — per-event agent stream, per-request detail (gated to dev only)

**Retry policies (locked from Step 4, codified here):**
- Claude: exponential backoff ×3 on rate-limit or 5xx; no auto-retry on tool-call invocation
- Tavily: single retry; then surface `tavily_failure` + "research degraded"
- Pinecone write: blocks until ack; on failure, emits `pinecone_write_failure` with retry affordance
- Pinecone read: one fallback attempt to in-memory session cache; emits `pinecone_read_failure` warning
- Wiki write: atomic temp+rename; on failure, emits `wiki_write_failure`; git provides rollback

### Enforcement Guidelines

**All AI coding agents MUST:**
- Use TypeScript `strict` mode plus `noUncheckedIndexedAccess` on both apps
- Emit `AgentEvent`s through the typed builder in `apps/server/src/events/` — never `res.write(JSON.stringify(...))` raw
- Throw `AppError` with a valid `ErrorCode` — never `throw new Error('string')` in request paths
- Match wire `snake_case` exactly in `packages/shared` types — no invented `camelCase` aliases
- Add any new event type, error code, or domain shape to `packages/shared` first — both apps must compile clean before landing
- Pass `projectId` explicitly through every data-access call — never read it from a hidden ambient

**Pattern enforcement mechanics:**
- ESLint flat config: `@typescript-eslint/recommended-strict`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, Prettier integration
- `pnpm lint && pnpm typecheck && pnpm test` wired as a husky + lint-staged pre-commit hook
- Turborepo topological build ensures `packages/shared` compiles before either app — a breaking type change blocks the whole graph
- **Anti-pattern detection:** any PR that adds a `camelCase` JSON field, an untyped `fetch` response, a Zustand action whose name isn't a verb, or a string-literal event type fails lint or typecheck by construction

### Pattern Examples

**Good — emitting an event:**
```ts
import { emit } from '../events';
emit(reply, {
  type: 'tool.completed',
  toolId: call.id,
  name: 'research',
  result,
  durationMs,
  costUsd,
});
```

**Good — throwing a typed error:**
```ts
throw new AppError('pinecone_write_failure', 'Failed to persist decision log', { retryable: true });
```

**Anti-pattern — camelCase leaking onto the wire:**
```ts
// WRONG: `recordType` and `projectId` are not shared-package fields
return reply.send({ recordType: 'evidence', projectId, createdAt: new Date().toISOString() });
// RIGHT: mirror the shared `record_type`, `project_id`, `created_at`
return reply.send({ record_type: 'evidence', project_id, created_at: new Date().toISOString() });
```

**Anti-pattern — silent error swallowing:**
```ts
// WRONG: failure disappears; UI thinks save succeeded
try { await pinecone.upsert(rec); } catch {}
// RIGHT: propagate as typed error; let the error hook emit + log
await pinecone.upsert(rec); // throws AppError('pinecone_write_failure', ...) on failure
```

**Anti-pattern — string-literal event type:**
```ts
// WRONG: not in `AgentEvent` union; consumers can't exhaustively switch
reply.raw.write(`data: ${JSON.stringify({ type: 'thinking.pause' })}\n\n`);
// RIGHT: add variant to AgentEvent, emit via typed builder
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
business-planner/
├── README.md
├── CLAUDE.md                              # Agent identity + operating principles
├── package.json                           # root: workspaces + scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json                     # shared strict TS settings
├── .editorconfig
├── .eslintrc.cjs                          # flat-config re-export for IDEs
├── eslint.config.js                       # flat config source
├── .prettierrc
├── .env.example                           # committed with placeholder keys
├── .env                                   # gitignored; user-filled
├── .gitignore
├── .husky/
│   ├── pre-commit                         # pnpm lint + typecheck + test (staged)
│   └── commit-msg
│
├── apps/
│   ├── web/                               # Vite + React SPA
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   ├── public/                        # favicon + static
│   │   └── src/
│   │       ├── main.tsx                   # React root, providers bootstrap
│   │       ├── app/
│   │       │   ├── App.tsx                # top-level layout shell
│   │       │   ├── providers.tsx          # QueryClient, theme, projectId
│   │       │   └── globals.css            # Tailwind directives + dark defaults
│   │       │
│   │       ├── features/
│   │       │   ├── Chat/
│   │       │   │   ├── index.ts
│   │       │   │   ├── ChatView.tsx
│   │       │   │   ├── ChatMessage.tsx
│   │       │   │   ├── ChatInput.tsx
│   │       │   │   ├── ThinkingBlock.tsx
│   │       │   │   ├── ToolCallBlock.tsx
│   │       │   │   ├── components/
│   │       │   │   ├── hooks/
│   │       │   │   │   └── useStreamingSession.ts
│   │       │   │   ├── store.ts           # Zustand slice
│   │       │   │   └── types.ts
│   │       │   ├── SkepticPanel/
│   │       │   │   ├── index.ts
│   │       │   │   ├── SkepticPanel.tsx
│   │       │   │   ├── ChallengeCard.tsx
│   │       │   │   └── store.ts
│   │       │   ├── Sources/
│   │       │   │   ├── index.ts
│   │       │   │   └── SourcesDrawer.tsx
│   │       │   ├── CostMeter/
│   │       │   │   ├── index.ts
│   │       │   │   ├── CostMeter.tsx
│   │       │   │   └── store.ts
│   │       │   ├── ContextGauge/
│   │       │   │   ├── index.ts
│   │       │   │   ├── ContextGauge.tsx
│   │       │   │   └── store.ts
│   │       │   ├── SessionControls/
│   │       │   │   ├── index.ts
│   │       │   │   ├── SessionControls.tsx       # checkpoint, resume, new-session
│   │       │   │   └── store.ts
│   │       │   └── ProjectSwitcher/
│   │       │       ├── index.ts
│   │       │       ├── ProjectSwitcher.tsx
│   │       │       └── store.ts
│   │       │
│   │       ├── components/ui/             # shadcn primitives (copy-in)
│   │       │   ├── button.tsx
│   │       │   ├── dialog.tsx
│   │       │   ├── popover.tsx
│   │       │   ├── tooltip.tsx
│   │       │   ├── toast.tsx
│   │       │   └── ...
│   │       │
│   │       ├── api/
│   │       │   ├── client.ts              # fetch wrapper (typed via shared)
│   │       │   ├── sse.ts                 # EventSource wrapper emitting AgentEvents
│   │       │   ├── projects.ts            # TanStack Query hooks
│   │       │   ├── sessions.ts
│   │       │   ├── costs.ts
│   │       │   └── checkpoints.ts
│   │       │
│   │       └── lib/
│   │           ├── cn.ts                  # tailwind-merge helper
│   │           ├── format.ts              # date/currency/token formatters
│   │           └── markdown.tsx           # react-markdown wrapper
│   │
│   └── server/                            # Fastify + TypeScript
│       ├── tsconfig.json
│       ├── package.json
│       ├── src/
│       │   ├── main.ts                    # entry: config → buildApp → listen
│       │   ├── buildApp.ts                # Fastify factory (plugins, routes, hooks)
│       │   │
│       │   ├── config/
│       │   │   ├── index.ts
│       │   │   └── env.ts                 # zod schema + parse
│       │   │
│       │   ├── clients/                   # thin external-SDK adapters
│       │   │   ├── index.ts
│       │   │   ├── claude.ts              # Anthropic SDK wrapper
│       │   │   ├── tavily.ts
│       │   │   ├── pinecone.ts            # index bootstrap + typed helpers
│       │   │   └── voyage.ts              # voyage-3-large embedding
│       │   │
│       │   ├── agent/
│       │   │   ├── index.ts
│       │   │   ├── orchestrator.ts        # Claude Agent SDK primary loop
│       │   │   ├── skeptic.ts             # sub-agent: bundle-pass input, isolated ctx
│       │   │   ├── prompts/
│       │   │   │   ├── orchestrator.md
│       │   │   │   └── skeptic.md
│       │   │   └── hooks.ts               # PreToolUse / PostToolUse wiring
│       │   │
│       │   ├── tools/                     # Claude SDK tool definitions
│       │   │   ├── index.ts               # registerTools(app)
│       │   │   ├── research.ts            # Tavily + evidence extraction + Pinecone
│       │   │   ├── wiki.ts                # read index + ingest + lint
│       │   │   ├── intelligence.ts        # Pinecone read/write intelligence records
│       │   │   ├── decisionLog.ts         # immutable decision-log writer
│       │   │   └── checkpoint.ts          # create / resume
│       │   │
│       │   ├── domain/                    # pure-TS services (no SDK deps)
│       │   │   ├── index.ts
│       │   │   ├── checkpointService.ts   # summary + manifest + reconstruction
│       │   │   ├── costService.ts         # JSONL writer + aggregator
│       │   │   ├── projectService.ts      # project CRUD + namespace bootstrap
│       │   │   ├── contextGauge.ts        # token-usage calc + threshold logic
│       │   │   └── stalenessPolicy.ts     # 90-day hint + supersedes chains
│       │   │
│       │   ├── wiki/                      # filesystem module for the Obsidian wiki vault
│       │   │   ├── index.ts
│       │   │   ├── reader.ts              # index.md + linked pages; parses [[wikilinks]]
│       │   │   ├── writer.ts              # atomic temp+rename writes; sole write choke point
│       │   │   ├── ingest.ts              # source → summary page + xrefs
│       │   │   ├── lint.ts                # contradictions, stale, orphans
│       │   │   ├── links.ts               # [[wikilink]] parser + page-path resolver
│       │   │   └── log.ts                 # append to wiki/log.md
│       │   │
│       │   ├── routes/                    # Fastify route modules
│       │   │   ├── index.ts               # register all
│       │   │   ├── projects.ts
│       │   │   ├── sessions.ts            # includes messages (SSE) + checkpoint + resume
│       │   │   ├── costs.ts
│       │   │   ├── wiki.ts                # ingest + lint HTTP entry points
│       │   │   └── health.ts
│       │   │
│       │   ├── events/
│       │   │   ├── index.ts
│       │   │   ├── emit.ts                # typed SSE writer
│       │   │   ├── builders.ts            # factory helpers per event type
│       │   │   └── transcript.ts          # mirror writer → data/sessions/*.jsonl
│       │   │
│       │   ├── errors/
│       │   │   ├── index.ts
│       │   │   ├── AppError.ts
│       │   │   └── errorHook.ts           # Fastify setErrorHandler → envelope
│       │   │
│       │   └── logging/
│       │       ├── index.ts               # Pino instance
│       │       └── pino.ts
│       │
│       ├── tests/
│       │   ├── helpers/                   # fixtures, fakes, builders
│       │   └── integration/               # INTEGRATION=1 gated
│       │       ├── pinecone.test.ts
│       │       ├── tavily.test.ts
│       │       └── claude.test.ts
│
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                   # barrel
│           ├── events.ts                  # AgentEvent union
│           ├── errors.ts                  # ErrorCode union + envelope
│           ├── domain.ts                  # Project, Session, Checkpoint, Finding...
│           ├── http.ts                    # request/response shapes
│           └── costs.ts                   # cost event shapes
│
├── wiki/                                  # Karpathy LLM wiki + Obsidian vault (git-tracked)
│   ├── .obsidian/                         # vault config — see .gitignore policy below
│   ├── SCHEMA.md                          # wiki conventions, [[wikilink]] rules, workflows
│   ├── index.md                           # primary navigation — agent reads first every turn
│   ├── log.md                             # append-only ingest/query/lint log
│   ├── sources/                           # raw curated sources (immutable)
│   │   └── .gitkeep
│   └── pages/                             # agent-owned markdown pages
│       └── .gitkeep
│
├── data/                                  # gitignored runtime state
│   ├── .gitkeep
│   ├── costs/                             # {projectId}.jsonl
│   ├── sessions/                          # {projectId}/{sessionId}.jsonl
│   └── logs/
│       └── server.jsonl
│
└── docker/
    └── docker-compose.yml                 # Postgres + pgAdmin (Phase 2)
```

### Architectural Boundaries

**API boundary (backend ↔ frontend):**
- **Transport:** REST+JSON for CRUD, SSE for agent streams; all shapes live in `packages/shared`
- **Auth:** none; backend binds `127.0.0.1`
- **Frontend never talks to Claude/Tavily/Pinecone/Voyage directly** — backend is the only API-key holder

**Agent boundary (orchestrator ↔ skeptic):**
- Orchestrator owns conversation context; skeptic runs in **isolated Claude Agent SDK sub-agent context**
- Skeptic receives only an explicit "claims + evidence" bundle from orchestrator — no ambient access to the main history
- Skeptic output streams back through `subagent.*` events; orchestrator decides what to surface inline vs. in `SkepticPanel`

**Tool boundary (agent ↔ external world):**
- Every external side-effect is an explicit Claude SDK tool registered in `apps/server/src/tools/`
- `PreToolUse` hook logs intent + starts cost tracking; `PostToolUse` hook logs result + closes cost record
- Tools return structured results; they never format user-facing prose

**Data boundary (intelligence ↔ methodology):**
- **Pinecone = project-scoped intelligence** — research findings, evidence, decision logs, checkpoints, briefs. Namespace = `projectId`. Never crosses project boundaries.
- **Wiki = cross-project methodology** — explicitly global, carries forward to every new project
- **`data/` = local runtime ephemera** — costs, session transcripts, server logs. Rebuildable.
- **Postgres (Phase 2) = deterministic compute inputs + outputs** — financial math state. Not yet allocated in Phase 1.

**Wiki ↔ Editor boundary (Obsidian):**
- **`wiki/` is a vanilla Obsidian vault**, not just a markdown folder. Downe opens it in Obsidian; the agent writes to the filesystem; Obsidian auto-reloads on file changes. This is the user's primary wiki-authoring surface.
- **`[[wikilink]]` is the canonical cross-reference format** (Karpathy pattern + Obsidian native). Agent emits and parses this form; it does not use markdown `[text](./page.md)` relative links. Resolution logic lives in `apps/server/src/wiki/links.ts`.
- **No Obsidian plugins required.** Vanilla install is sufficient; any community plugins are a user choice, not an architectural dependency.
- **`.obsidian/` gitignore policy:** ignore the whole folder by default (`wiki/.obsidian/` in `.gitignore`). If a specific config file becomes worth sharing (e.g., `app.json` enforcing vault settings), carve it out with a negation rule — but start permissive.
- **The chat UI has no wiki editor surface.** Obsidian fills that role. There is no `WikiEditor` feature folder, no in-chat page-edit control. This is enforced by omission in `apps/web/src/features/`.

**Filesystem boundary (wiki writes):**
- All wiki writes go through `apps/server/src/wiki/writer.ts` — single choke point enforcing temp+rename atomicity and `log.md` append
- No other module may call `fs.writeFile` against the `wiki/` directory

**ProjectId boundary:**
- `projectId` is the most widely-threaded identifier in the system — Pinecone namespace, cost file path, session file path, URL path param, Zustand store key
- **Project-switch is atomic** — orchestrator drains in-flight events, flushes Zustand slices, swaps `projectId`, remounts affected features. Half-swapped state is a bug class specifically called out here.

### Requirements to Structure Mapping

| PRD area | Primary code locations |
|---|---|
| **FR1–FR6 Chat & Conversation** | `apps/web/src/features/Chat/*`, `apps/server/src/agent/orchestrator.ts`, `apps/server/src/events/*`, `apps/server/src/routes/sessions.ts` (SSE handler) |
| **FR7–FR11 Research & Evidence** | `apps/server/src/tools/research.ts`, `apps/server/src/clients/tavily.ts`, `apps/server/src/tools/intelligence.ts`, `apps/web/src/features/Sources/*` |
| **FR12–FR19 Critical Thinking & Challenge** | `apps/server/src/agent/skeptic.ts`, `apps/server/src/agent/prompts/skeptic.md`, `apps/server/src/tools/decisionLog.ts`, `apps/web/src/features/SkepticPanel/*` |
| **FR20–FR25 Knowledge Management** | `apps/server/src/clients/pinecone.ts`, `apps/server/src/tools/intelligence.ts`, `apps/server/src/domain/stalenessPolicy.ts` |
| **FR26–FR32 Methodology Wiki** | `apps/server/src/wiki/*`, `apps/server/src/tools/wiki.ts`, `wiki/SCHEMA.md`, `wiki/index.md`, `wiki/log.md`, `CLAUDE.md`; user-edit surface is Obsidian over `wiki/` |
| **FR33–FR38 Session Management** | `apps/server/src/domain/checkpointService.ts`, `apps/server/src/domain/contextGauge.ts`, `apps/server/src/tools/checkpoint.ts`, `apps/web/src/features/SessionControls/*`, `apps/web/src/features/ContextGauge/*` |
| **FR39–FR43 Project Management** | `apps/server/src/domain/projectService.ts`, `apps/server/src/routes/projects.ts`, `apps/server/src/domain/costService.ts`, `apps/web/src/features/ProjectSwitcher/*`, `apps/web/src/features/CostMeter/*` |
| **NFR1–NFR5 Integration resilience** | `apps/server/src/clients/*` (retry policies), `apps/server/src/errors/*` (typed error mapping), `apps/web/src/app/providers.tsx` (toast routing) |
| **NFR6–NFR10 Data integrity** | `apps/server/src/clients/pinecone.ts` (confirmed writes), `apps/server/src/wiki/writer.ts` (atomic), `apps/server/src/tools/decisionLog.ts` (immutable), `docker/docker-compose.yml` (named volume) |
| **NFR11–NFR14 Performance** | `apps/server/src/events/emit.ts` (streaming), `apps/web/src/features/Chat/ChatView.tsx` (react-virtuoso), `apps/web/src/api/sse.ts` |

### Integration Points

**Internal communication:**
- Frontend → backend: typed `fetch` wrapper (`apps/web/src/api/client.ts`) for REST; `EventSource` wrapper (`apps/web/src/api/sse.ts`) emitting `AgentEvent`s
- Backend internal: orchestrator calls tools directly (Claude Agent SDK); tools call clients; domain services consume clients; routes consume domain + orchestrator
- Backend → frontend: SSE event stream only, typed through `packages/shared/src/events.ts`

**External integrations:**
- **Claude Opus** via `@anthropic-ai/sdk` through Claude Agent SDK orchestrator in `clients/claude.ts`
- **Tavily** REST API through `clients/tavily.ts`, invoked by `tools/research.ts`
- **Pinecone Serverless** via `@pinecone-database/pinecone` in `clients/pinecone.ts`, used by `tools/intelligence.ts` + `tools/decisionLog.ts` + `tools/checkpoint.ts`
- **Voyage AI** via `voyageai` SDK in `clients/voyage.ts`, used whenever embeddings are written
- **Obsidian** (desktop app) — user-facing wiki editor; couples to the repo via the filesystem (no protocol). User opens `wiki/` as a vault; Obsidian watches the directory and auto-reloads on agent writes.

**Data flow (single user turn):**
1. User types → `ChatInput` → `POST /api/projects/:projectId/sessions/:sessionId/messages`
2. Fastify route opens SSE stream → orchestrator invoked with conversation context
3. Orchestrator streams `thinking.*` → emits tool invocations → `PreToolUse` logs + costs start
4. Research tool calls Tavily → extracts evidence → embeds via Voyage → writes to Pinecone → returns structured result
5. Orchestrator may hand bundle to skeptic sub-agent → `subagent.*` events stream back
6. Decision points → `decisionLog` tool writes immutable Pinecone record
7. Orchestrator emits `message.token` stream → `response.complete` closes the turn
8. Throughout: `cost.update` + `context.update` events mirror meters; transcript mirrored to `data/sessions/{projectId}/{sessionId}.jsonl`

**Wiki authoring flow (parallel to agent turns):**
- **Agent-initiated edits:** all wiki writes funnel through `apps/server/src/wiki/writer.ts` (atomic temp+rename + `log.md` append). Obsidian auto-reloads changed files in the user's open vault.
- **User-initiated edits:** Downe edits pages directly in Obsidian. Changes hit the filesystem and are picked up on the next agent wiki read (no watcher needed at single-user scale).
- **Conflict policy:** no coordination protocol. If both the user and the agent touched a page between reads, the next `lint` pass surfaces contradictions. Git is the safety net.

### File Organization Patterns

**Configuration files:** all at repo root (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.env.example`). App-specific config lives in each app's folder (`vite.config.ts`, `tailwind.config.ts`, per-app `tsconfig.json` extends root).

**Source organization:** bounded-context folders with barrels; no deeply nested `utils/` grab-bags; each folder either does one thing or re-exports things that do.

**Test organization:** co-located unit tests (`foo.test.ts` next to `foo.ts`); integration tests isolated under `apps/server/tests/integration/` behind `INTEGRATION=1`.

**Asset organization:** frontend static assets under `apps/web/public/`; shadcn primitives under `apps/web/src/components/ui/`; wiki markdown under `wiki/` (Obsidian vault root); no binary assets tracked in `data/`.

### Development Workflow Integration

**Development server:** `pnpm dev` runs (via Turborepo) `apps/web` Vite dev server on `:5173` and `apps/server` via `tsx watch` on `:3000`. Vite proxies `/api` → `:3000` in dev; SSE passes through unchanged.

**Build process:** `pnpm build` builds `packages/shared` first (topological), then `apps/server` (tsc to `dist/`), then `apps/web` (Vite → `dist/`). Turborepo caches per-task.

**Deployment / local run:** `pnpm start` boots `apps/server` in production mode; server mounts `apps/web/dist` via `@fastify/static` and serves the SPA from the same origin. No containerization of the app itself; Postgres + pgAdmin containers via `docker/docker-compose.yml` come online in Phase 2.

**Wiki editing workflow:** Downe opens `wiki/` as an Obsidian vault (File → Open vault → select `wiki/` directory). No setup beyond that. The agent edits the same directory via `apps/server/src/wiki/writer.ts`; Obsidian auto-reloads.

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility — no conflicts detected.**

| Pairing | Status |
|---|---|
| Claude Agent SDK + Fastify 5 + Node 22 | ✅ Node-native, ESM, current as of 2026 |
| pnpm workspaces + Turborepo + TypeScript strict | ✅ Standard monorepo baseline |
| Pinecone Serverless (`@pinecone-database/pinecone` v4.x) + Voyage `voyage-3-large` (1024-d) | ✅ Serverless supports 1024-d; embed + write in same tool call |
| SSE via `@fastify/sse-v2` + Fastify 5 streaming | ✅ First-class streaming support |
| Zustand + TanStack Query split | ✅ Non-overlapping concerns |
| React 19 + react-virtuoso + react-markdown + rehype-highlight | ✅ All compatible with React 19 |
| Dark-only Tailwind + shadcn/ui | ✅ shadcn themes via CSS vars; dark-only simplifies config |
| snake_case wire + shared types verbatim | ✅ One convention end-to-end |

**Pattern consistency:** Step 5 patterns reinforce Step 4 decisions — SSE transport matches event-builder pattern, `AppError`/`ErrorCode` matches per-dependency retry policy, Zustand immer pattern matches streaming-state model, feature-folder layout matches bounded-context backend layout.

**Structure alignment:** `packages/shared` upstream of both apps enforces type-safety structurally. `apps/server/src/wiki/writer.ts` as sole filesystem choke point enforces NFR7 structurally. `apps/server/src/tools/decisionLog.ts` as the sole writer of `record_type=decision_log` enforces NFR8 by construction.

### Requirements Coverage Validation ✅

**Functional requirements — 43/43 architecturally supported.**

| FR block | Coverage |
|---|---|
| **FR1–FR6** Chat & Conversation | `features/Chat/*` + `agent/orchestrator.ts` + SSE stream + `ThinkingBlock`/`ToolCallBlock` expand/collapse + virtuoso history |
| **FR7–FR11** Research & Evidence | `tools/research.ts` → Tavily → evidence extraction → Pinecone `research_finding` + `evidence` with confidence tags |
| **FR12–FR19** Critical Thinking & Challenge | Skeptic sub-agent (isolated ctx, bundle-pass) + `skeptic.challenge` event + `tools/decisionLog.ts` immutable records |
| **FR20–FR25** Knowledge Management | Pinecone namespace-per-project + 5 record types + `stalenessPolicy.ts` + checkpoint records + "no-data finding" via confidence tag |
| **FR26–FR32** Methodology Wiki | `wiki/*` module + Karpathy pattern + Obsidian vault + cross-project persistence + chat-driven bootstrap (Phase 1 simplification) |
| **FR33–FR38** Session Management | `contextGauge` thresholds + `SessionControls` + `checkpointService` + last-checkpoint summary + user-triggered stopping points |
| **FR39–FR43** Project Management | `projectService` + `ProjectSwitcher` + per-project Pinecone namespace + global wiki + `costService` per-project JSONL |

**Non-functional requirements — 14/14 architecturally supported.**

| NFR block | Coverage |
|---|---|
| **NFR1–NFR5** Integration resilience | Per-dependency retry policies + typed `ErrorCode` + `.env` secrets + degraded-mode UI signaling + host-only binding |
| **NFR6–NFR10** Data integrity | Confirmed Pinecone writes + atomic wiki writes (temp+rename choke point) + immutable `decision_log` + checkpoint schema covers NFR9 fields + docker-compose named volume |
| **NFR11–NFR14** Performance | SSE streaming + local Zustand slices + react-virtuoso + first-token target achievable via SDK streaming |

### Implementation Readiness Validation ✅

**Decision completeness:** Every critical decision has a version, rationale, and rejected alternative. Both PRD-flagged blocking bets (orchestration framework, agent topology) resolved.

**Structure completeness:** Full directory tree with all files and purposes. Every FR has at least one primary code location. Every external integration has a named client module.

**Pattern completeness:** 12 conflict classes addressed across naming / structure / wire format / process. Good + anti-pattern examples for the four highest-risk patterns (event emission, typed errors, wire casing, error-swallowing).

### Gap Analysis Results

**Critical gaps (block implementation):** None.

**Important gaps (resolve in first implementation stories, not blocking epics):**
1. **`CostBreakdown` shape referenced but not fully defined.** Belongs in `packages/shared/src/costs.ts`; finalize fields (per-provider claude/tavily/pinecone/voyage breakdown, input/output token counts) in the first cost-meter story.
2. **Voyage AI retry policy.** Default: treat like Claude — exponential backoff ×3 on rate-limit or 5xx. Terminal Voyage failure surfaces as `pinecone_write_failure` to the user because embedding must precede the Pinecone write.
3. **Wiki `lint` cadence.** No cron at single-user scale; `lint` runs when the agent invokes it at stopping points or when Downe explicitly triggers it. Intentional.

**Minor / deferred (document and move on):**
- Agent prompts (`orchestrator.md`, `skeptic.md`) — content is prompt engineering, drafted during implementation.
- `.obsidian/` gitignore policy — start permissive (ignore all); carve out later if useful to share.
- Pre-commit hook (husky + lint-staged) exact config — finalized at repo scaffold time.
- Wiki approval-workflow UI — PRD allows simplification: agent proposes in chat, user applies manually. No `WikiEditor` feature in Phase 1.
- Automatic stopping-point detection — PRD defers to Phase 2; Phase 1 is user-triggered.

### Validation Issues Addressed

All identified important gaps have explicit resolutions above. No critical gaps required rework of Step 4–6 content. Coverage matrix traces every PRD requirement to a concrete code location or an intentional simplification documented in the PRD itself.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (FRs, NFRs, scale, complexity)
- [x] Karpathy wiki pattern integrated as architectural foundation
- [x] Technical constraints and dependencies identified
- [x] Cross-cutting concerns (streaming, cost, projectId, observability) mapped

**✅ Architectural Decisions**
- [x] Orchestration framework resolved (Claude Agent SDK v1)
- [x] Agent topology resolved (orchestrator + single skeptic sub-agent; research as tool)
- [x] Data architecture (Pinecone schema, record types, embedding model) specified
- [x] Transport + API style (SSE + REST+JSON) decided
- [x] Error taxonomy + retry policies per dependency locked

**✅ Implementation Patterns**
- [x] Naming (files, identifiers, endpoints, events) defined
- [x] Structure (backend bounded contexts, feature folders, shared package) defined
- [x] Wire format (snake_case end-to-end, ISO-8601, UUID v4) defined
- [x] Error handling + streaming state + logging levels + retry policies codified
- [x] Good + anti-pattern examples provided

**✅ Project Structure**
- [x] Complete directory tree with ~90 named files/dirs
- [x] Component boundaries defined (API, agent, tool, data, wiki↔editor, filesystem, projectId)
- [x] Integration points mapped (internal + external + wiki-authoring + data flow)
- [x] Every FR and NFR traced to primary code locations

### Architecture Readiness Assessment

**Overall status:** READY FOR IMPLEMENTATION

**Confidence level:** High

**Key strengths:**
- Both PRD-flagged blocking technical bets (orchestration framework, agent topology) resolved with rationale and rejected alternatives preserved
- Karpathy wiki pattern structurally integrated — `index.md` navigation replaces vector retrieval entirely at Phase 1 scale
- Obsidian as user editor is explicit and load-bearing — removes an entire UI surface from scope
- End-to-end type safety via `packages/shared` is structurally enforced by Turborepo topological build — a compile gate, not a convention
- snake_case-everywhere eliminates a class of drift bugs by construction
- Data-integrity trifecta (confirmed Pinecone writes, atomic wiki writes, immutable decision logs) enforced by single choke-point modules

**Areas for future enhancement (Phase 2 / beyond):**
- Deterministic compute layer for financial math (Postgres-grounded, tool-surfaced)
- Wiki hybrid search (`qmd`-style) if `index.md` navigation becomes unwieldy
- Automatic stopping-point detection (currently user-triggered)
- Wiki approval-workflow UI (currently chat-driven manual apply)
- Cross-project intelligence queries (across multiple project namespaces)
- Post-plan accountability layer

### Implementation Handoff

**AI agent guidelines:**
- Follow architectural decisions exactly — no re-litigating orchestration framework, agent topology, or wire format
- Use `packages/shared` as the single source of truth for `AgentEvent`, `ErrorCode`, and domain types — add new variants there first, let the compiler enforce consumer updates
- Respect bounded-context boundaries — cross-folder imports via barrels only
- All wiki writes through `apps/server/src/wiki/writer.ts` — no exceptions
- All SSE events through typed builders in `apps/server/src/events/` — no raw string writes
- Pattern adherence checked by TypeScript strict + ESLint; failing lint or typecheck blocks merge

**First implementation priority:** Scaffold the monorepo per the initialization commands in the Starter Template Evaluation section and populate `packages/shared` with the `AgentEvent` / `ErrorCode` / domain type unions. All subsequent stories depend on this baseline.
