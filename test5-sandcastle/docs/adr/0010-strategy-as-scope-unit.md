# Strategy as scope unit; one repo = one business

A **Strategy** is the scope unit for all strategy-laden aggregates (**Hypothesis**, **Strategic Framework**, **Business Plan**, **Marketing Plan**, **Financial Projection**, **Critic Attempt**, **Objection**). Evidence aggregates (**Source**, **Claim**, **Citation**) are *not* Strategy-scoped — they are global to the OpenBrain instance and reusable across Strategies. One repo clone / one OpenBrain instance hosts one business; multiple Strategies live within it. Switching businesses is done by cloning the repo with an empty wiki and database — no in-product "business" concept above Strategy.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Onion-layer placement of `StrategyId` in [architecture.md](../principles/architecture.md). Wiki digest scoping consequence in [memory-architecture.md](../principles/memory-architecture.md) and [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md).

## Considered Options

- **A — Single-workspace.** One OpenBrain database = one business under analysis. Pivots modelled via a new `Hypothesis` state (`invalidated-by-pivot`) and the user re-creates frameworks inside the same pool. Simplest schema (no scoping column anywhere).
- **B — Strategy as scope, evidence shared (chosen).** **Source / Claim / Citation** global to the OpenBrain instance; **Hypothesis / Strategic Framework / Business Plan / Marketing Plan / Financial Projection / Critic Attempt / Objection** scoped to a `StrategyId`.
- **C — Strategy as a tag, not a scope.** Hypotheses carry a `Set<StrategyTag>` instead of a single owning Strategy. No structural separation. Maximally flexible, no clear "active strategy" semantics.

## Why B over A and C

- **A burns evidence reuse.** A Gartner statistic is true regardless of which Strategy is testing it. Single-workspace forces the user to either re-cite it in a fresh state or carry stale Strategic Frameworks alongside fresh ones with no structural way to mark "this PESTEL is the old strategy." That collapses the audit trail.
- **A also collapses the Critic flow** for cross-Strategy work. Critic challenging "buyer power is HIGH" under the enterprise pivot needs a different Claim ledger than the same Hypothesis text under the SMB strategy. Single pool → either Critic sees both ledgers and the strategy meaning is muddied, or every Hypothesis gets duplicated per-Strategy and we have effectively re-invented B with worse ergonomics.
- **C makes the "ripple" semantics genuinely complex.** A Hypothesis tagged in two Strategies, transitioning to `tested-refutes`, ripples through *which* Strategy's Critic queues? B answers this trivially: ripples never cross Strategy boundaries because Hypotheses don't.
- **B lines up with the existing cleavage in the model.** Sources/Claims/Citations are already framed as universally-true facts. Hypotheses are already framed as "*our* market" propositions. Putting `StrategyId` on the strategy-laden aggregates and not on the evidence aggregates is the schema reading of a distinction the domain language already makes.

## Strategy creation, identity, and switching

- **Implicit default Strategy.** First Hypothesis the user creates auto-creates a Strategy named `default`. No onboarding form, no "name your strategy" friction. The user renames it when they create their second one.
- **Single active Strategy per chat session.** The Coordinator pins one `activeStrategyId` in conversation memory. Researcher / Critic / Cartographer all read and write that Strategy. Sub-agents do not take a `StrategyId` parameter; they read it from session state.
- **Switching is a deliberate chat command.** `/strategy switch <name>` resets conversation memory's `activeStrategyId`. Mid-conversation switching is friction by design — strategic thinking is one-frame-at-a-time, and the friction stops the user from accidentally writing one Strategy's Hypothesis into another's.
- **Cross-Strategy comparison is render-only.** A Renderer mode that pulls the projection logic over two or more Strategies side-by-side. It can't write. It is the only legitimate way to see two Strategies in one frame.

## Why not "business" as a concept above Strategy

The product is personal-use, single-operator. The user reasonably has *one* business under active analysis at a time. Modelling "business" as a first-class scope above Strategy adds a `BusinessId` to every aggregate to support a use case the user has explicitly opted out of (their stated workflow: clone the repo with empty wiki/db to switch businesses). The repo boundary *is* the business boundary — keeping the schema simpler is worth losing the in-product multi-business case.

## Consequences

- **`StrategyId` on every strategy-laden aggregate.** Branded type. Indexed in OpenBrain. Required at construction. Domain-layer invariant: aggregates cannot reference each other across Strategies (a Strategic Framework's slot Hypothesis must share its `StrategyId`).
- **Evidence aggregates are decoupled.** No `StrategyId` on Source / Claim / Citation. A Citation joining a Claim to a Hypothesis crosses the boundary — the Claim is global, the Hypothesis is Strategy-scoped, the Citation joins them.
- **Vector retrieval over Claims is global.** pgvector queries on Claims do not filter by Strategy. Vector queries that involve Hypotheses (e.g. "find similar Hypotheses") *do* filter by Strategy by default, with an explicit cross-Strategy mode for the Renderer's comparison view.
- **The wiki is per-Strategy at the top level.** `wiki/strategies/<strategy-slug>/...` mirrors the structure. Evidence pages under `wiki/sources/`, `wiki/claims/` are global. The "wiki is N events behind" badge in [ADR-0006](0006-wiki-commit-policy.md) applies per-Strategy independently.
- **Ripple stays in-Strategy.** Derivation Edges cannot cross Strategies (enforced at the aggregate construction). The "ripple when an upstream Hypothesis changes" graph traversal is scoped to a single Strategy by construction.
- **`/strategy` chat commands** are a small set: `list`, `switch`, `create`, `rename`. No `delete` — Strategies are append-only at the aggregate level (matches the OpenBrain append-only principle). An `archived: boolean` flag hides one from the default `list` without losing it.
- **Switching businesses is an ops procedure**, not a product feature. Documented in operator notes: clone repo, drop OpenBrain DB, blank the wiki, restart.
