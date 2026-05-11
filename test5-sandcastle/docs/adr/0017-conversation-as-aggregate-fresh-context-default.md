# Conversation as audit-grade aggregate; fresh-chat-by-default; in-flight artifacts surface on reopen

**Conversations** between the user and the Coordinator are persisted as a strategy-scoped aggregate in OpenBrain. They are audit-grade evidence of how the strategy got built, queryable on demand. **They are never auto-loaded into a fresh chat's working context.** The carve-out: open in-flight artifacts (currently **Disambiguation Required** with `status: 'awaiting-user'`) are surfaced on session reopen because the system is waiting on a user answer to make progress.

`activeStrategyId` lives in a runtime config file, not in OpenBrain. It is runtime preference, not domain state.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Composes with [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md) (OpenBrain as RAG, no auto-load), [ADR-0010](0010-strategy-as-scope-unit.md) (Strategy scoping, single-active-Strategy per session), [ADR-0014](0014-numeric-disambiguation-and-extraction.md) (DisambiguationRequired flow), and the [context-budget.md](../principles/context-budget.md) 100k-target rule.

## Three decisions

### 1. Conversation is a Strategy-scoped aggregate in OpenBrain

`Conversation { id, strategyId, startedAt, endedAt | null, turns: ConversationTurn[] }`. One Conversation aggregate per chat session. Append-only at the turn level. New session opens a new Conversation; user closing the chat sets `endedAt`. The active Strategy at session start is recorded as `strategyId` and is fixed for the Conversation's lifetime — `/strategy switch` mid-session ends the current Conversation and begins a new one (matches [ADR-0010](0010-strategy-as-scope-unit.md)'s "switching is a deliberate command that resets memory").

**`ConversationTurn` is the user↔Coordinator exchange only — not the Coordinator's internal sub-agent calls.** A turn captures the user's message and the Coordinator's user-facing response. The internal trace (prompt sent to a sub-agent, sub-agent's full LLM response, search-tool results read by the Researcher, candidate Claims the Researcher considered and rejected) is **ephemeral and not persisted**. The structured artifacts each sub-agent produces — `Claim`, `Citation`, `CriticAttempt` (including its `objections` and `criticPromptVersion`), slot assignments, `derivedFrom` edges — carry the effects forward, and the Coordinator's user-facing summary in the Conversation carries the narrative. The deliberate gap between those is sub-agent internals that didn't make it into either; recovering them ("what the Critic almost said but didn't surface") is a thin use case for real storage cost. If that judgment ever flips, it's a superseding ADR.

#### Considered Options

- **A — Transcript not persisted.** Every session is ephemeral. Loses the audit-grade record of how decisions were made.
- **B — Transcript persisted as Conversation aggregate in OpenBrain (chosen).** Audit-grade. Queryable. Append-only. Same architectural posture as Hypothesis, Claim, Citation.
- **C — Transcript in a separate runtime store (SQLite, filesystem log).** Survives restart but lives outside the audit-grade boundary.

#### Why B over A and C

- **Conversations _are_ evidence.** A user re-reading "why did I conclude buyer power was HIGH?" is well-served by being able to load the dialogue around that decision the same way they load the cited Claims and CriticAttempts. The transcript is part of how the strategy got built.
- **A loses this evidence permanently.** No good reason to throw it away when the storage cost is small.
- **C splits the audit surface in two.** The OpenBrain principle (per [memory-architecture.md](../principles/memory-architecture.md)) is that OpenBrain is the source of truth, append-only, audit-grade. Putting the transcript in a separate runtime store creates a second canonical store with weaker guarantees. The wiki is allowed to be a derived projection of OpenBrain (per [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md)) precisely because OpenBrain is one source of truth — adding a third store fragments that.

### 2. Conversations are NEVER auto-loaded into a fresh chat's context

The Coordinator's startup sequence on a fresh chat is:

1. Read `activeStrategyId` from the runtime config file.
2. Load any **Disambiguation Required** artifacts with `status: 'awaiting-user'` for the active Strategy. If any exist, surface them to the user as the first turn of the new Conversation.
3. Prompt the user normally — _with no prior Conversation content seeded into context_.

When the user explicitly asks ("what did we discuss about marketSize last week?", "find the conversation where we resolved the regulation question"), the Coordinator uses an explicit `searchConversationHistory(query, strategyId)` tool that retrieves matching Conversation turns from OpenBrain. The retrieved content enters context only via that explicit call.

#### Why fresh-by-default

