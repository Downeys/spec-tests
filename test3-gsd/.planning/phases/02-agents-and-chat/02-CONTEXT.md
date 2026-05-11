# Phase 2: Agents and Chat - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A coordinator agent in a chat UI uses a research sub-agent to search the web via Tavily, lands findings in OneBrain as `sources` and `claims` rows, and the user can trigger a manual recompile that updates the wiki — with the compilation sub-agent as the sole holder of `vault_write_atomic`.

Phase 2 introduces the entire agent layer (coordinator + research sub-agent + compilation sub-agent), the Hono streaming server, the React + assistant-ui chat front end, Tavily integration, and hybrid search across OneBrain — all on top of the proven Phase 1 skeleton (schema, append-only repo, deterministic renderer, content hash, contradiction callouts, CLI).

Out of scope for this phase: ingest / financial / devil's-advocate sub-agents (Phase 4), scheduled recompile / debounced auto-recompile / edit-guard / paired backup (Phase 3), confidence badges in UI (Phase 5), Promptfoo eval suite (Phase 4), strategic-framework page renderers (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Research sub-agent

- **D-01:** **Stopping criteria** — claim cap + time-box. Sub-agent stops at ~10 claims written OR ~120s elapsed, whichever comes first. Predictable cost; user knows when to expect a reply. Hard caps in the prompt + an in-tool counter; `tavily_*` and `onebrain_write_*` tool wrappers report elapsed time and claim count back to the sub-agent on each call so it can self-stop.
- **D-02:** **Tag authority** — research sub-agent suggests, coordinator approves. Sub-agent emits proposed `topic_tags[]` and `framework_tags[]` in its strict JSON output; coordinator validates each against `canonicalizeTag()` ([src/lib/tag-canonicalize.ts](src/lib/tag-canonicalize.ts)) before claims land. Anti-rogue-tag discipline (DATA-10) preserved without blocking research; the canonicalizer is the same surface the Phase 1 fixture writes use.
- **D-03:** **Tavily depth** — search + extract on top-K hits is the default. `tavily_search` returns N results; sub-agent runs `tavily_extract` on the top 3–5 by relevance. `tavily_crawl` is reserved for an explicit "deep research" user signal — Phase 2 builds the hook but does not make crawl the default to keep cost bounded. RES-01's "advanced + extract + crawl" is the *capability* surface, not the per-turn behavior.
- **D-04:** **Output contract** — strict Zod schema, hard reject on malformed. Use Claude Agent SDK's `outputSchema` with the Phase 1 Zod conventions ([src/onebrain/types.ts](src/onebrain/types.ts) discipline) for a contract of `{ summary: string (≤150 words), claim_ids_written: string[], notable_contradictions: ContradictionRef[], proposed_tags: { topic: string[], framework: string[] } }`. SDK retries once on parse failure, then the coordinator surfaces the error to chat. Sets the discipline floor for Phase 4's financial / devil's-advocate / ingest sub-agents.
- **D-05:** **Source-row-first ordering** — research sub-agent always calls `onebrain_write_source` before any `onebrain_write_claim` for the same source. The agent tool wrapper for `onebrain_write_claim` enforces this: `cites_source_ids[]` must reference a source row written this turn or already in OneBrain. Belt-and-braces for AGENT-08 + Pitfall 19 (no quantitative-claim hallucination): combined with the ≥$1M / TAM-shaped check at `repo.writeClaim()`, a no-source quantitative claim cannot land.
- **D-06:** **Sub-agent prose discipline (Pitfall 18)** — coordinator never quotes the sub-agent's `summary` verbatim into chat. Coordinator re-fetches each `claim_ids_written` from OneBrain and cites the live row's `text` + `confidence` + `status`. Sub-agent's summary is *only* used to inform the coordinator's reasoning, not displayed. CLAUDE.md will spell this out as a hard rule.

### Coordinator chat behavior

