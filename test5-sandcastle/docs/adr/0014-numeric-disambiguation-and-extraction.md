# Numeric extraction discipline: one value per Citation; escalate disambiguation; Critic challenges interpretation

The "LLM never computes" line in [ADR-0007](0007-llm-never-computes-derived-figures.md) is sharpened from two categories (extract / compute) to three (extract / interpret / compute). **Extraction** stays an LLM job. **Computation** stays forbidden in LLM calls. **Interpretation** — picking which of multiple candidate numbers in a Source applies to which **Quantitative Hypothesis** — is escalated by the Researcher to the user, never silently resolved.

Three structural decisions enforce this:

1. **One extracted numeric value per Citation.** `Citation.extractedValue` is a single value, not a list. Multi-number Sources produce multiple Citations.
2. **Researcher emits `DisambiguationRequired` instead of silently picking.** When a Source has multiple candidate numbers for a Hypothesis slot, the Researcher returns an artifact for the Coordinator to surface; the user picks; only then does a Claim get written.
3. **Critic's prompt explicitly covers interpretation, not just transcription.** The Critic challenges *whether the chosen number is the right driver for this Hypothesis*, not only whether the citation is faithful to the source.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Sharpens [ADR-0007](0007-llm-never-computes-derived-figures.md). Composes with [ADR-0003](0003-agent-topology.md) (Researcher and Critic roles, sub-agent artifact pattern) and [ADR-0008](0008-source-ingestion-two-tier.md) (Source ingestion lifecycle).

## The third category

Real Source content rarely contains exactly one number relevant to a Quantitative Hypothesis. Common shapes:

- **Multiple time-keyed values.** Gartner: "$14.2B in 2023, up from $11.8B in 2022. Forecasts $19.1B by 2027 (CAGR ~7.6%)." For `marketSize`, four candidate numbers exist; only one is the right driver and that depends on whether the Hypothesis means "current TAM" or "5-year TAM."
- **Scope ambiguity.** Source: "47% of buyers." Of all buyers? US buyers? Buyers in a specific vertical? The Researcher must infer from surrounding text — and a wrong-scope inference produces a wrong-scope Quantitative Hypothesis presented as the right one.
- **Source-derived figures alongside primary figures.** "(CAGR ~7.6%)" in the Gartner quote is itself a derived figure. Citing it directly as `marketGrowthRate = 7.6%/yr` consumes Gartner's arithmetic — fine — but the Researcher has to recognize the dependency on the underlying numbers, not treat it as an independent claim.

