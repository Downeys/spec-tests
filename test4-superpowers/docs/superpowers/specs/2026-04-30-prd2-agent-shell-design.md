# PRD 2 — Agent Shell (Chat UI + Backend + Opus, wired to OpenBrain & vault)

**Project:** business-plan-builder
**Date:** 2026-04-30
**Status:** Draft for review
**Depends on:** PRD 1 (memory architecture) — shipped, merged

---

## 1. Context

### 1.1 What this PRD covers

The agent shell that makes PRD 1's memory layer exercisable for a human user. Specifically:

- A **React chat UI** (Vite + Tailwind) using a chat-pane + live-context-panel layout.
- A **Node/TypeScript backend service** (Fastify) running a custom agent loop on `@anthropic-ai/sdk` against Claude Opus 4.7, streaming responses to the browser via SSE.
- A **tool surface** for agent read/write against OpenBrain plus direct filesystem reads of the vault.
- **pgvector-based RAG** over claims, embedded with Voyage AI.
- A **light orientation map** injected into every turn's system prompt so the agent knows what universe it's in without spending tool calls.
- **Conversation persistence** within a single bounded session, with manual lifecycle controls (Compact / New conversation) and a token-usage meter.
- An **HTTP endpoint for compilation**, wired to PRD 1's existing compilation agent.
- **CLI additions** for embedding backfill and updates to the reset command for the new tables.

### 1.2 Where this sits in the larger project

| PRD | Scope | Status |
|---|---|---|
| PRD 1 | Memory architecture (OpenBrain + wiki + compilation agent) | Shipped |
| **PRD 2** (this doc) | **Agent shell — chat UI + backend wired to memory** | **Draft** |
| PRD 3 | Research capability — Tavily integration + ingestion pipeline | Not started |
| PRD 4 | Coordinator vs agent-team architecture decision and refactor | Not started |
| PRD 5 | Document production — strategic framework, marketing plan, business plan templates | Not started |
| PRD 6 | Financial modeling — analysis + projections | Not started |

### 1.3 Goals

PRD 2 is graded on whether the human user can:

1. **Sit down at a chat UI and explore what's in OpenBrain via natural language**, with the agent retrieving relevant claims and citing them properly.
2. **Capture decisions, observations, and findings into OpenBrain mid-conversation**, without dropping back to the CLI.
3. **Trigger a vault recompile from the UI** when they want the wiki to reflect the latest state.
4. **Resume a paused session** by reopening the browser; manually **compact** when the conversation gets long; manually **start a new conversation** when switching topics.
5. **See, in real time, what the agent has retrieved** when answering — trust the response is grounded in real memory, not hallucinated.

The goals from PRD 1 (knowledge compounding, reasoning quality, recall fidelity) carry forward; PRD 2 is the substrate that lets the user actually exercise them.

### 1.4 Amendment to PRD 1

PRD 2 reverses one explicit deferral from the PRD 1 spec:

- **PRD 1 §3.6, item 2** ("Vector embeddings — Karpathy's gist explicitly says BM25/index-based retrieval works at this scale (~100s–1000s of items). Add later if needed.") is **reversed**.
- **Reason:** PRD 1's Karpathy citation applied to a *human* searcher. With Opus driving retrieval as part of the agent loop, semantic recall benefits at small scale too. Deferring would force a later migration over data we'd already have accumulated.
- **Effect:** PRD 2 adds the `pgvector` extension and a `claims.embedding` column. Backfill via a new CLI command. Schema is purely additive; no PRD 1 decisions are otherwise touched.

No other amendments. PRD 1's compilation agent, lint, vault structure, status discipline (every claim is a hypothesis, promotion requires reason), provenance requirement, and reset semantics all stand unchanged.

---

## 2. Architecture overview

