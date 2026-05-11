# Stack Research

**Domain:** Local single-user multi-agent AI app (chat + Karpathy wiki + OneBrain hybrid memory)
**Researched:** 2026-04-25
**Overall confidence:** HIGH (key 2026 versions and patterns verified against official sources / npm registry)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Server runtime | Required by constraint; LTS through 2027, native ESM, native fetch, native test runner. Avoid Node 20 (older LTS) and bleeding-edge 24. |
| TypeScript | 5.6+ | Type system | Required by constraint; matches Vite 6 / tsx 4 / Drizzle expectations. |
| Postgres | 16 (Docker) | Primary DB (OneBrain) + vectors | Required by constraint. 16 is the right LTS line; pgvector 0.8+ requires Postgres 13+, so 16 is well-supported. |
| pgvector | 0.8.2 | Vector similarity in Postgres | OneBrain has structured rows AND embeddings — pgvector keeps everything in one DB (no separate vector store). HNSW index gives 5–20ms @ 95% recall on 1M vectors, far beyond v1's expected scale (hundreds–low-thousands of OneBrain rows). Use the `pgvector/pgvector:pg16` Docker image. |
| React | 19.x | Frontend framework | Required by constraint. Matches assistant-ui's expected peer range. |
| Vite | 6.x | Frontend dev server + bundler | Standard 2026 React build tool. 40x faster cold start than CRA. Pairs natively with Vitest. |
| Claude Opus | claude-opus-4-x | Primary LLM | Required by constraint. |

### Agent Orchestration — **Claude Agent SDK (TypeScript)**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@anthropic-ai/claude-agent-sdk` | 0.2.x (latest) | Multi-agent orchestration, tool use, sub-agents, MCP integration | **Recommended primary orchestrator.** First-party Anthropic, TypeScript-native, Claude-Opus-tuned, has built-in sub-agent spawning (`maxSubAgents` cap), in-process MCP servers via `createSdkMcpServer`, and Zod-typed custom tools via `tool()`. The "vendor lock-in" critique (it ties you to Claude) is moot — Claude Opus is a hard constraint. |
| `@anthropic-ai/sdk` | 0.90.x | Direct Anthropic API access for fine-grained calls | Used inside the compilation agent / structured-output calls where the heavier Agent SDK shell isn't needed. Includes `MessageStream` helper, Zod tool helpers, automatic tool execution loop. |
| `zod` | 3.23.x | Schema validation for tool args + DB types | Required by Agent SDK tool definitions. Also used for OneBrain row schemas at the API boundary. |

**Decision: Claude Agent SDK over LangGraph (HIGH confidence).** Reasoning is project-specific:

1. **Hard constraint is Claude Opus.** LangGraph's main differentiator is multi-provider portability — irrelevant here. The Agent SDK's "lock-in" disappears as a real cost.
2. **Single-user, local-only.** LangGraph's heavy machinery (durable execution, checkpointing, LangGraph Cloud, supervisor/swarm topologies) is engineered for production multi-tenant systems. This project doesn't need any of it.
3. **Sub-agent topology fits naturally.** Agent SDK has first-class sub-agent spawning via the Agent tool — exactly the pattern needed for research / financial-analysis / compilation sub-agents under a coordinator.
4. **Built-in MCP integration matches the qmd wiki search.** The Agent SDK can attach MCP servers directly to an agent definition. qmd ships an MCP server. Wiring is trivial.
5. **Tool ergonomics.** `tool()` + Zod gives type-safe handler args without a separate schema language — fewer moving parts than LangGraph + LangChain + tool wrappers.
6. **"LangGraph + Claude Agent SDK" hybrid (mentioned in some 2026 articles)** adds two frameworks where one suffices for a single-user local app. Reject as overkill.