None of these are NLP. None are arithmetic. They are **strategic interpretation** — which is exactly what the user (with the Critic's help) is supposed to be doing. Letting the Researcher silently pick collapses the user's strategic posture into the LLM's heuristic guess.

## Decision 1 — One extracted value per Citation (structural)

`Citation.extractedValue` is a single `{ value: number, unit: string, basis: string }`, never a list. The `quote` field that the Citation pins to the Source must contain exactly one number that matches `extractedValue.value`. The `basis` field carries the user-confirmed interpretation (e.g. `"2023 actual"`, `"2027 forecast"`, `"all-buyers, US-only"`).

Multi-number Sources produce multiple Citations:

- One Citation per relevant number.
- Each Citation has its own `extractedValue` and its own (possibly overlapping) `quote`/`span`.
- Each Citation can back a different Quantitative Hypothesis (e.g. `marketSize2023`, `marketSize2027`) or the same Hypothesis along with disambiguation context (e.g. multiple Citations all backing `marketSize` with different `basis` values, where `basis` distinguishes their interpretations).

### Considered Options

- **A — One Citation per number (chosen).** Structural rule.
- **B — One Citation can carry multiple `extractedValue`s.** Citation has `extractedValues: ExtractedValue[]`. Cleaner if one quote naturally contains several relevant figures.
- **C — `extractedValue` is free-text and the Researcher infers structure on read.** No structural enforcement; defer interpretation to read time.

### Why A over B and C

- **A makes the Citation the unit of disambiguated interpretation.** Each Citation has a clear `basis` field; the audit reader sees exactly which interpretation is being cited where. B muddies the audit because a Citation with three `extractedValue`s now needs per-value `basis`, per-value `confidence`, per-value `status` — at which point each is functionally its own Citation anyway, with extra schema.
- **C destroys query-ability.** "Which Citations cite a 2023 actual TAM number?" requires structured fields. Inferring on read makes that query impossible without re-parsing every Citation.
- **The `quote` overlap cost is small.** When two Citations share a quote because two numbers live in the same sentence, both Citations point to the same `span` (or overlapping spans). Storage cost is trivial; the audit clarity is worth it.

## Decision 2 — Researcher escalates disambiguation rather than silently picks

When the Researcher detects multiple candidate numbers in a Source for a Quantitative Hypothesis slot, it does **not** write a Claim with a silently-picked value. Instead, it emits a `DisambiguationRequired` artifact and returns to the Coordinator. The artifact carries:

- The Source ID and content excerpt
- The candidate numbers (each with surrounding context)
- The target Hypothesis ID and current proposition
- The Researcher's *suggested* pick (with reasoning) — the user can accept it, but the user has to *accept* it, not just absorb it

The Coordinator surfaces this as a chat turn ("Source has 2023 actual $14.2B and 2027 forecast $19.1B for `marketSize` — which is the relevant figure?"). The user picks. Only after the user picks does the Claim + Citation get written, with the user's choice recorded in `Citation.extractedValue.basis`.

### Why escalate rather than pick-and-let-Critic-challenge

- **The Critic runs on Hypothesis state-machine transitions, not on Claim creation.** A wrongly-picked Claim sits in the supporting set possibly for hours/days/forever before Critic ever runs. Pre-state-transition, the user could already be reading and reasoning over the wrong number. Escalation prevents the wrong-number-in-the-system state from existing in the first place.
- **`DisambiguationRequired` is structurally analogous to `CriticAttempt`.** Both are "sub-agent flags a judgment call but doesn't unilaterally resolve it." Same artifact pattern, consistent posture across the agent topology.
- **The user's interpretation is the load-bearing strategic input.** "We care about current TAM, not 5-year forecast" is the kind of decision the spec wants the user driving. The system asking is the right friction.

### Cost: more chat-turn interruptions during research

Mitigation: the Researcher escalates only when the candidate numbers are *materially different in interpretation* (different time bases, different scopes, different derivation). When candidate numbers are mere precision restatements ("$14.2B" vs "$14,200,000,000"), the Researcher picks deterministically (most-precise wins). The Researcher's escalation prompt has explicit examples of "must escalate" vs "may pick" categories.

## Decision 3 — Critic's prompt covers interpretation, not just transcription

The Critic's system prompt is updated to explicitly include "challenge the *meaning* of the extracted value, not only whether it is faithfully transcribed from the source." This makes the case where the Researcher's pick survived disambiguation still rigorous — the Critic gets a second pass to ask "is this even the right number?"

Concretely, the Critic Attempt's `evidenceSnapshot` already covers `claimIds` and `derivedFromStates` (per [ADR-0012](0012-ripple-semantics-and-domain-events.md)). For Quantitative Hypotheses, the Critic prompt instructs the Critic to evaluate each supporting Claim's `Citation.extractedValue.basis` against the Hypothesis's stated proposition — flagging mismatches as Objections.

## Consequences

- **`Citation` schema gains `extractedValue`** (optional; null for citations supporting non-numeric Claims). Single value, not a list.
- **`DisambiguationRequired` artifact** becomes a first-class Application-layer concept. Lives next to `CriticAttempt` in the artifact hierarchy. Implementation issue tracked separately.
- **Researcher prompt** carries explicit must-escalate / may-pick rules with examples.
- **Critic prompt** includes interpretation-challenging language for Quantitative Hypotheses, separate from the transcription-faithfulness check.
- **The "extraction is NLP, allowed" rule from [ADR-0007](0007-llm-never-computes-derived-figures.md)** is preserved exactly — extraction in the narrow sense (single-number, unambiguous source context) remains an LLM job. The new rule covers what was implicit slop in the old framing.
- **Existing CONTEXT.md flagged-ambiguity entry** is updated to three categories.
