# Phase 2: Agents and Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 02-agents-and-chat
**Mode:** discuss (interactive)
**Areas discussed:** Research sub-agent scope, Coordinator chat behavior, Chat surface UX, Recompile UX

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Research sub-agent scope | How aggressive is research? Stopping criteria, tag/topic suggestion authority, end-to-end shape of one research turn. | ✓ |
| Coordinator chat behavior | Pushback tone (CRIT-01), narration of sub-agent invocations, hypothesis framing, recompile suggestions. | ✓ |
| Chat surface UX | Tool-call trace visibility (UI-03), inline wiki chunks + deeplinks (UI-04). | ✓ |
| Recompile UX | Button placement, status indicator content, post-recompile feedback (UI-06). | ✓ |

**User's choice:** "all" (all four areas selected via multiSelect).

---

## Research sub-agent scope

### Stopping criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Claim cap + time-box (Recommended) | Stop at ~10 claims OR ~120s. Predictable cost; user knows when to expect a reply. | ✓ |
| Page cap + claim cap | Stop after N pages OR M claims. More breadth-shaped; less predictable latency. | |
| Coordinator-driven (user signals depth) | User says "quick research" vs "deep research"; coordinator passes a depth knob. Most flexible; most prompt-engineering risk. | |
| You decide | Claude picks defaults during planning. | |

**User's choice:** Claim cap + time-box (Recommended)

### Tag authority

| Option | Description | Selected |
|--------|-------------|----------|
| Research sub-agent suggests, coordinator approves (Recommended) | Sub-agent emits proposed tags; coordinator validates against canonicalizeTag. Anti-rogue-tag preserved. | ✓ |
| Research sub-agent decides outright | Tags written directly by sub-agent. Simpler; risks tag drift. | |
| Coordinator post-hoc | Sub-agent writes untagged claims; coordinator tags later. Adds latency + a second LLM call. | |
| You decide | | |

**User's choice:** Research sub-agent suggests, coordinator approves (Recommended)

### Tavily depth

| Option | Description | Selected |
|--------|-------------|----------|
| Search + extract on top-K hits (Recommended) | Default; crawl reserved for explicit "deep research" signal. Bounded cost. | ✓ |
| Search only | Cheapest; lowest extraction quality. | |
| Full search + extract + crawl on top hit | Most thorough; highest cost. | |
| You decide | | |

**User's choice:** Search + extract on top-K hits (Recommended)

### Output contract

| Option | Description | Selected |
|--------|-------------|----------|
| Strict Zod schema, reject malformed (Recommended) | SDK outputSchema + retry-once-then-error. Sets discipline floor for Phase 4 sub-agents. | ✓ |
| Strict Zod, but auto-repair on first failure | Coordinator gets a repair retry before failure. More forgiving; risks masking output drift. | |
| Best-effort parse, log warnings | Most lenient; not recommended given provenance commitments. | |
| You decide | | |

**User's choice:** Strict Zod schema, reject malformed (Recommended)

**Notes:** All four research-area answers were the recommended option; combination locks the discipline floor (Pitfall 18 + Pitfall 19 prevention) at the strictest credible setting and sets the pattern Phase 4's additional sub-agents inherit.

---

## Coordinator chat behavior

### Pushback tone (CRIT-01 + AGENT-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Direct + cites the gap (Recommended) | Template: "That's a TAM-shaped/≥$1M number with no source — logging as hypothesis 0.3 unless you give me a source, or want me to research it." | ✓ |
| Socratic question | "What's the source for that?" Softer; risks Pitfall 16 pushback theater. | |
| Hard veto on ≥$1M / TAM-shaped | Refuse to record. Strict; can frustrate idea-capture flow. | |
| You decide | | |

**User's choice:** Direct + cites the gap (Recommended)

### Sub-agent narration

| Option | Description | Selected |
|--------|-------------|----------|
| Brief intent line + tool trace (Recommended) | One-line "Researching X…" prose + collapsible tool trace below. Two-channel transparency. | ✓ |
| Silent invocation, trace only | No prose; tool trace is the only signal. Less ambient awareness. | |
| Verbose narration | Coordinator prose-summarizes each step. Risks Pitfall 18 prose-leakage. | |
| You decide | | |