- **D-07:** **Pushback tone (CRIT-01 + AGENT-08)** — direct + cites the gap. When the user states a TAM-shaped or ≥$1M quantitative claim with no source, the coordinator responds with a template-shaped pushback: "That's a [TAM-shaped / ≥$1M / unsourced] number with no source attached — I'm logging it as a hypothesis at confidence ~0.3 unless you give me a source, or want me to research it." States the rule, the action, the path forward. Aligns with PROJECT.md's "be critical, treat statements as hypotheses, evidence-first" identity. Hard-veto refusal is *not* the default; the system records the user's intent as a hypothesis claim and keeps moving.
- **D-08:** **Sub-agent invocation narration** — brief intent line + tool trace. Coordinator emits a one-line chat message ("Researching Acme's pricing model on the web…") right before invoking a sub-agent; the SDK's tool-call events stream into the assistant-ui tool trace block (UI-03) below the message. Two-channel transparency: prose for ambient awareness, trace for verification.
- **D-09:** **Hypothesis framing** — prose + claim ID. Low-confidence claims (`confidence < 0.5` or `status = hypothesis`) are framed conversationally and cite the claim ID: *"One hypothesis we have — confidence 0.55 — is that customers will accept $99/mo. [[claim:01J9X…]]"*. Mirrors CLAUDE.md's "treat statements as hypotheses" identity in the chat surface; the inline visual confidence badge (UI-05) is added in Phase 5 for reinforcement, not as a substitute.
- **D-10:** **Recompile suggestion** — after research turns that wrote claims. If any claim row was written this turn, the coordinator's reply ends with a recompile nudge ("Recompile to refresh the wiki?" or similar). Phase 3's debounced auto-recompile replaces this nudge; in Phase 2 the manual nudge keeps the user in the loop without surprise side-effects.

### Chat surface UX

- **D-11:** **Tool-call trace default state (UI-03)** — collapsed with one-line summary. Each assistant message shows `▸ N tool calls (research, 3 tavily_extract, 4 onebrain_write_claim)` by default; click to expand. Standard assistant-ui pattern; keeps long sessions readable; full trace one click away.
- **D-12:** **Tool-trace granularity** — tool name + args summary + result count. When expanded, each call renders as `tavily_extract(url="…/pricing") → 4823 chars` or `onebrain_write_claim(text="… 50-char preview …") → claim:01J9X…`. Compact; user can verify behavior without drowning in raw payloads. Full args/results behind a per-call "show raw" toggle is fine if cheap to implement, but not required.
- **D-13:** **Wiki chunk surfacing trigger (UI-04)** — when the user asks about a topic with an existing page. Coordinator checks the topic's tag against the live vault index (or `compile_artifacts.page_path`); if a page exists, surfaces an inline excerpt above its prose answer. Wiki = synthesis cache; OneBrain = live-claim source. Matches ARCHITECTURE.md's query cycle exactly.
- **D-14:** **Wiki chunk format + deeplink** — ~200-word excerpt + `obsidian://` deeplink. Render the relevant section of the page as a markdown excerpt, capped at ~200 words, followed by an "Open in Obsidian →" button using the `obsidian://open?vault=<vault-name>&file=<path>` URL scheme. Vault name comes from a config value (defaults to the directory name `vault`). Fallback: copy-path button if the URL scheme isn't registered on the user's system.

### Recompile UX

- **D-15:** **Recompile button placement (UI-06)** — header bar above chat. Small button + status pill in the app shell header. Always visible; doesn't compete with the composer; standard assistant-ui app-shell pattern. Slash command `/recompile` also works in the composer for keyboard-first triggering, but is *not* the only path.
- **D-16:** **Idle status content** — last compiled time + dirty claim count. Display `Last compiled: 14:32 • 3 claims unwritten to vault`. Dirty count is `claims WHERE updated_at > (SELECT MAX(finished_at) FROM compile_runs WHERE error IS NULL)`. Connects user's writes to vault freshness without requiring a click.
- **D-17:** **In-flight status** — spinner + page-by-page progress. `⟿ Compiling… 1 of 1 page (topics/strategic-positioning.md)`. Phase 2 only renders one topic page per the existing `runCompile()` shape (D-13/D-14 carry-forward from Phase 1); Phase 3+'s diff-based scope handles N pages cleanly with the same display pattern.
- **D-18:** **Post-recompile chat feedback** — inline system message + status indicator update. Drop one line in chat: `Recompiled: 1 page written, 0 skipped (run 01J9X…).` Status pill flips back to `Last compiled: now`. Matches the `wrote N pages` line already emitted by [src/compilation/runner.ts](src/compilation/runner.ts); closes the loop where the user is looking.