```
                  ┌────────────────────────────────────────────────┐
                  │  React frontend (Vite + Tailwind)              │
                  │  ┌──────────────┐  ┌─────────────────────────┐ │
                  │  │ Chat pane    │  │ Live context panel      │ │
                  │  │ (messages,   │  │  - retrieved this turn  │ │
                  │  │  token meter,│  │  - Compile button       │ │
                  │  │  Compact /   │  └─────────────────────────┘ │
                  │  │  New conv)   │                              │
                  │  └──────────────┘                              │
                  └─────────────┬──────────────────────────────────┘
                                │  POST /chat (SSE stream)
                                │  POST /chat/compact
                                │  POST /chat/new
                                │  GET  /chat/state
                                │  POST /vault/compile
                                ▼
                  ┌────────────────────────────────────────────────┐
                  │  Node/TS backend (Fastify)                     │
                  │  ┌──────────────────────────────────────────┐  │
                  │  │  Agent runtime (Anthropic SDK + loop)    │  │
                  │  │  - tool dispatch                         │  │
                  │  │  - streaming → SSE                       │  │
                  │  │  - per-turn orientation map              │  │
                  │  └────────┬──────────────────┬──────────────┘  │
                  │           │                  │                 │
                  │           ▼                  ▼                 │
                  │  ┌──────────────────┐  ┌──────────────────┐    │
                  │  │ Read tools (7):  │  │ Write tools (4): │    │
                  │  │ searchClaims     │  │ addClaim         │    │
                  │  │ getClaim         │  │ tagClaim         │    │
                  │  │ getSource        │  │ addRelation      │    │
                  │  │ getConcept       │  │ triggerCompile   │    │
                  │  │ getContradictions│  │                  │    │
                  │  │ listTags         │  │                  │    │
                  │  │ getRecentLog     │  │                  │    │
                  │  └────────┬─────────┘  └─────────┬────────┘    │
                  │           ▼                      ▼             │
                  │  ┌─────────────────────────────────────┐       │
                  │  │ OpenBrain API                        │       │
                  │  │ - existing PRD 1 surface             │       │
                  │  │ - searchClaims (pgvector + filters)  │       │
                  │  │ - getOrientationMap                  │       │
                  │  │ - conversation/message API           │       │
                  │  │ - embedding pipeline                 │       │
                  │  └─────────────┬────────────────────────┘       │
                  └────────────────┼───────────────────────────────┘
                                   │
                                   ▼
              ┌───────────────────────────────────────────┐
              │  Postgres                                 │
              │  PRD 1 tables                             │
              │  + claims.embedding (vector(1024))        │
              │  + conversations + messages               │
              └───────────────────────────────────────────┘

              vault/  ←  read directly via fs from getConcept / etc.
                     ←  written by compilation agent (PRD 1)
```

The backend exposes five HTTP endpoints. The chat endpoint streams via SSE; the others return JSON. Compilation is invoked through `POST /vault/compile` (from the UI button) or the agent's `triggerCompilation` tool — both paths call the same in-process `runCompilation` from PRD 1.

---

## 3. Schema additions

A single migration on top of PRD 1's schema. Purely additive; no destructive changes.

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings on claims (additive, nullable)
ALTER TABLE claims ADD COLUMN embedding         vector(1024);   -- voyage-3 dimension
ALTER TABLE claims ADD COLUMN embedded_at       TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN embedding_model   TEXT;            -- 'voyage-3', etc.

CREATE INDEX claims_embedding_hnsw_idx
  ON claims
  USING hnsw (embedding vector_cosine_ops);

-- Chat persistence (within-session only; no archive)
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,            -- 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system_summary'
  content         JSONB NOT NULL,           -- raw Anthropic message blocks (preserves tool_use, citations)
  token_count     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);
```

Rationale:

- **`embedding` is nullable** so PRD 1 data remains valid pre-backfill, and so a Voyage outage cannot block claim creation.
- **`embedding_model` is recorded** so a future model swap can drive selective re-embedding without column gymnastics.
- **HNSW with cosine ops:** better recall than IVFFlat at our scale (100s–1000s of claims); build time is irrelevant since writes are infrequent. Voyage embeddings are L2-normalized, so cosine is the natural metric.
- **`messages.content` as JSONB:** stores raw Anthropic message blocks (text, tool_use, tool_result) so refresh-after-stream replays with full fidelity (tool calls, citations).
- **Forward-compat:** `conversations` is its own table even though PRD 2 only ever has one active row. Migrating to named multi-conversation threads later is a UI/API change, not a schema change.

### 3.1 Infrastructure change required

The stock `postgres:16` image used by PRD 1's `docker-compose.yml` does **not** include the `pgvector` extension. Switch the image to `pgvector/pgvector:pg16` (drop-in: same Postgres 16 with the extension preinstalled). The migration's `CREATE EXTENSION IF NOT EXISTS vector` only succeeds against an image that has the binary.

Volume name and credentials are unchanged, so existing dev databases survive the image swap on restart.

### 3.2 What is NOT added

- **Source-level embeddings.** `sources.content` can be very long and would need chunking; the cost/value isn't justified yet. Sources are reachable transitively via `claim.source_id`.
- **Conversation archive.** Per Q4, "New conversation" deletes the prior conversation row entirely (CASCADE wipes messages). No history is retained. Audit data lives in OpenBrain via `created_by='agent'`.
- **Conversation state column.** Only one active conversation exists at a time; "active" is implicit (it's the row that exists).

---

## 4. Embedding pipeline

### 4.1 Provider

**Voyage AI** (Anthropic's recommended embedding partner). Configured via env:

```
VOYAGE_API_KEY=...
VOYAGE_MODEL=voyage-3        # default; swap to voyage-3-large for quality, voyage-3-lite for cost
```

Wrapped in a single module `backend/src/embeddings/voyage.ts` exposing one method `embed(texts: string[]): Promise<number[][]>`. Behind an interface so swapping providers is a one-file change.

### 4.2 When embeddings are produced

| Trigger | Behavior |
|---|---|
| `createClaim()` | After the claim insert returns, kick off `embeddingService.embed(claim.statement)` asynchronously. On success, write `embedding`, `embedded_at`, `embedding_model`. **Insert never waits on Voyage.** |
| Voyage call fails | Log warning. Claim row stands with `embedding IS NULL`. Backfill via `embed-missing`. |
| `pnpm cli embed-missing [--batch-size N]` | Walks `claims WHERE embedding IS NULL`, embeds in batches of 16 (configurable), writes back. Idempotent. Safe to re-run. |
| `pnpm cli embed-all --force` | Re-embeds every claim. Used after a model swap. Updates `embedding_model`. |

### 4.3 What text is embedded

Just `claims.statement`. Simplest, and recall on statement text alone is the headline metric. If recall feels weak after real use, we can revisit with composite text (statement + tag display names + source title) — that's a tuning question for after we have data.

---

## 5. OpenBrain API additions

Existing PRD 1 surface is unchanged. New functions:

### 5.1 Retrieval (read)

```ts
searchClaims(query: string, opts?: {
  topK?: number;                   // default 8
  filter?: {
    tags?: string[];               // tag slugs
    status?: ClaimStatus[];
    type?: ClaimType[];
    sourceId?: string;
  };
}): Promise<RankedClaim[]>;        // { claim, similarity, source, tags, activeRelations }

