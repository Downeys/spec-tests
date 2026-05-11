# Hypothesis-centric model with three-layer evidence stack

A business strategy is modelled as a web of interconnected **Strategic Frameworks** populated by **Hypotheses** (testable strategic propositions, with a typed state machine), each supported by **Claims** (directly-cited factual statements) which in turn cite **Sources**. The "Business Plan" is a render-time projection over the framework web, not an editable aggregate. Vocabulary canonicalised in [CONTEXT.md](../../CONTEXT.md).

## Considered Options

- **Plan-centric.** `BusinessPlan` is the central editable aggregate, with sections users author freely; research, hypotheses, and citations are infrastructure that supports plan claims after the fact. This is the obvious shape for a "business plan tool."
- **Hypothesis-centric (chosen).** `Hypothesis` is the central aggregate. The Business Plan is a derived projection. Users edit Strategic Frameworks; the plan renders from them.
- **Single-layer evidence (Claim with state machine).** Collapse `Claim` and `Hypothesis` into one concept — a Claim with a `tested-supports / refutes / contradicted` state field plus citations. Simpler model, fewer aggregates.
- **Three-layer evidence (chosen).** Source / Claim / Hypothesis as separate aggregate roots. A Hypothesis is supported by Claims; each Claim has its own Citations to Sources.

## Why hypothesis-centric over plan-centric

- **Single source of truth.** OpenBrain is already the source of truth, with the wiki as a derived projection ([memory-architecture.md](../principles/memory-architecture.md)). Adding an editable Business Plan would create a *third* store that can drift from OpenBrain — exactly the failure mode the wiki rule already forbids. Treating the plan as a projection keeps the rule consistent.
- **Structural "be critical" posture.** Every framework slot must be a Hypothesis backed by Claims. Free-form prose cannot shortcut citation. Plan-centric would let users author plan sections that aren't backed by tested hypotheses, forcing the agent to retrofit citations after the fact.
- **Agent-never-invents enforcement.** In the plan-centric design the agent has to "write convincingly" when drafting a section. In the hypothesis-centric design the agent drafts a section by *querying* the projection — it can't write what isn't already cited.

## Why three-layer over single-layer

- A directly-cited factual claim ("Gartner 2024 survey: 47% of B2B buyers eval 5+ vendors") is a different kind of object than a strategic proposition under test ("Buyer power is HIGH in our target market"). Conflating them muddies what the agent's job is at any given moment — verify a citation, or test a hypothesis?
- The same Claim can support or refute multiple Hypotheses without duplication.
- The state machine on Hypothesis cleanly separates "this proposition is being tested" (lifecycle) from "this fact is currently cited" (data integrity). Each layer has a distinct invariant.

## Consequences

- The runtime agent must reframe directly-verifiable facts as testable propositions when a user wants to slot them into a Strategic Framework — every slot is a Hypothesis, not a Claim. The example dialogue in [CONTEXT.md](../../CONTEXT.md) captures the friction: "we have 3 published researchers" becomes the Hypothesis "the team has the credentials to execute," supported by Claims about LinkedIn profiles and publications.
- Render-side (Business Plan generation) is mostly mechanical — once the projection exists, more "documents" (investor memo, marketing one-pager, internal strategy doc) are cheap to add as additional projection types over the same framework web.
- The agent's UI flow for "add a strength to my SWOT" is multi-step: prompt for the Hypothesis, generate Claims via research, transition the state machine, then slot. Single-click "type a bullet into SWOT" does not exist by design.