**User's choice:** Brief intent line + tool trace (Recommended)

### Hypothesis framing

| Option | Description | Selected |
|--------|-------------|----------|
| Prose framing + claim ID (Recommended) | "One hypothesis we have — confidence 0.55 — is that customers will accept $99/mo. [[claim:01J9X…]]" Conversational; mirrors CLAUDE.md identity. | ✓ |
| [hypothesis] prefix only | "[hypothesis 0.55] Customers will accept $99/mo." Compact; less natural. | |
| Confidence as separate sentence | Structured; not foregrounded. | |
| You decide | | |

**User's choice:** Prose framing + claim ID (Recommended)

### Recompile suggestion

| Option | Description | Selected |
|--------|-------------|----------|
| After research turns that wrote claims (Recommended) | Coordinator nudges "Recompile to refresh the wiki?" only on turns that wrote claims. | ✓ |
| Never — user's call | Pure user-initiated. Cleanest separation; user has to remember. | |
| Always — every turn ends with state | "12 claims unwritten to vault" footer always. Most explicit; clutter. | |
| You decide | | |

**User's choice:** After research turns that wrote claims (Recommended)

**Notes:** The bundle of choices defines a coherent personality: critical but not refusing, transparent in two channels, hypothesis-first in chat, gentle nudge to recompile rather than auto-side-effect.

---

## Chat surface UX

### Tool-trace default state

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed with one-line summary (Recommended) | "▸ 7 tool calls (research, 3 tavily_extract, 4 onebrain_write_claim)" — click to expand. | ✓ |
| Expanded by default | Maximum transparency; clutters chat after a few turns. | |
| Hidden behind per-message toggle | Cleanest chat; one extra click to inspect. | |
| You decide | | |

**User's choice:** Collapsed with one-line summary (Recommended)

### Tool-trace granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Tool name + args summary + result count (Recommended) | "tavily_extract(url=…/pricing) → 4823 chars" / "onebrain_write_claim(text=… 50-char preview …) → claim:01J9X…". Compact + verifiable. | ✓ |
| Sub-agent boundaries only | Coarsest; loses URL-level visibility. | |
| Full args + full results | Maximum debug; slow + leaks long extracts. | |
| You decide | | |

**User's choice:** Tool name + args summary + result count (Recommended)

### Wiki chunk surfacing trigger (UI-04)

| Option | Description | Selected |
|--------|-------------|----------|
| When user asks about a topic with an existing page (Recommended) | Coordinator classifies the question; surfaces excerpt above prose answer when a page exists. Wiki = synthesis cache; OneBrain = truth. | ✓ |
| Coordinator's discretion | Most adaptive; least predictable. | |
| Only when user explicitly asks "show me the wiki page" | Conservative; risks wiki losing synthesis value in chat. | |
| You decide | | |

**User's choice:** When user asks about a topic with an existing page (Recommended)

### Wiki chunk format + deeplink

| Option | Description | Selected |
|--------|-------------|----------|
| Excerpt (~200 words) + obsidian:// deeplink (Recommended) | Markdown excerpt + "Open in Obsidian →" via obsidian://open URL scheme. Fallback: copy-path button. | ✓ |
| Title + first paragraph + relative path | Simpler; loses in-context excerpt. | |
| Full page inline, scrollable | Maximum context; chat-eats-screen. | |
| You decide | | |

**User's choice:** Excerpt (~200 words) + obsidian:// deeplink (Recommended)

**Notes:** Chat surface tuned for "see what's happening" without "drown in trace data." The wiki chunks are the synthesis-as-cache pattern from ARCHITECTURE.md; the obsidian:// scheme is the correct native primitive.

---

## Recompile UX

### Button placement

| Option | Description | Selected |
|--------|-------------|----------|
| Header bar above chat (Recommended) | Button + status pill in app shell header. Always visible; doesn't compete with composer. Standard assistant-ui pattern. | ✓ |
| In the chat composer toolbar | Closer to action; risks accidental clicks. | |
| Settings/sidebar panel | Cleanest header; one extra click. | |
| Slash command only | Minimal; loses always-on indicator. | |