getOrientationMap(): Promise<{
  tags: { slug: string; display: string; claimCount: number }[];
  totals: {
    sources: number;
    claims: number;
    openHypotheses: number;
    unresolvedContradictions: number;
  };
  recentEvents: LogEvent[];        // last 10
  lastCompilationAt: string | null;
}>;
```

`searchClaims` SQL shape:

```sql
SELECT c.*,
       1 - (c.embedding <=> $query_embedding) AS similarity,
       s.title AS source_title, s.url AS source_url
FROM claims c
LEFT JOIN sources s ON s.id = c.source_id
WHERE [optional metadata filters]
  AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> $query_embedding
LIMIT $topK;
```

Metadata filters apply pre-ANN-search via WHERE clauses. HNSW handles the vector ordering.

`getOrientationMap` is generated by a single composite query (one round trip with several CTEs).

### 5.2 Conversation lifecycle

```ts
getActiveConversation(): Promise<Conversation>;       // creates one if none exists
appendMessage(conversationId, role, content, tokenCount): Promise<Message>;
getMessages(conversationId): Promise<Message[]>;
compactConversation(conversationId, summaryContent, summaryTokens): Promise<void>;
                                                       // tx: delete prior messages, insert system_summary
newConversation(): Promise<Conversation>;             // delete current (CASCADE), create fresh
getConversationTokenUsage(conversationId): Promise<number>;
```

All write functions accept a `pg.PoolClient` for transactional composition (consistent with PRD 1 §6).

---

## 6. Agent runtime

### 6.1 Framework

**Anthropic SDK** (`@anthropic-ai/sdk`, the Messages API client) with a **small custom agent loop** of our own (~80 LOC). The SDK handles streaming, retry, and partial tool-use block reassembly. We own the multi-turn dispatch loop:

```
loop:
  resp = client.messages.create({ model, system, messages, tools, stream: true })
  forward stream to SSE
  if resp.stop_reason == 'end_turn': break
  if resp.stop_reason == 'tool_use':
    for each tool_use block: execute handler → append tool_result block
    append assistant + tool_result messages, continue loop
```

**Note on the alternative considered.** The brainstorm chose "Anthropic Agent SDK" (the higher-level `@anthropic-ai/claude-agent-sdk`) on the strength of "thin agent loop with tool dispatch built-in." On closer inspection during spec review, that SDK is the rebranded Claude Code SDK — it ships Claude-Code-style defaults (file-edit, bash tools, permission system, hooks) and exposes custom tools through an in-process MCP server abstraction. For our use case (custom DB-backed tools, no file editing, no shell), navigating around those defaults is more friction than just writing the dispatch loop ourselves. Net code difference is small; the lower-level path is cleaner for what we're building.

**Why this over LangChain/LangGraph:** stack is fixed on Opus + Anthropic API; LangChain's provider-abstraction is wasted weight; we have ~10 tools and a clean state model and don't need a graph.

**Why this over the Claude Agent SDK:** see note above — the higher-level SDK's batteries are aimed at a different use case than ours.

### 6.2 Per-turn loop

```
1. Frontend POSTs /chat { message }
2. Backend opens SSE stream
3. Append user message to `messages` (with token_count)
4. Build the model request:
   a. System prompt = static prompt (§6.3)
                    + orientation map (§6.4)
                    + compaction preamble (if a `system_summary` row exists; see below)
   b. Conversation history = all messages for active conversation_id
                             with role IN ('user','assistant','tool_use','tool_result')
                             (the `system_summary` row is not sent as a history message)
   c. Tool definitions       (§6.5)