### Claude's Discretion

The locked decisions above leave plenty of implementation latitude — these details are the planner / executor's call:

- **CLAUDE.md authoring** — the exact prose for coordinator identity, write protocol, sub-agent usage rules, pushback templates, and the "never quote sub-agent prose" clause. The decisions above set what must be true; the prose is Claude's craft.
- **Hono route surface** — exact shapes of `POST /chat` (SSE), `POST /recompile`, `GET /health`. ARCHITECTURE.md specifies the surface; verb/route/payload details are the planner's.
- **assistant-ui component composition** — exact Thread/Composer wiring, message renderer for inline wiki chunks, tool-trace component shape, runtime configuration via `AssistantChatTransport`. Pick what's idiomatic in `@assistant-ui/react` 0.12.x at planning time.
- **Hybrid search ranking (DATA-09)** — Phase 2 needs `onebrain_search` working for the coordinator + research sub-agent. Specific rank-fusion strategy (RRF vs weighted sum vs filter-then-vector) is an implementation choice; whichever is simplest and works on the Phase 1 fixture's small claim set is fine for v1. Tag filter UX is a function-arg shape, not a user-facing feature.
- **Compilation sub-agent shape** — recommended approach is a thin Agent SDK definition that wraps the existing `runCompile()` from [src/compilation/runner.ts](src/compilation/runner.ts) behind a single `vault_write_atomic` tool gate. The sub-agent's job is *gate enforcement and lifecycle*, not new compile logic. Whether the SDK invokes `runCompile()` directly or via a thin wrapper that translates SDK tool-call protocol is the planner's call.
- **Vault deeplink config** — vault name in the `obsidian://` URL is configurable; default is the basename of the vault path. Fallback behavior when the scheme isn't registered is up to the UI (copy path / show path / disable button).
- **Tool-call trace expanded view styling** — exact layout, colors, "show raw" toggle behavior.
- **Streaming chunk granularity in the UI** — token-level via the Vercel AI SDK 6 transport is the default; whether to coalesce on assistant-ui's side is an ergonomics call.
- **Sub-agent retry behavior on Tavily failure** — fail-loudly to the coordinator with a structured error so the coordinator can offer to retry or proceed without the failed source. Exact retry count / backoff is the planner's.
- **Error rendering when SSE disconnects mid-stream** — show "Connection lost — partial response saved" in the chat; reconnect button. Whether to persist the partial assistant message is up to the implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context (vision, requirements, hard commitments)
- `.planning/PROJECT.md` — Project vision, hard architectural commitments (write directionality, single writer to vault, append-only OneBrain, ULID identity, hypothesis-by-default, contradictions preserved, provenance enforced), key decisions table
- `.planning/REQUIREMENTS.md` §"v1 Requirements" — Phase 2 requirement definitions (INFRA-04, DATA-09, AGENT-01/02/06/07/08, UI-01/02/03/04/06, RES-01/02, COMP-10/11, CRIT-01)
- `.planning/REQUIREMENTS.md` §"Out of Scope" — explicit non-goals (no auth, no real-time collab, no production hosting, no LangChain/LangGraph)
- `.planning/REQUIREMENTS.md` §"Traceability" — per-phase requirement mapping (17 requirements assigned to Phase 2)
- `.planning/ROADMAP.md` §"Phase 2: Agents and Chat" — phase goal, dependencies (Phase 1 schema/repo/renderer), 4 success criteria, mapped requirements
- `.planning/STATE.md` — current project state (Phase 1 complete, Phase 2 next), accumulated decisions
- `CLAUDE.md` — Project instructions; restates the hard architectural commitments and GSD workflow conventions