- **The user explicitly carved this out:** "I don't want previous conversations to muddy up every context. When we open a fresh chat, the expectation is we have a fresh context."
- **Auto-loading conversation history burns context budget on irrelevant material.** Per [context-budget.md](../principles/context-budget.md) the agent runs against a 100k target / 150k ceiling. Auto-seeding even a week of dialogue blows the target on content the user did not ask for.
- **It extends the [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md) posture cleanly.** OpenBrain is the RAG, retrieved by sub-agents on demand. Conversations live in OpenBrain by the same logic — retrieved on demand, not preloaded.
- **It matches the human experience of strategic conversation.** A user opening a fresh chat is in "fresh thinking" mode; auto-loading prior dialogue forces them back into yesterday's mental frame. Forcing explicit retrieval keeps the user in control of which historical material is relevant.

### 3. In-flight artifacts surface on reopen — narrowly

The carve-out: anything in OpenBrain whose `status` is "awaiting user action" gets surfaced on session reopen. Currently this is exactly **Disambiguation Required** with `status: 'awaiting-user'`. Future "awaiting user" artifacts (e.g. a hypothetical `ResearchRequest` flagged by the Critic for the user to schedule) would slot into the same surface-on-reopen pattern.

The line: **resolved transcript** (don't auto-load) vs **pending action** (do surface). The Coordinator can make progress without resolved transcript; it cannot make progress without resolution of pending-action artifacts. Surfacing the latter is operational, not optional.

#### What does NOT get surfaced on reopen

- Past Conversation turns (per Decision 2).
- Hypotheses with `staleSince` flags (per [ADR-0012](0012-ripple-semantics-and-domain-events.md)) — these are wiki badges, not pending-action items. The user notices them when they navigate to the affected Hypothesis; the Coordinator does not pre-announce them.
- Critic Attempts that would benefit from re-running — these are nudges, not blockers.
- Anything else where the user reopening doesn't _have to_ deal with it before continuing.

The bar for "surface on reopen" is high: only artifacts whose `status` literally encodes "we cannot make forward progress on the related strategy work without your decision."

### 4. `activeStrategyId` lives in a runtime config file, not OpenBrain

Stored at `~/.config/bp-agent/runtime.json` (or analogous platform path) as `{ activeStrategyId: "<strategy-slug>" }`. Read on Coordinator startup, written on `/strategy switch`. Survives process restart trivially. Single-operator, no concurrency concerns. The `bp-agent` namespace is a placeholder for the product per [ADR-0020](0020-product-namespace-separate-from-sandcastle-wrapper.md) — _not_ `sandcastle`, which is the issue-draining wrapper that runs this product's tasks.

#### Considered Options

- **A — Runtime config file (chosen).** Outside OpenBrain. Survives restart. Editable by the user if they want to.
- **B — `RuntimeState` aggregate in OpenBrain.** Adds a tiny aggregate that has nothing to do with domain modelling.
- **C — Anthropic Agent SDK session memory.** Lock-in for trivial gain; SDK session may not survive process restart anyway.

#### Why A

- **`activeStrategyId` is not domain state.** It's a runtime preference about _which Strategy the next chat-input applies to_. Putting it in OpenBrain (B) muddies the domain/runtime boundary that the architecture already maintains carefully (per [architecture.md](../principles/architecture.md)).
- **A is the simplest thing that survives restart**, and small enough that the user can hand-edit it if they need to (e.g. recovering after a misconfigured deploy).
- **C is SDK lock-in** for a 50-byte file. The agent topology decision in [ADR-0004](0004-anthropic-agent-sdk.md) accepts SDK lock-in for the agent runtime, not for runtime preferences that have no SDK-specific value.

## Consequences

- **`Conversation` aggregate** is added to the strategy-laden aggregate list. Joins Hypothesis / Strategic Framework / Business Plan / Marketing Plan / Financial Projection / Critic Attempt / Objection / Disambiguation Required.
- **`Disambiguation Required` aggregate** (defined in [ADR-0014](0014-numeric-disambiguation-and-extraction.md)) is now persistent and append-only with `status` field. Resolved/cancelled artifacts remain for audit.
- **`searchConversationHistory(query, strategyId)`** is a Coordinator tool, not an auto-load. Backed by pgvector embeddings over Conversation turns, scoped to the active Strategy by default.
- **The wiki digest of a Strategy** can summarize Conversations alongside Hypotheses ("on 2026-05-08 the Coordinator and the user discussed marketSize; resolution: $14.2B 2023 actual"). Wiki rendering rule for Conversations lives in a follow-up issue, not this ADR.
- **`activeStrategyId` config file** is gitignored (it's a personal runtime preference, not project config). A new clone of the repo starts with no config file; the first `/strategy create` writes it.
- **Coordinator startup ordering** is fixed: read config → load awaiting-user artifacts → prompt user. No deviation; the load-awaiting-user step is pre-context-window.
- **The fresh-context posture extends to future "should we auto-load X" decisions.** Default to no unless an artifact has narrow operational status that requires user resolution. Log captured in agent's persistent memory.