5. Call `client.messages.create({ ..., stream: true })`
6. Forward content/tool events as SSE (§6.6)
7. On each tool_use: dispatch handler, append tool_use + tool_result rows
8. On loop completion: append final assistant message, update token_count, emit message_complete
9. Close SSE stream
```

**Compaction preamble:** when a `system_summary` row exists for the active conversation (placed there by Compact, §9.3), its content is appended to the system prompt under a clearly-delimited block:

```
<conversation_summary>
{summary text from the system_summary row}
</conversation_summary>
```

This keeps the Anthropic API's `messages` array using only standard `user` / `assistant` roles, while still surfacing prior-turn context to the model. There is at most one `system_summary` row per conversation; a second Compact replaces it.

Failure modes (Voyage outage during a tool call, Anthropic API timeout, DB errors) emit an SSE `error` event. Partial assistant content already streamed is saved at every block boundary, so an interrupted turn does not lose the content the user already saw.

### 6.3 Static system prompt (~600 tokens)

Authored once, lives in `backend/src/agent/prompt/static.md`. Conveys:

- **Role:** assistant for the user's business-plan-builder project. Memory lives in OpenBrain (structured Postgres) and a wiki vault (compiled markdown read in Obsidian).
- **Discipline rules:**
  - Every claim is a hypothesis until manually promoted. The agent **cannot** promote claim status. If a claim looks ready to promote, surface it for the user to act on.
  - Citations required: every claim referenced should link back to its source via `[[sources#^src-...]]` or to the originating claim block-id `^claim-...`.
  - When the user states a decision ("we decided X because Y"), use `addClaim` with `type='decision'`. Source can be null for user decisions.
  - Surface contradictions when relevant; do not smooth them.
- **Tool-use guidance:**
  - Prefer `searchClaims` for "what do we know about X" questions.
  - Prefer `getConcept(slug)` for "summarize the strategy on X" questions (vault holds synthesized strategy).
  - Use `triggerCompilation` only when explicitly asked, or after a meaningful batch of writes — and tell the user what just happened.

### 6.4 Dynamic orientation map (~1–2K tokens, regenerated per turn)

Generated by `getOrientationMap()`, formatted into the system prompt:

```
=== Memory orientation (snapshot @ 2026-04-30T19:42:00Z) ===
Tags (14): smb-restaurants (17), pricing-strategy (8), scheduling-pain (6), ...
Totals: sources=47, claims=82, open hypotheses=58, unresolved contradictions=2
Recent activity:
  - 2026-04-30 18:42  compilation run success (5 pages written, 9 skipped)
  - 2026-04-30 18:40  claim added: "62% of independent restaurants under $1M..."
  - 2026-04-30 12:15  source ingested: Square 2026 State of Restaurants
  ...
Last compilation: 2026-04-30 18:42:11
=== End orientation ===
```

### 6.5 Tool surface (11 tools)

| Tool | Read/Write | Purpose |
|---|---|---|
| `searchClaims(query, topK?, filter?)` | R | Vector + metadata search |
| `getClaim(id)` | R | Full provenance: claim + source + active relations + tags |
| `getSource(id)` | R | Source meta + full content |
| `getConcept(slug)` | R (fs) | Read `vault/concepts/<slug>.md` |
| `getContradictions()` | R | Unresolved contradiction pairs |
| `listTags()` | R | All tags with display + claim counts |
| `getRecentLog(limit?)` | R | Recent compilation runs + claim activity |
| `addClaim(statement, type?, sourceId?, sourceExcerpt?, sourceLocator?, tags?)` | W | Create a claim with `created_by='agent'`. `tags` is sugar — agent can attach inline. |
| `tagClaim(claimId, tagSlug, displayHint?)` | W | Idempotent. New tags get `metadata.created_in_chat=true` for taxonomy audits. |
| `addRelation(fromClaim, toClaim, type, note?)` | W | All relation types except `supersedes` (which is part of status promotion). |
| `triggerCompilation()` | W | Runs the compilation agent in-process. Returns the run summary. |

Deliberately absent (per Q3 decisions):

- **`setClaimStatus`** — promotion is the user's discipline mechanism. Stays a deliberate CLI act.
- **`createSource`** — sources are research artifacts. Comes from CLI ingest, Tavily later.

### 6.6 SSE event protocol

```
event: text_delta            data: { text: "..." }
event: tool_use_start        data: { name, input, toolUseId }
event: tool_use_complete     data: { toolUseId, result, durationMs }
event: message_complete      data: { tokenCount, totalConversationTokens }
event: error                 data: { message }
```

The frontend's live context panel updates on `tool_use_start`/`tool_use_complete`. `message_complete` carries the running token count so the meter updates without a separate fetch.

### 6.7 Module shape

```
backend/src/agent/
├── runtime.ts             — orchestrator (request build, SDK call, SSE forwarding, message persistence)
├── prompt/
│   ├── static.md          — discipline & tool-use guidance (hand-maintained)
│   └── orientation.ts     — dynamic map formatter
├── tools/
│   ├── definitions.ts     — JSON schema definitions for all 11 tools
│   ├── readers.ts         — searchClaims, getClaim, getSource, getConcept, ...
│   └── writers.ts         — addClaim, tagClaim, addRelation, triggerCompilation
└── compaction.ts          — Haiku-driven summary path
```

Each tool handler is a pure async function `(args, ctx) => Promise<ToolResult>`. The orchestrator owns side effects (DB writes, SSE forwarding).

---

## 7. HTTP API

Five endpoints. SSE on the chat endpoint; JSON on the rest.

```
POST   /chat
  body:     { message: string }
  response: SSE stream (events per §6.6)

POST   /chat/compact
  body:     {}
  response: { summary: string, newTokenCount: number }
  behavior: Haiku summarizes; transactionally replaces messages with one `system_summary` row.

POST   /chat/new
  body:     {}
  response: { conversationId: string }
  behavior: deletes current conversation row (CASCADE wipes messages), creates fresh.

GET    /chat/state
  response: { conversationId, messages: Message[], tokenCount: number }
  behavior: rehydrates a paused session. Creates the conversation if none exists.

POST   /vault/compile
  body:     {}
  response: { runId, status, pagesWritten, pagesSkipped, durationMs }
  behavior: calls in-process runCompilation (PRD 1).
```

All endpoints serialize per-conversation. Two simultaneous chat submissions on the same conversation: second returns 409 "another turn in progress." Single-user app — acceptable trade.

---

## 8. Frontend

### 8.1 Stack

- **Vite + React + TypeScript** (strict, matches backend)
- **Tailwind** for styling. No component library — small surface, custom is faster.
- **State:** `useState`/`useReducer` locally; one small **Zustand** store for cross-panel state (current conversation, retrieved-this-turn, token usage). No TanStack Query.
- **SSE consumption:** custom minimal parser over `fetch()` + `ReadableStream`. EventSource is GET-only and we want POST. ~30 lines of TS.
- **Markdown rendering:** `react-markdown` + `remark-gfm`. Custom remark plugin transforms Obsidian-style refs:
  - `[[sources#^src-<id>|Title]]` → click opens via `obsidian://` URL when registered, else inline expand showing source meta from a fetched detail.
  - `[[concepts/<slug>|Display]]` → same idea.
  - `^claim-<id>` block-refs → click opens an inline expand of the full claim provenance.

### 8.2 Layout (per Q6 decision: B)

```
+-------------------------------------------------------------+
| PRD 2 Agent             [▓▓▓░░░░░] 12,432 / 400,000   ⋯     |
+-------------------------------+-----------------------------+
| Chat pane                     | Context (live)              |
| ┌──────────────────┐          |                             |
| │ User: ...        │          | Retrieved this turn:        |
| └──────────────────┘          | • claim 1a2b · pricing      |
| ┌──────────────────────────┐  | • claim 3c4d · smb-rest.    |
| │ Assistant: ... [[cit]]   │  | • source: Square 2026       |
| │ ▸ searchClaims("pricing")│  |                             |
| └──────────────────────────┘  | ─────────────               |
|                               |                             |
| [Send a message...      ↵]    | [Compile vault]             |
+-------------------------------+-----------------------------+
```

The header `⋯` menu has: **Compact conversation**, **New conversation**, **Settings** (placeholder for future model/theme controls).

The context panel clears at the start of each user turn and populates as `tool_use_complete` events arrive. After `message_complete`, it stays put until the next user turn.

### 8.3 Component shape

```
frontend/src/
├── App.tsx
├── components/
│   ├── Header/
│   │   ├── TokenMeter.tsx           — meter + threshold colors
│   │   └── Menu.tsx                 — Compact / New conversation / Settings
│   ├── Chat/
│   │   ├── ChatPane.tsx             — message list + input
│   │   ├── Message.tsx              — markdown render + citation transform
│   │   ├── ToolCallDisclosure.tsx   — collapsible inline tool call display
│   │   └── Composer.tsx             — input + send button
│   └── Context/
│       ├── ContextPanel.tsx         — retrieved-this-turn list
│       ├── RetrievedItem.tsx        — claim/source/concept entry
│       └── CompileButton.tsx        — POST /vault/compile + toast
├── lib/
│   ├── sse.ts                       — fetch+stream SSE parser
│   ├── api.ts                       — typed wrappers for the 5 endpoints
│   └── citations.ts                 — remark plugin for [[...]] refs
└── store.ts                         — Zustand store
```

---

## 9. Conversation lifecycle

### 9.1 States

A single `conversations` row exists at all times after first paint (created lazily on first `GET /chat/state`). It has no explicit lifecycle state column — it is either the active conversation (the one row that exists) or it has been deleted by "New conversation" and replaced with a new row.

### 9.2 Token meter

| Threshold | UI signal | Behavior |
|---|---|---|
| 0–75% (< 300K) | Default meter color | Normal operation |
| 75–90% (300K–360K) | Yellow/orange meter; subtitle "Consider wrapping up — Compact or New soon" | Soft warning; user retains control |
| ≥ 90% (≥ 360K) | Red meter; banner above input "Approaching token budget (90%)" | Hard warning; still no block |
| 100% (= 400K) | Red meter, persistent banner | User chose 400K as the operational ceiling for context-rot reasons. Input is still accepted; the API supports up to 1M. |

Thresholds and budget are config constants (`backend/src/agent/config.ts`) so recalibration is one line.

### 9.3 Compact

- Trigger: user clicks "Compact conversation" in the menu.
- Backend calls Haiku with system prompt `"Summarize this conversation, preserving decisions, open questions, and any context needed to continue. Output: a concise narrative under 800 tokens."`
- Backend transactionally:
  1. Reads all messages for the active conversation.
  2. Calls Haiku (Haiku is called outside the transaction; the transaction begins after the summary returns).
  3. `DELETE FROM messages WHERE conversation_id=$1 AND role IN ('user','assistant','tool_use','tool_result','system_summary')`.
     (Deleting any prior `system_summary` ensures a Compact-of-a-Compact replaces, not appends.)
  4. `INSERT INTO messages (conversation_id, role, content, token_count) VALUES ($1, 'system_summary', ..., ...)`.
- Returns the new token count.
- Frontend clears the chat pane and shows a single "Conversation summarized" indicator at the top, with the summary text expandable.

On the next user turn, the per-turn loop (§6.2) detects the `system_summary` row and renders its content into the system prompt as a `<conversation_summary>` block. The Anthropic API's `messages` array only ever contains `user` / `assistant` / `tool_use` / `tool_result` content blocks.

### 9.4 New conversation

- Trigger: user clicks "New conversation"; **confirmation dialog** ("This deletes the current conversation history. Continue?").
- Backend: `DELETE FROM conversations WHERE id=$current` → CASCADE wipes messages → `INSERT INTO conversations DEFAULT VALUES RETURNING id`.
- Frontend: clears state, starts fresh.

No archive. The user explicitly chose this — durable record lives in claims captured during the conversation.

---

## 10. Compilation HTTP endpoint

`POST /vault/compile` (and the `triggerCompilation` tool) calls PRD 1's `runCompilation` function in-process:

```ts
const result = await runCompilation({ trigger: 'api' });   // or 'agent' for the tool path
return {
  runId: result.runId,
  status: result.status,
  pagesWritten: result.pagesWritten,
  pagesSkipped: result.pagesSkipped,
  durationMs: result.durationMs,
};
```

PRD 1's `compilation_runs.trigger` column gains two new values: `'api'` and `'agent'` (joining `'cli'` and `'cron'`). Existing rows are unaffected.

Lock semantics from PRD 1 §5.6 carry through: if the lock file is present and fresh, the request returns 409 "Compilation already in progress (run X started Y minutes ago)." Stale lock recovery is unchanged.

---

## 11. CLI additions

| Command | Purpose |
|---|---|
| `pnpm cli embed-missing [--batch-size N]` | Walks `claims WHERE embedding IS NULL`; embeds via Voyage in batches; writes back. Idempotent. |
| `pnpm cli embed-all --force` | Re-embeds every claim. Used after model swaps. Updates `embedding_model`. Confirmation required unless `--yes`. |
| `pnpm cli serve` | Starts the backend service. Convenience wrapper around `node backend/dist/index.js`. |

PRD 1's other CLI commands are unchanged.

---

## 12. Reset behavior updates

| Flag | Updated behavior |
|---|---|
| `--db` | PRD 1 list **+** truncates `messages`, `conversations`. Schema preserved. |
| `--vault` | Unchanged from PRD 1. |
| `--all` | Both, in sequence. |
| `--snapshot <path>` | `pg_dump` already captures the new tables; no work needed. |
| Typed-confirmation, `--yes`, migration history preservation | All unchanged. |

---

## 13. Error handling

| Failure | Behavior |
|---|---|
| Voyage outage during `addClaim` | Claim inserts with `embedding=NULL`. Logged. Picked up by next `embed-missing` run. The agent's response succeeds. |
| Anthropic API timeout / error mid-stream | SSE `error` event. Partial assistant content already streamed is saved (block-by-block on receipt). User can resend. |
| Tool call throws | Returned to the agent as `tool_result` with `is_error=true`. The agent decides how to recover; usually surfaces the error in chat. |
| DB connection lost | All endpoints return 503 with a clear message. Frontend shows a top banner with retry. |
| Compact called with conversation > 180K tokens (Haiku 200K limit minus prompt overhead) | 422 with explicit message: "Conversation too large for Haiku to summarize — use New conversation instead." |
| `triggerCompilation` while CLI compile is running | 409 from existing PRD 1 lock; agent surfaces "compile already running, try again shortly." |
| Two browser tabs submitting to same conversation simultaneously | Backend serializes per `conversation_id`; second returns 409 "another turn in progress." |
| Voyage `embed` returns malformed dimensions | Reject; mark claim's embedding as still-null; log; do not crash. |
| Frontend SSE parser sees a malformed event | Discard the event; log to console; continue parsing the stream. |

---

## 14. Edge cases addressed by design

| Edge case | Handling |
|---|---|
| Empty memory state (fresh DB, post-reset) | Orientation map shows zero counts. Agent acknowledges empty memory in its first response and offers to start capturing. Not an error. |
| First-ever paint with no `conversations` row | `GET /chat/state` creates one transparently. |
| Browser refresh mid-stream | In-flight SSE is lost; backend continues to completion and persists the assistant message. On next paint, `GET /chat/state` shows the full saved message. |
| Concept slug requested but vault page absent | `getConcept(slug)` returns a clean "no page — run compile" result; agent informs the user. |
| Agent invents a new tag slug via `tagClaim` | Tag is created with `metadata.created_in_chat=true`. Lint check (PRD 1 extension) lists these for periodic taxonomy review. |
| Token meter drift over project lifetime | Budget and thresholds are config constants; recalibrate in one place. |
| Voyage model swap | `embedding_model` per row enables `embed-all --force` to rebuild only stale rows. |
| Postgres pool exhaustion | Single-user app; pool size 5; if exceeded, requests queue with a timeout and clear error. |
| Citation links to a deleted claim/source | The remark plugin gracefully degrades to plain text + inline note "[[broken citation]]"; lint catches it on the OpenBrain side. |
| Compilation running when frontend posts `/vault/compile` | Endpoint returns 409 with the existing run's UUID; UI shows toast "compile already running." |

---

## 15. Testing strategy

### 15.1 Test infrastructure

Carries forward PRD 1's setup: Vitest, separate `business_plan_test` Postgres database, transaction-rollback per test. New: mocking layers for Anthropic API (`@anthropic-ai/sdk` boundary), Voyage API, and Haiku.

### 15.2 Test layers added by PRD 2

| Layer | What's tested | How |
|---|---|---|
| Unit | SSE parser, token counter, orientation map serializer, citation remark plugin | Vitest, no DB |
| Embedding pipeline | `embed-missing` populates NULLs; idempotence; batch boundaries; provider failure resilience | Real DB; mocked Voyage |
| API integration | All 5 HTTP endpoints | Real DB; mocked Anthropic + Voyage + Haiku at SDK boundary |
| Tool integration | Each of the 11 tools end-to-end | Real DB + tempdir vault fixtures |
| Compaction | `compactConversation` collapses messages, persists summary | Real DB + mocked Haiku |
| Lifecycle | `newConversation` cascades delete; orphaned messages = bug | Real DB |
| Concurrency | Two-tab same-conversation races produce 409, not corrupted state | Real DB |
| Frontend (component) | Vitest + React Testing Library — chat flow, token meter color thresholds, retrieval panel updates on tool events, citation transforms | Mocked endpoints |
| E2E | One Playwright happy-path: open app, send message, see streamed response, click Compile, see toast | Real backend + mocked Anthropic + Voyage |

### 15.3 Coverage targets

80% line on `backend/src/agent/*`, `backend/src/api/*`, `backend/src/embeddings/*`. Frontend coverage is a smell test, not a gate.

### 15.4 Out of scope for PRD 2 testing

- Voyage rate-limit handling under sustained load (single-user, low volume)
- Multi-user concurrency (single user)
- LangSmith-style observability (Q5 — chose Anthropic SDK over LangGraph)

---

## 16. Out of scope / deferred

| Item | Where it lands |
|---|---|
| Tavily research / ingestion pipeline | PRD 3 |
| Coordinator vs agent-team architecture | PRD 4 |
| Strategic framework templates / document production | PRD 5 |
| Financial modeling | PRD 6 |
| Q&A outputs filed back into wiki as pages | Deferred indefinitely (Q1 — chose B over C) |
| Auto-promotion / agent-driven `setClaimStatus` | Out (Q3); revisit when discipline is well-established |
| Agent-initiated `createSource` | Out — sources come from CLI ingest now, Tavily later |
| Auto-compile after agent writes | Out (Q7) — manual only |
| Auto-compact at threshold | Out (Q4) — manual only |
| Multi-conversation threading / named conversations | Schema is forward-compatible; UI is not built |
| Obsidian MCP integration | Out (Q2); revisit if Dataview-style needs surface |
| Source-level / chunked-source embeddings | Out — claims only |
| LLM-driven synthesis hooks in compilation | PRD 5 |
| LangSmith / tracing UI | Out (Q5) |
| Vault file browser inside chat UI | Out (Q6) — Obsidian is the reading tool |
| Activity log tab inside chat UI | Out (Q6) — context panel covers per-turn visibility |
| Token-budget hard block at 400K | Out — visual signal only; user retains control |

---

## 17. Decisions log

Notable architectural decisions and their reasoning:

1. **PRD 1 §3.6 amendment — embeddings now in scope (Q2).** Karpathy's BM25 framing applied to a human searcher; with Opus driving retrieval, semantic recall is qualitatively better even at small scale. Migration is purely additive; nothing in PRD 1 breaks.
2. **Voyage AI for embeddings.** Anthropic's recommended partner; quality and integration align with our Opus stack. Provider is wrapped behind an interface so swapping is one file.
3. **Claims embedded; sources not embedded.** Sources are reachable via `claim.source_id`; chunking source content for vector search isn't justified by current query patterns.
4. **HNSW index with cosine ops.** Better recall than IVFFlat at our scale; build time is irrelevant given infrequent writes; Voyage embeddings are normalized.
5. **Narrow agent write surface (Q3).** `addClaim`, `tagClaim`, `addRelation`, `triggerCompilation` only. Status promotion stays a deliberate user act; source creation stays a research-pipeline act.
6. **Ephemeral conversations; OpenBrain is the durable record (Q4).** Avoids running parallel memory systems. Conversations table retained for forward-compat with named threads.
7. **Manual lifecycle: Compact and New conversation (Q4).** Haiku for compaction (cost). No auto path. Token meter is the user's signal.
8. **Anthropic Messages API SDK + custom small loop (revision to Q5).** Brainstorm chose the higher-level Claude Agent SDK; spec review revealed it's Claude-Code-flavored (file-edit/bash defaults, MCP-tool abstraction). The plain `@anthropic-ai/sdk` with an ~80-LOC dispatch loop is cleaner for our custom DB-backed tool surface. Same answer to the underlying question (no LangGraph, no roll-from-scratch); finer-grained framework pick.
9. **Layout B — chat + live context panel (Q6).** Visibility into retrieval is necessary for trust in a memory-driven agent. Vault tab not built — Obsidian fills that role.
10. **Manual compile only (Q7).** Vault is in git; agent-initiated or auto-compile creates noise the user doesn't want.
11. **Light orientation map per turn (Q8).** Tags + counts + recent log + last-compile timestamp. RAG handles depth; orientation handles "what universe am I in."
12. **400K-token operational budget on Opus 4.7's 1M window.** Deliberate ceiling at ~40% to stay below context-rot territory; visual signals at 75% and 90%; no hard block.
13. **Fastify backend; Vite + React + Tailwind frontend.** Modern, light, TS-first stack consistent with PRD 1 choices.
14. **No TanStack Query; small Zustand store.** Surface area too small to justify TanStack; Zustand handles cross-panel state cleanly.
15. **Custom SSE parser over fetch+ReadableStream.** EventSource is GET-only; we need POST. ~30 lines of TS.
16. **Confirmation dialog on "New conversation" but not on "Compact."** New is destructive (deletes history); Compact preserves the conversation's information in summarized form.