### Research (synthesized findings — read before planning)
- `.planning/research/SUMMARY.md` — Stack one-liner per layer, build order rationale, top pitfalls; Phase 2 = Slice 1 in the slice numbering ("Smallest agentic slice with user value")
- `.planning/research/ARCHITECTURE.md` — System overview diagram (UI ↔ Hono ↔ coordinator ↔ sub-agents ↔ OneBrain ↔ vault), **multi-agent topology** (hierarchical coordinator + 5 sub-agents — Phase 2 ships coordinator + research + compilation), **sub-agent definitions** (model + tools per sub-agent, including tool-permission gating that enforces single-writer-to-vault), **coordinator's CLAUDE.md key clauses** (identity, write protocol, confidence discipline, sub-agent usage rules), **data flow diagrams** (ingest cycle: research → OneBrain → recompile → vault; query cycle: chat reply pulls from OneBrain + wiki cache), **HTTP server contract** (Hono + SSE + AI SDK 6 transport), **stable ID strategy** (ULID), **vault structure** + **frontmatter convention**
- `.planning/research/STACK.md` — Library version pins (Node 22 + TS 5.6, Hono 4.x, React 19 + Vite 6, `@anthropic-ai/claude-agent-sdk` 0.2.x, `@assistant-ui/react` 0.12.x, Vercel AI SDK 6, `@tavily/core`, Voyage 3.5); critical version notes (Claude Agent SDK 0.x — pin exact)
- `.planning/research/PITFALLS.md` — 20 known pitfalls phase-mapped. Phase 2-relevant pitfalls:
  - **Pitfall 5** (Single-writer discipline on the vault) — tool-gate `vault_write_atomic` to compilation sub-agent only; CI/precommit check
  - **Pitfall 16** (Pushback theater) — coordinator pushback must be substantive, not rhetorical (CRIT-01 + D-07 anchor)
  - **Pitfall 18** (Sub-agent prose smuggling) — strict structured output with Zod schema; coordinator never quotes sub-agent prose verbatim; word-cap (D-04 + D-06 anchor)
  - **Pitfall 19** (Quantitative-claim hallucination) — schema-level filter at `repo.writeClaim()` for ≥$1M / TAM-shaped patterns; source-row-first ordering (D-05 anchor + AGENT-08 + Pitfall 19)
- `.planning/research/FEATURES.md` — Table-stakes feature analysis informing Phase 2 chat-surface choices

### Reference inputs (the source patterns)
- `.planning/inputs/karpathy-llm-wiki-gist.md` — Karpathy's LLM wiki pattern: "you never write the wiki yourself" stance — the rationale for the single-writer-to-vault tool-gate in Phase 2
- `.planning/inputs/nate-b-jones-hybrid-transcript.md` — Hybrid wiki + warehouse interpretation: write-time fork (research → OneBrain first), single-writer compilation-agent design — the architectural source for D-05's source-row-first ordering and the entire Phase 2 agent topology

