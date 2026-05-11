# Strategic Framework meta-structure: registry as code, derivedFrom as data

**Strategic Frameworks** (PESTEL, FiveForces, SWOT, STP, FourPs, FeedbackChannels, …) connect at two layers:

- **Type-level (the Framework Registry, code).** A TypeScript module under `packages/domain/strategic-frameworks/` defines each **Framework Kind**, its slot schema, its canonical upstream/downstream Kinds, and per-slot default research prompts. Adding or removing Kinds is a code change with an ADR. *(Per-slot prompts are deferred per [ADR-0019](0019-per-slot-research-prompts-deferred-registry-stays-runtime-free.md) — the field exists in the schema; content ships empty until Researcher failure modes are observed. Eventual prompt content is constrained: methodology only, no figures/Sources/strategic conclusions.)*
- **Instance-level (`Hypothesis.derivedFrom`, data).** Each **Hypothesis** carries an array of upstream `HypothesisId`s it was inferred from. *Ripple* is computed by graph traversal over these edges. The registry's Kind-to-Kind relationships are *hints* (used for agent planning), not *constraints* on what derivations are allowed.

Vocabulary in [CONTEXT.md](../../CONTEXT.md).

## Considered Options

- **All-data.** Framework definitions live in a Postgres table; users (or the agent) edit them at runtime; per-instance derivation edges in another table.
- **All-code, no derivedFrom.** Framework definitions in code; framework-to-framework connections expressed only via shared hypotheses (no per-hypothesis derivation edges).
- **Two-layer (chosen).** Registry in code, derivation edges as data on the Hypothesis aggregate.

## Why this split

- **Registry as code wins compile-time safety on slot names.** `framework.slots.threats` becomes a typed access, not a string lookup. The planned `local/domain-names-match-context-md` ESLint rule can extend to verify slot names against `CONTEXT.md`. All-data forfeits this.
- **derivedFrom as data captures user-curated reasoning chains the registry cannot.** The user explicitly asked to "show how this specific hypothesis ripples through the strategy." The registry encodes Kind-to-Kind defaults (PESTEL feeds 5 Forces); derivation edges encode the *concrete instances* the user actually drew. Without the data layer, ripple collapses to "any hypothesis in any downstream framework," which is too coarse.
- **Hints, not constraints.** Strategy isn't always linear. A SWOT.threats Hypothesis can legitimately derive from a FeedbackChannels Hypothesis even though the canonical Kind chain runs the other way. The agent uses canonical relationships for default research planning ("you're filling SWOT — start with PESTEL"); it doesn't refuse derivedFrom edges that cross non-canonical Kinds.

## Consequences

- Adding a new **Framework Kind** requires a code change + ADR. This is the desired ceremony — Kind churn is rare and the meta-graph is load-bearing.
- The agent uses the registry to seed "default research order" suggestions when the user starts filling a framework, but doesn't refuse derivations that violate the canonical chain.
- A future "constraint mode" (lint rules forbidding non-canonical derivedFrom edges) is cheap to add later if the hint discipline turns out insufficient. The reverse migration (loosening enforced constraints to hints) is also cheap.
- Single `derivedFrom` edge kind (rather than typed edges like `corroborates / refines / contradicts`) for now. The Hypothesis state machine already handles `contradicted`. Add typed edges in a follow-up ADR if the single-edge model proves insufficient.