**User's choice:** Header bar above chat (Recommended) — slash command `/recompile` is also wired per the workflow (D-15 in CONTEXT.md), but the button is the primary path.

### Idle status content

| Option | Description | Selected |
|--------|-------------|----------|
| Last compiled time + dirty count (Recommended) | "Last compiled: 14:32 • 3 claims unwritten to vault" — connects writes to vault freshness. | ✓ |
| Last compiled time only | Simpler; loses dirty-state awareness. | |
| Just a "Recompile" button + faint timestamp | Minimal; loses the "wiki is N claims behind" signal. | |
| You decide | | |

**User's choice:** Last compiled time + dirty count (Recommended)

### In-flight status

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner + page-by-page progress (Recommended) | "⟿ Compiling… 1 of 1 page (topics/strategic-positioning.md)" — bounded by Phase 1's one-page shape; scales cleanly to Phase 3+. | ✓ |
| Spinner only | Simpler; less informative. | |
| Disabled button + system message in chat | Good for slow compiles; cluttered for fast ones. | |
| You decide | | |

**User's choice:** Spinner + page-by-page progress (Recommended)

### Post-recompile feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Inline system message + status indicator update (Recommended) | "Recompiled: 1 page written, 0 skipped (run 01J9X…)." Status pill flips to "now." Closes loop where user is looking. | ✓ |
| Status indicator only, no chat message | Cleaner chat; user has to glance. | |
| Toast notification, then fade | Standard web pattern; less discoverable on async glance-back. | |
| You decide | | |

**User's choice:** Inline system message + status indicator update (Recommended)

**Notes:** The recompile UX is the closure for an action that lives in the chat surface. Header pill = always-visible state; chat system message = action-completed signal. User explicitly wants to know "did the wiki update" without leaving chat.

---

## Claude's Discretion

The locked decisions left specific implementation latitude that the planner / executor will resolve. Captured in CONTEXT.md `<decisions>` § "Claude's Discretion":

- CLAUDE.md authoring (exact prose, push-back templates)
- Hono route shapes (`POST /chat`, `POST /recompile`, `GET /health`)
- assistant-ui component composition + runtime configuration
- Hybrid search ranking (DATA-09) — RRF vs weighted-sum vs filter-then-vector
- Compilation sub-agent shape (thin SDK wrapper around `runCompile()`)
- Vault deeplink config (vault name; fallback when scheme unregistered)
- Tool-trace expanded view styling
- Streaming chunk granularity in the UI (token-level via Vercel AI SDK 6 transport)
- Sub-agent retry behavior on Tavily failure
- SSE disconnect mid-stream rendering

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`. Highlights:

- "Deep research" depth knob — Phase 4 if it becomes a real need
- Devil's-advocate / ingest / financial sub-agents — Phase 4
- Promptfoo eval suite — Phase 4
- Confidence badges in UI inline claims (UI-05) — Phase 5
- Diff-based / scheduled / debounced recompile, edit-guard, paired backup — Phase 3
- qmd MCP server — Phase 5+ trigger
- Strategic-framework renderers (STRAT-01..11) — Phase 5
- Cost tracking, telemetry — v2
- Chat thread persistence — out of scope for Phase 2 (intermediate steps land in OneBrain rows + event_log; that's the durable trail)

---

## Areas explicitly *not* explored

When asked at the close-out, the user chose "I'm ready for context" rather than opening additional gray areas. Things that were on the table but not pulled on:

- **Hybrid search shape (DATA-09)** — ranking strategy, tag filter UX, result mix. Treated as a planner-level engineering decision.
- **Compilation sub-agent shape** — SDK tool-gate around `runCompile()` vs reimplementation. Captured as Claude's Discretion in CONTEXT.md.
- **Error / failure modes** — Tavily down, SSE disconnect, vault file locked by Obsidian. Captured as Claude's Discretion.
- **Hono route surface and `/health` shape** — captured as Claude's Discretion.
- **Compilation agent in Phase 2: thin SDK wrapper or different shape** — captured as Claude's Discretion.

These are not gaps; they are decisions the user is happy to delegate to research and planning given the locked architectural commitments.