When LangGraph would be the right call (and isn't here): multi-provider model routing, production durable execution across crashes, supervisor-with-swarm topologies, cross-agent shared state graphs.

### Web Research — **Tavily** (with Brave as backup option)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@tavily/core` | latest | Web search + extract + crawl from agent | **Recommended.** Built explicitly for AI agents; has `search_depth: 'advanced'` mode with synthesized answer + included image URLs + per-result content extraction — the consumption pattern an agent actually wants. Official TS SDK with full TypeScript types. Free tier covers personal use. |

**Decision: Tavily over Exa/Brave/Firecrawl/Perplexity (MEDIUM confidence — quality is close at the top of the pack).** Reasoning:

- 2026 agent-search benchmarks put Brave (14.89), Firecrawl, and Exa at the top tier; Tavily ~1 point lower on raw retrieval but **wins on agent-specific ergonomics** (built for the agent consumption pattern, not adapted to it).
- Tavily's `extract` and `crawl` endpoints in the same SDK matter for the "agent does in-depth research" requirement — single SDK, fewer integrations.
- Free tier (1,000 credits/mo) is sufficient for a single-user personal project doing real research. Brave's index-independence is a B2B differentiator that doesn't matter here.
- **Add Exa as a secondary tool** if semantic discovery (e.g. "find papers conceptually similar to X") becomes a need — Exa is the strongest semantic-retrieval engine. Treat as optional, not v1.

### Vector / Semantic Search Layer — **pgvector + Voyage 3.5 embeddings**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| pgvector (extension) | 0.8.2 | Vector storage + ANN search inside Postgres | One DB instead of two. HNSW indexes more than fast enough at this scale. ACID + transactional consistency with OneBrain rows — embeddings cannot diverge from the row they describe. |
| `voyageai` (npm) | latest | Embedding generation | **Voyage 3.5** outperforms OpenAI text-embedding-3-large by ~14% and Cohere embed-v4 by ~8% on retrieval benchmarks (2026 RTEB). All Voyage 4 models share a vector space — can re-embed with `voyage-3.5-lite` for cost without re-indexing. 32K context handles long research documents without aggressive chunking. |

**Decision: pgvector over standalone vector DB (HIGH confidence).** Project will likely live well under 1M vectors for the foreseeable future; standalone DBs (Pinecone, Qdrant, Weaviate) add infrastructure with no benefit at this scale. Keeping evidence rows + embeddings transactionally co-located is exactly the OneBrain "provenance + faithful structured query" requirement.

**Decision: Voyage over OpenAI/Cohere for embeddings (MEDIUM confidence).** Voyage tops the 2026 RTEB benchmark and produces vectors aligned across model sizes. OpenAI is the easier default if the user prefers a single API key — not a wrong choice, just slightly worse retrieval. **Avoid local embedding models (Ollama) for v1** — quality gap vs. Voyage/OpenAI is large enough to hurt the "evidence-quality" core value.

### Wiki Search / Retrieval — **qmd** (Tobi Lütke's CLI + MCP server)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@tobilu/qmd` | latest | Hybrid BM25 + vector + LLM rerank search over the Obsidian markdown vault | **Karpathy explicitly endorses qmd as the scaling path** when index.md alone isn't enough. Provides both a CLI (`qmd query`) and an MCP server — Agent SDK can attach the MCP server natively. All-local, no cloud dependency. Written in TypeScript, install via `npm install -g @tobilu/qmd`. |

**Phasing:**
- **Phase 1**: index.md scan only (Karpathy's "works at moderate scale" claim). Cheap to ship.
- **Phase 2 (when wiki > ~50 pages)**: enable qmd via its MCP server, expose as a tool to the chat agent.

This avoids premature optimization while keeping a clear scaling lane.

### Chat UI — **assistant-ui (React) + Vercel AI SDK transport**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@assistant-ui/react` | 0.12.x | Headless chat primitives (Thread, Composer, Message, attachments) | **Recommended.** Radix-headless model means the UI stays controllable as we add custom rendering for wiki-chunk citations, confidence badges, and tool-call traces. First-class Vercel AI SDK integration via `AssistantChatTransport` — automatically forwards system messages and frontend tools to backend. Good streaming, good tool-call rendering, attachments built-in. |
| `ai` (Vercel AI SDK) | 6.x | Streaming transport between React and the agent backend | AI SDK 6 (Feb 2026) introduced the Agent abstraction, ToolLoopAgent, structured outputs with tool calling, and tool-approval primitives. Use for the streaming/transport layer only — orchestration stays in Claude Agent SDK on the server. |
| `@ai-sdk/anthropic` | latest | Anthropic provider for AI SDK (used only for streaming chat responses if we route through AI SDK) | Optional — only needed if the chat HTTP endpoint uses AI SDK's streaming helpers rather than the Agent SDK's own streaming. |

**Decision: assistant-ui over rolling-our-own React (HIGH confidence)** — solving streaming + tool-call rendering + message threads from scratch is a multi-week distraction from the actual product (the hybrid memory pattern). assistant-ui provides exactly the primitives needed without imposing visual style.

**Decision: assistant-ui over Vercel AI Elements (MEDIUM confidence)** — AI Elements is newer, more opinionated, less battle-tested. assistant-ui has a more mature composability model for surfacing wiki-chunk citations alongside messages.

### Backend Framework — **Hono**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `hono` | 4.x | HTTP server (chat endpoint, agent invocation, OneBrain CRUD) | Best TypeScript DX of the three contenders (Express, Fastify, Hono). Type-inferred routes, query strings, and bodies — better than Express or Fastify. First-class streaming/SSE support (needed for chat). Lightweight, low surface area. Runs cleanly on Node. |

**Decision: Hono over Fastify and Express (MEDIUM confidence).** Reasoning:

- **Type inference quality** matters more than raw req/s on a single-user local app. Hono's inferred types for routes and request bodies are cleaner than Fastify's JSON-schema dance and miles ahead of Express.
- **Streaming-first** API matches the chat use case.
- **Ecosystem trade-off acknowledged**: Express has the deepest middleware ecosystem; if a critical middleware doesn't exist for Hono, fall back to Express. For this app's surface area (a handful of endpoints), this is unlikely to bite.
- **Reject Fastify** — perf advantage over Hono is irrelevant at one user; TS DX is worse.
- **Reject tRPC** — adds an RPC abstraction layer that doesn't compose well with assistant-ui's HTTP-streaming transport. Plain HTTP + SSE/streamed responses is simpler.

### Database Layer — **Drizzle ORM + node-pg-migrate**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `drizzle-orm` | latest | Type-safe SQL query builder for OneBrain queries | **Recommended for query-side.** Type-inferred SQL, zero runtime overhead, works directly with pgvector via `cosineDistance` helper or `sql` template, no separate schema language to maintain. Tree-shakeable, ~7.4kb. |
| `node-pg-migrate` | latest | Schema migrations | **Required by constraint.** Compatible with Drizzle — Drizzle is used purely as a query builder against the schema that node-pg-migrate creates. Drizzle's own migration tooling is **not** used. |
| `pg` | 8.x | Postgres driver | Standard, used by both node-pg-migrate and Drizzle's node-postgres adapter. |

**Architecture note:** Drizzle is used as a *query builder over an existing schema*, not as the schema source-of-truth. The migration files (`migrations/*.sql`, run by node-pg-migrate) are the source of truth. This respects the project's stack constraint while giving the agent code type-safe queries.

**Reject Prisma** — heavier runtime, separate schema language, slower DX for schema changes, no pgvector first-class support.

### Scheduled Compilation Agent — **node-cron**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `node-cron` | 4.2.x | Trigger the compilation agent on a schedule (daily/weekly) | **Recommended.** Single-process, single-user, no Redis, no Mongo. Runs the compilation agent as an in-process scheduled task — exactly the simplicity profile this project needs. |

**Decision: node-cron over BullMQ over Agenda (HIGH confidence).**

- BullMQ requires Redis — extra infrastructure for zero benefit at single-user scale. Use BullMQ when you need horizontal scaling, retries, dashboards. We don't.
- Agenda requires MongoDB — wrong DB for this project.
- node-cron is in-process — perfect for "one machine, one user, run the compilation agent on a schedule." Pair with a manual `/recompile` HTTP endpoint for on-demand triggering.

### Testing — **Vitest + Promptfoo for agent evals**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `vitest` | 4.1.x | Unit + integration tests | 5–8x faster than Jest, native TS/ESM, shares Vite config. Modern default for TypeScript projects in 2026. |
| `@vitest/ui` | 4.1.x | Test UI for watch mode | Optional but useful for TDD on agent logic. |
| `promptfoo` | latest | Eval harness for agent behavior | First-class Claude Agent SDK provider. Lets us test "does the agent produce confidence-tagged claims?", "does it push back on weak evidence?", "does the compilation agent preserve contradictions?" as eval cases rather than ad-hoc prompts. Owned by OpenAI but remains open-source. |

**Reject Jest** — slower, heavier ESM/TS setup, no advantage for this project.

### Local Dev Environment — **Docker Compose + tsx watch**

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose | Postgres + pgadmin in containers | Per project constraint. Use `pgvector/pgvector:pg16` image (Postgres 16 with pgvector preinstalled) instead of vanilla `postgres:16` to avoid manual extension install. |
| `tsx` (watch mode) | Hot-reload Node + TS server | Run host-side, NOT inside Docker, to avoid Docker file-watching issues on Windows. Backend connects to Postgres in Docker via `localhost:5432`. |
| `concurrently` | Run frontend Vite + backend tsx watch in one terminal | Standard pattern for local dev. |

**Recommended Docker Compose layout:**
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment: [POSTGRES_PASSWORD, POSTGRES_DB=businessplanner]
  pgadmin:
    image: dpage/pgadmin4:latest
    ports: ["5050:80"]
    depends_on: [postgres]
volumes: { pgdata: {} }
```
The Node app and React frontend run on the **host**, not in Docker — simpler hot-reload, no Windows volume-mount pain.

**Reject containerized Node app for v1.** It adds nothing for a single-user local app and breaks file-watching/IDE integration.

### Other Required Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 9.x | Structured logging | Agent traces, compilation runs, OneBrain writes — must be queryable when debugging "why did the agent do X?" |
| `dotenv` | 16.x | Env var loading | API keys (Anthropic, Voyage, Tavily). Single `.env` at project root. |
| `gray-matter` | 4.x | Parse Obsidian YAML frontmatter | The compilation agent reads/writes wiki pages with frontmatter (tags, confidence, evidence-of). Native dep for Obsidian compatibility. |
| `unified` + `remark` | latest | Programmatic markdown parsing/serialization | Compilation agent constructs Obsidian-flavored markdown — links, callouts, tables. Safer than string concat. |
| `@modelcontextprotocol/sdk` | latest | MCP client to talk to qmd's MCP server (Phase 2) | Optional in Phase 1; required when wiring qmd in Phase 2. |

---

## Installation

```bash
# Backend core
npm install hono @hono/node-server \
  @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk \
  zod \
  pg drizzle-orm \
  node-pg-migrate \
  voyageai \
  @tavily/core \
  node-cron \
  pino dotenv \
  gray-matter unified remark-parse remark-stringify

# Frontend core
npm install react react-dom \
  @assistant-ui/react @assistant-ui/react-ai-sdk \
  ai @ai-sdk/anthropic

# Dev dependencies
npm install -D typescript tsx vite @vitejs/plugin-react \
  vitest @vitest/ui \
  promptfoo \
  concurrently \
  @types/node @types/pg @types/react @types/react-dom \
  drizzle-kit

# Global (recommended in Phase 2)
npm install -g @tobilu/qmd
```

---

## Alternatives Considered

| Recommended | Alternative | When the Alternative Would Be Better |
|-------------|-------------|--------------------------------------|
| Claude Agent SDK | LangGraph (TypeScript) | If model-provider portability becomes a hard requirement, or if production durable-execution / supervisor-swarm topology is needed. Neither applies here. |
| Claude Agent SDK | Mastra | If we wanted a richer batteries-included framework (RAG primitives, eval dashboards, model router) AND were OK trading first-party Anthropic alignment. Mastra is a credible 2026 TS framework (1.0 in Jan 2026, 22k+ stars), but the Agent SDK is closer to the metal and Claude-Opus-tuned. Reconsider Mastra if Agent SDK feels too low-level. |
| Tavily | Brave Search API | Higher raw retrieval quality (Agent Score 14.89 vs Tavily ~13.9) and lowest latency (669ms). Pick Brave if independence from Google/Bing index matters or if Tavily's free tier becomes a constraint. |
| Tavily | Exa | Pure semantic discovery (e.g., "find conceptually-related papers"). Add as a secondary tool if needed; not a Tavily replacement for general research. |
| pgvector | Qdrant | If wiki + research library blows past 50M vectors (extremely unlikely for a single-user business-plan tool). |
| Voyage 3.5 embeddings | OpenAI text-embedding-3-large | Single-API-key simplicity. Slightly worse retrieval quality (~14% on RTEB), but acceptable. Pick this if user already has OpenAI billing and wants to avoid another vendor. |
| Voyage 3.5 embeddings | Local Ollama embeddings | Truly air-gapped requirement. Quality gap is large; not recommended for v1. |
| qmd | Custom BM25 (e.g., MiniSearch) over wiki | qmd is overkill if wiki stays under ~50 pages forever. Start with index.md, escalate to qmd. |
| assistant-ui | Vercel AI Elements | If the team is already deep in Next.js and wants tighter Vercel-stack alignment. AI Elements is newer (less battle-tested). |
| assistant-ui | Custom React | If the chat UI requires unusual interaction patterns assistant-ui can't accommodate. Unlikely for v1 — composable headless primitives are flexible. |
| Hono | Express | If a critical Node middleware lacks a Hono equivalent. Plausible fallback; not the default. |
| Hono | tRPC | If the frontend and backend share many typed RPC calls beyond the chat endpoint. Doesn't fit the streaming-first chat pattern. |
| Drizzle (queries) | Raw `pg` + hand-written SQL | Tightest control, no abstraction. Drizzle's value is type inference on result rows — give it up only if Drizzle's API gets in the way of pgvector advanced features. |
| node-cron | BullMQ | When we need persistent retries, distributed workers, dashboards, multi-machine. Adds Redis — not worth it for a single-user app. |
| Vitest | Jest | Existing Jest investment, or React Native (irrelevant here). |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain.js | Heavy abstractions, 2024-era patterns mostly superseded by Agent SDK / AI SDK 6 / Mastra. Multi-step workflows tangled in `Runnable` wrappers. | Claude Agent SDK |
| OpenAI Agents SDK | Locks to OpenAI models — incompatible with the Claude Opus constraint. | Claude Agent SDK |
| CrewAI | Python-first; weaker TS support; opinionated multi-agent topology that doesn't match the coordinator + compilation-agent pattern here. | Claude Agent SDK |
| Pinecone / Weaviate / Chroma | Extra infrastructure for single-user scale. Adds cloud dependency or extra Docker container with no benefit. | pgvector |
| Prisma | Slower DX, separate schema language (would conflict with node-pg-migrate as schema source-of-truth), heavier runtime. | Drizzle (query-only) + node-pg-migrate (schema) |
| Express body-parser middleware chains | 2025-style boilerplate; weak types. | Hono (built-in body parsing, type-inferred) |
| Create React App | Deprecated, slow, abandoned. | Vite |
| Jest | Slower, heavier ESM/TS setup. | Vitest |
| BullMQ for v1 | Requires Redis; overkill for single-machine, single-user scheduling. | node-cron |
| nodemon | Slower than tsx watch on TS projects, requires extra config for ESM. | `tsx watch` |
| RAG-only (no wiki layer) | This project IS the hybrid pattern. Pure RAG would defeat the experiment. | OneBrain (DB) + compilation agent + Karpathy wiki |
| Local LLMs (Ollama, llama.cpp) for the agent itself | Quality gap vs. Claude Opus is too large for "investor-grade business plans." Hard constraint anyway. | Claude Opus via Agent SDK |
| Inngest, Trigger.dev, Temporal | Cloud-coupled or heavy infra; the project is local-only and single-user. | node-cron + on-demand HTTP trigger |
| Embedding models bundled into pgvector containers (e.g., pgai) | Extra moving piece. Embeddings are generated app-side in TS; pgvector just stores them. | Voyage SDK app-side |

---

## Stack Patterns by Variant

**If wiki stays small (< ~50 pages) through v1:**
- Use index.md scan only for wiki retrieval
- Skip qmd installation
- The agent reads index.md, picks pages, reads them directly

**If wiki grows past ~50 pages:**
- Install qmd globally, run its MCP server
- Attach qmd as an MCP tool to the chat agent via Agent SDK
- Keep index.md as the human-readable catalog

**If a research session generates >100 sources for a single business plan:**
- Add a secondary search tool (Exa for semantic discovery) alongside Tavily
- Reconsider OneBrain partitioning by business-plan-id

**If multi-user becomes desired (out-of-scope for v1, but for north-star planning):**
- Replace node-cron with BullMQ + Redis
- Replace single-process app with proper auth, sessions
- Move from local Docker Compose to a cloud Postgres
- Revisit pgvector → Qdrant only if vector count > 10M

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| pgvector 0.8.x | Postgres 13+, 14, 15, 16, 17 | Use `pgvector/pgvector:pg16` image — preinstalled; avoids `CREATE EXTENSION` ordering issues. |
| `@anthropic-ai/claude-agent-sdk` 0.2.x | Node 20+, TypeScript 5.x | Requires Node ≥ 20; v22 LTS recommended. SDK is in active 0.x — pin exact version, expect breaking changes between minors. V2 interface is in unstable preview. |
| `@assistant-ui/react` 0.12.x | React 18.3+ / 19.x, AI SDK 5 or 6 | If using AI SDK 6, use the v6 runtime (`@assistant-ui/react/v6`); if pinned to AI SDK 5, use the v5 runtime. |
| AI SDK 6.x | React 18.3+/19, Node 20+ | Released Feb 2026. Most code from AI SDK 5 migrates with minimal changes; Agent abstraction is new. |
| Drizzle ORM (latest) | Postgres 12+, `pg` 8.x | Works with node-pg-migrate-managed schemas — Drizzle queries don't require Drizzle to own migrations. |
| node-cron 4.2.x | Node 14+ | Native TypeScript types since v3. |
| Vitest 4.1.x | Node 20+, Vite 5/6 | Shares Vite config; native ESM. |
| Voyage SDK | All Voyage 3.x and 4.x models share a vector space | Can swap voyage-3.5 ↔ voyage-3.5-lite without re-indexing. |
| Tavily `@tavily/core` | Node 18+ | Free tier: 1,000 credits/month. |
| qmd `@tobilu/qmd` | Node + Python (mixed) | TypeScript primary (80%); Python (17%) used for embeddings/rerank. Install once globally. |
| Hono 4.x | Node 18+ via `@hono/node-server` adapter | Hono itself is runtime-agnostic; `@hono/node-server` provides the Node integration. |

---

## Confidence Summary by Recommendation

| Decision | Confidence | Verification Source |
|----------|------------|---------------------|
| Claude Agent SDK over LangGraph | HIGH | Constraint analysis (Claude Opus locked); Agent SDK official docs; benchmark articles |
| pgvector over standalone vector DB | HIGH | pgvector v0.8.2 release notes, 2026 benchmarks, scale analysis |
| Voyage 3.5 over OpenAI embeddings | MEDIUM | 2026 RTEB benchmark cited in multiple sources; quality gap real but not catastrophic |
| Tavily over Brave/Exa | MEDIUM | 2026 agent-search benchmarks (Brave wins on score, Tavily wins on agent-ergonomics — judgment call) |
| qmd for wiki search | HIGH | Karpathy's gist explicitly endorses qmd; ships MCP server |
| assistant-ui for chat UI | HIGH | Multiple 2026 reviews; first-class AI SDK integration; Vercel-recommended pattern |
| Hono over Fastify/Express | MEDIUM | TS DX comparison strong; ecosystem maturity weaker than Express — fallback possible |
| Drizzle as query builder + node-pg-migrate as schema | HIGH | node-pg-migrate is a project constraint; Drizzle works fine over external schemas |
| node-cron over BullMQ | HIGH | Single-user scope makes BullMQ overkill; node-cron is the simplest correct answer |
| Vitest over Jest | HIGH | 2026 benchmarks; modern TS/ESM default |
| Docker Compose for Postgres only (app on host) | HIGH | Standard 2026 local-dev pattern; avoids Windows volume-mount pain |

---

## Sources

### Anthropic / Agent SDK (HIGH confidence)
- [Agent SDK reference - TypeScript - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Give Claude custom tools - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
- [Connect to external tools with MCP - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/mcp)
- [@anthropic-ai/claude-agent-sdk - npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) (v0.2.x latest, Apr 2026)
- [@anthropic-ai/sdk - npm](https://www.npmjs.com/package/@anthropic-ai/sdk) (v0.90.x latest)
- [GitHub - anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)

### Agent Framework Comparisons (MEDIUM confidence)
- [2026 AI Agent Framework Showdown: Claude Agent SDK vs Strands vs LangGraph vs OpenAI Agents SDK](https://qubittool.com/blog/ai-agent-framework-comparison-2026)
- [LangGraph + Claude Agent SDK: The Ultimate Guide to Multi-Agent Systems in 2026](https://www.mager.co/blog/2026-03-07-langgraph-claude-agent-sdk-ultimate-guide/)
- [How to think about agent frameworks - LangChain blog](https://blog.langchain.com/how-to-think-about-agent-frameworks/)
- [Mastra AI: The Complete Guide to the TypeScript Agent Framework (2026)](https://www.generative.inc/mastra-ai-the-complete-guide-to-the-typescript-agent-framework-2026)

### Web Research APIs (MEDIUM confidence)
- [Agentic Search in 2026: Benchmark 8 Search APIs for Agents](https://aimultiple.com/agentic-search)
- [Beyond Tavily - The Complete Guide to AI Search APIs in 2026](https://websearchapi.ai/blog/tavily-alternatives)
- [@tavily/core - npm](https://www.npmjs.com/package/@tavily/core)
- [Tavily JS SDK Reference](https://docs.tavily.com/sdk/javascript/reference)

### Vector / Embeddings (HIGH confidence)
- [GitHub - pgvector/pgvector v0.8.2](https://github.com/pgvector/pgvector)
- [Vector Database Comparison 2026: Pinecone vs pgvector vs Chroma vs Weaviate](https://www.groovyweb.co/blog/vector-database-comparison-2026)
- [Voyage 3.5 vs OpenAI vs Cohere Embedding Models 2026](https://www.buildmvpfast.com/blog/best-embedding-model-comparison-voyage-openai-cohere-2026)
- [Voyage AI TypeScript SDK](https://github.com/voyage-ai/typescript-sdk)
- [Voyage AI Text Embeddings docs](https://docs.voyageai.com/docs/embeddings)
- [Drizzle ORM - Vector similarity search with pgvector](https://orm.drizzle.team/docs/guides/vector-similarity-search)

### Wiki Search (HIGH confidence)
- [GitHub - tobi/qmd](https://github.com/tobi/qmd) (Karpathy-endorsed)
- [Karpathy LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (the source pattern)

### Chat UI (HIGH confidence)
- [I Evaluated Every AI Chat UI Library in 2026](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10)
- [@assistant-ui/react - npm](https://www.npmjs.com/package/@assistant-ui/react) (v0.12.25)
- [@assistant-ui/react-ai-sdk integration docs](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk)
- [AI SDK 6 - Vercel](https://vercel.com/blog/ai-sdk-6) (released Feb 2026)
- [Chatbot Tool Usage - AI SDK UI](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-with-tool-calling)

### Backend Framework (MEDIUM confidence)
- [Best TypeScript Backend Frameworks in 2026](https://encore.dev/articles/best-typescript-backend-frameworks)
- [Hono vs Express vs Fastify vs Elysia 2026 — PkgPulse](https://www.pkgpulse.com/blog/hono-vs-express-vs-fastify-vs-elysia-2026)
- [Hono benchmarks](https://hono.dev/docs/concepts/benchmarks)

### Database Tooling (HIGH confidence)
- [GitHub - salsita/node-pg-migrate](https://github.com/salsita/node-pg-migrate)
- [Drizzle ORM PostgreSQL extensions](https://orm.drizzle.team/docs/extensions/pg)
- [Drizzle vs Prisma in 2026 - Encore](https://encore.dev/articles/drizzle-vs-prisma)

### Scheduling (HIGH confidence)
- [node-cron - npm](https://www.npmjs.com/package/node-cron) (v4.2.1)
- [Choosing the Right Node.js Job Queue - Judoscale](https://judoscale.com/blog/node-task-queues)
- [BullMQ docs - Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

### Testing (HIGH confidence)
- [Vitest vs Jest 2026 - Speakeasy](https://www.speakeasy.com/blog/vitest-vs-jest)
- [Vitest 4.1 release](https://vitest.dev/guide/comparisons.html)
- [Promptfoo - Build Secure AI Applications](https://www.promptfoo.dev/) (Claude Agent SDK provider supported)

### Local Dev (HIGH confidence)
- [Docker Compose Postgres + pgAdmin](https://github.com/matschik/docker-compose-postgres-pgadmin)
- [Visualizing PostgreSQL with pgAdmin - Docker Docs](https://docs.docker.com/guides/pgadmin/)

---

*Stack research for: Local single-user multi-agent AI app (Karpathy wiki + OneBrain hybrid memory)*
*Researched: 2026-04-25*