### Phase 1 carry-forward (locked patterns this phase inherits)
- `.planning/phases/01-walking-skeleton/01-CONTEXT.md` — Phase 1 decisions Phase 2 builds on:
  - **D-03** (CLI persists; agent paths reuse the same lib code)
  - **D-13/D-14** (one topic page per compile in Phase 1; Phase 2's recompile UI displays "1 of 1 page" per D-17)
  - **D-15** (page rendering shape — claims grouped by `topic_tag`, contradictions as Obsidian callouts, never smoothed)
  - **D-16** (`index.md` rebuilt from scratch on every compile)
  - **D-17** (`log.md` is append-only)
  - **D-18** (canonical content hash excludes timestamps — diff stability)
  - **D-21** (single-source-of-truth Zod schemas in `src/onebrain/types.ts` — Phase 2 sub-agent output schemas live here)
  - **D-22** (TS path aliases mirrored in Vite — Phase 2 frontend imports from `@/onebrain/types.js` directly)
- `.planning/phases/01-walking-skeleton/01-VERIFICATION.md` — Phase 1 verification report (5/5 SC, 28/28 reqs) — the proof Phase 2's foundation is solid
- `.planning/phases/01-walking-skeleton/01-REVIEW.md` — Phase 1 code review findings — anti-patterns Phase 2 must not reintroduce

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1 produced the foundation Phase 2 agents and chat sit on top of. All of these are stable, tested, and ready to import:

- **[src/onebrain/repo.ts](src/onebrain/repo.ts)** — `writeSource`, `writeClaim`, `writeEdge`, `writeEntity`, `supersede`, `promoteClaimStatus`, `findAllClaims/Sources/Entities/Edges`, `findClaim`, `findSource`, `findSourceByHash`, `findEdgesFrom`, `logEvent`. Single coercive boundary; no delete path. Phase 2's `onebrain_write_*` and `onebrain_search` agent tools are thin SDK wrappers around these functions.
- **[src/onebrain/types.ts](src/onebrain/types.ts)** — All Zod schemas + TS types (D-21). Phase 2 adds sub-agent input/output schemas here, alongside the existing `NewSourceSchema`, `NewClaimSchema`, etc.
- **[src/onebrain/embed.ts](src/onebrain/embed.ts)** — Voyage 3.5 wrapper; consumed automatically by `writeSource` / `writeClaim`. Phase 2 sub-agents never call `embed()` directly.
- **[src/onebrain/db.ts](src/onebrain/db.ts)** — Drizzle DB instance.
- **[src/onebrain/schema.ts](src/onebrain/schema.ts)** — Drizzle schema mirror (query-only).
- **[src/onebrain/ids.ts](src/onebrain/ids.ts)** — `ulid()` minting.
- **[src/compilation/runner.ts](src/compilation/runner.ts)** — `runCompile()` is the recompile entry. Phase 2's compilation sub-agent wraps this behind a `vault_write_atomic` tool gate; Phase 3 adds diff-based scope on top of the same function.
- **[src/compilation/vault-writer.ts](src/compilation/vault-writer.ts)** — `writeIfChanged` + `writeAtomic`. The `vault_write_atomic` agent tool implementation lives here in Phase 2.
- **[src/compilation/render/topic-page.ts](src/compilation/render/topic-page.ts)** + `frontmatter.ts`, `claim-block.ts`, `contradiction.ts`, `index-md.ts`, `log-md.ts` — deterministic renderer. Phase 2 does not touch these; the compilation sub-agent calls `runCompile()` which calls these.
- **[src/lib/env.ts](src/lib/env.ts)** — Zod-validated env loader. Phase 2 adds `ANTHROPIC_API_KEY` (already in .env.example) + `TAVILY_API_KEY` validation.
- **[src/lib/hash.ts](src/lib/hash.ts)** — Content hash utilities; not directly consumed in Phase 2 but unchanged.
- **[src/lib/log.ts](src/lib/log.ts)** — Pino logger. Phase 2 server / agents log through this.
- **[src/lib/tag-canonicalize.ts](src/lib/tag-canonicalize.ts)** — `canonicalizeTag()`. Used by D-02's coordinator-approved tag flow.
- **[src/cli/index.ts](src/cli/index.ts)** + commands — Phase 1 `bsp` binary is unchanged in Phase 2. Phase 2 adds `bsp serve` (start Hono server) as a new subcommand alongside the existing `ingest` / `compile` / `db migrate` / `db reset`.
- **[src/cli/fixtures/strategic-positioning.ts](src/cli/fixtures/strategic-positioning.ts)** — fixture used to seed OneBrain for Phase 2 dev / smoke tests.
- **[src/ui/App.tsx](src/ui/App.tsx)** + `main.tsx` + `index.html` — Phase 1 placeholder; Phase 2 replaces `App.tsx` with the assistant-ui Thread + Composer per the plan in D-19 of Phase 1's CONTEXT.md.

### Established Patterns

The patterns Phase 1 established that Phase 2 must inherit unchanged:

- **Single-source-of-truth Zod schemas** in `src/onebrain/types.ts` (D-21) — Phase 2 sub-agent output schemas live alongside, not in a parallel file.
- **TS path aliases mirrored Vite/tsc** (D-22) — Phase 2's UI imports types from `@/onebrain/types.js` directly; the SSE transport's payload types are shared with the Hono handler.
- **Append-only OneBrain** — supersede via `edges`, never delete. Sub-agents inherit this.
- **ULID identity, immutable for the row's lifetime** — sub-agent return shapes reference claims by ULID, not by content.
- **Deterministic content hashing for compile idempotency** (D-18) — Phase 2's recompile path uses the existing hash; status indicator's "dirty count" reads `claims.updated_at > last compile_runs.finished_at`.
- **ESLint + Prettier** (D-25) — Phase 2 frontend + agent code obey the same lint config.
- **Sequential edge inserts inside transactions** (Pitfall 16 prevention in [src/onebrain/repo.ts](src/onebrain/repo.ts) `writeClaim()`) — Phase 2 agent tools must not parallelize writes within a single claim.

### Integration Points

Phase 1 produced the integration points Phase 2 plugs into. Phase 2 *creates* most of these (server, agents, UI runtime); a small number are extension points on Phase 1 code:

- **[src/onebrain/repo.ts](src/onebrain/repo.ts) `writeClaim()`** — Phase 2 adds the AGENT-08 / Pitfall 19 quantitative-claim guard here (or in a wrapper) as a coercive boundary that no agent tool can bypass.
- **[src/onebrain/repo.ts](src/onebrain/repo.ts)** — add `searchClaims()` / `searchHybrid()` for DATA-09. Coordinator and research sub-agent both consume this via `onebrain_search` agent tool.
- **`src/server/`** (currently empty) — Phase 2 creates `index.ts` (Hono app + listen), `routes/chat.ts` (SSE coordinator stream), `routes/recompile.ts` (POST → compilation sub-agent → JSON), `routes/health.ts` (GET /health), `streaming.ts` (SSE helpers for assistant-ui transport).
- **`src/agents/`** (currently empty) — Phase 2 creates `coordinator.ts` (`query()` factory; loads `CLAUDE.md` via `settingSources`), `definitions/research.ts`, `definitions/compilation.ts` (Phase 4 adds `ingest`/`financial`/`devils-advocate`), `tools/onebrain.ts` (write_source, write_claim, write_edge, search), `tools/vault.ts` (vault_read, vault_write_atomic — compilation sub-agent ONLY), `tools/tavily.ts` (search, extract, crawl).
- **[src/ui/App.tsx](src/ui/App.tsx)** — Phase 2 replaces the placeholder with the assistant-ui Thread + Composer. New components: `Chat.tsx`, `WikiCitation.tsx` (inline wiki chunks per D-13/D-14), `ToolTrace.tsx` (UI-03), `RecompileButton.tsx` + `RecompileStatus.tsx` (UI-06 per D-15..D-18). New `runtime.ts` configures `AssistantChatTransport` against Hono's `/chat` SSE endpoint.
- **[src/cli/index.ts](src/cli/index.ts)** — Phase 2 adds `bsp serve` subcommand (boots the Hono server). `bsp ingest --fixture` and `bsp compile` continue to work unchanged.
- **[.env.example](.env.example)** + [src/lib/env.ts](src/lib/env.ts) — Phase 2 adds `TAVILY_API_KEY` and confirms `ANTHROPIC_API_KEY` is required (Phase 1 made it optional via the `RUN_VOYAGE_TESTS` precedent — Phase 2 `bsp serve` requires both keys at boot).
- **[package.json](package.json)** — Phase 2 adds: `@anthropic-ai/claude-agent-sdk` (~0.2.x, exact pin), `@anthropic-ai/sdk` (~0.90.x), `hono` (~4.x), `@hono/node-server`, `@assistant-ui/react` (~0.12.x), `ai` (Vercel AI SDK 6), `@tavily/core`. New scripts: `npm run dev` already exists (Vite); add `npm run dev:server` (tsx watch) for the Hono boot during dev.

### Things to NOT touch in Phase 2

- The Phase 1 deterministic renderer (`src/compilation/render/*`) — Phase 3 adds LLM intros (COMP-06), not Phase 2.
- Diff-based recompile / cron / debounce / edit-guard / paired backup — all Phase 3.
- Confidence badges in UI (UI-05) — Phase 5.
- Strategic-framework page renderers (STRAT-01..11) — Phase 5.
- The append-only / supersede-only repository invariants — never.

</code_context>

<specifics>
## Specific Ideas

- **The pushback template (D-07) is a CLAUDE.md authoring detail that captures a specific aesthetic.** Direct, names the rule, names the action, names the path forward — *not* a hard veto. The user wants the system to be a critical thinking partner, not a refusal-bot. This shows up in the `confidence ~0.3` default for unsourced quantitative claims and the "or want me to research it" path forward.
- **"Brief intent line + tool trace" (D-08) is two-channel transparency.** Prose for ambient awareness during a long turn ("I'm doing something"), trace for verification ("here's exactly what I did"). The user explicitly didn't want silent invocation (loss of agency-feel) or verbose narration (clutter + Pitfall 18 prose-leakage risk).
- **"When the user asks about a topic with an existing page" (D-13) is a behavior trigger, not a UI feature.** It's a coordinator-prompt clause that says: classify the user's question against the live vault index; if there's a relevant page, surface it as context above your prose answer. The wiki-as-cache, OneBrain-as-truth pattern from ARCHITECTURE.md's query cycle.
- **`obsidian://` deeplink scheme (D-14) is the correct primitive for Obsidian's native open-by-URL.** Format: `obsidian://open?vault=<vault-name>&file=<relative-path>`. Vault name comes from a config value with a default. Fallback (copy-path button) for when the URL scheme isn't registered must be silent — no error popup; just a different button.
- **The recompile UX (D-15..D-18) closes a feedback loop the user explicitly cares about.** Header-bar pill (always-visible state) + chat-system-message (closure for the action that lives in the chat surface). The user wants to know "did the wiki update" without leaving the chat or opening Obsidian.
- **Source-row-first ordering (D-05) is belt-and-braces for AGENT-08.** The `repo.writeClaim()` quantitative-claim filter (Pitfall 19) catches the violation at the schema layer; the agent tool wrapper enforcing source-row-first catches the same violation at the protocol layer. Two layers because provenance is the system's load-bearing claim.

</specifics>

<deferred>
## Deferred Ideas

These came up implicitly during discussion or are ARCHITECTURE.md futures that belong in later phases. Captured here so they're not lost.

- **"Deep research" depth knob** (user-signaled `tavily_crawl` invocation) — D-03 builds the *capability* (crawl is wired); the *user-facing depth signal* (e.g. user says "deep research" → coordinator passes a depth knob to the sub-agent) is deferred to Phase 4 if it becomes a real need.
- **Devil's-advocate sub-agent + auto-trigger on `confidence > 0.75 && supporting_count < 2`** — Phase 4 (AGENT-05). Phase 2 has no devil's-advocate; pushback is the coordinator's verbal CRIT-01, not a separate sub-agent.
- **Ingest sub-agent for paste/URL/file** — Phase 4 (AGENT-03). Phase 2's research sub-agent handles the "research the web" path; "ingest a specific URL or paste this transcript" is a Phase 4 capability.
- **Financial-analysis sub-agent** — Phase 4 (AGENT-04, FIN-01..03).
- **Promptfoo eval suite** — Phase 4 (EVAL-02/03/04). Phase 2 ships agent behavior; Phase 4 ships the evals that pin down sub-agent behavior before they multiply. Phase 2 should write integration tests for the coordinator + research sub-agent + recompile round-trip but not yet a Promptfoo suite.
- **Confidence badges in UI inline claims** (UI-05) — Phase 5. D-09's prose framing ("confidence 0.55") is the Phase 2 substitute.
- **Diff-based recompile, scheduled recompile via node-cron, source-added debounced auto-recompile** — Phase 3 (COMP-08, COMP-12, COMP-13). Phase 2's recompile is unconditional (calls `runCompile()` which already short-circuits on hash match per D-18 of Phase 1).
- **Human-edit guard / lint** — Phase 3 (COMP-14).
- **Paired backup of OneBrain DB + vault** — Phase 3 (COMP-15).
- **`qmd` MCP server for wiki search at scale** — Phase 5+ trigger (vault > ~50 pages); ARCHITECTURE.md's "Phase-2 wiki search (qmd)" is mis-numbered relative to this roadmap.
- **Strategic-framework page renderers** (SWOT, STP, 4Ps, Porter's 5 Forces, brand pyramid, positioning statement, voice/tone, JTBD, customer journey, ICP, persona) — Phase 5 (STRAT-01..11).
- **Sub-agent contract for ingest/financial/devil's-advocate** — Phase 4. D-04's Zod-strict pattern is the floor; each sub-agent adds its own typed output schema.
- **Cost tracking per session / per sub-agent** — v2 (OBS-V2-02).
- **Agent decision telemetry / runtime logs beyond pino's standard log lines** — v2 (OBS-V2-01).
- **Chat thread persistence** (saving conversation history to Postgres) — out of scope for Phase 2; the user opens a fresh chat each session. If thread persistence becomes needed, it's a future-phase concern. Intermediate sub-agent steps land in OneBrain rows + `event_log`; that's the durable trail.

</deferred>

---

*Phase: 02-agents-and-chat*
*Context gathered: 2026-04-26*
