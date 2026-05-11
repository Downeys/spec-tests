# Per-slot research prompts deferred; Framework Registry stays free of runtime domain content

**Per-slot default research prompts** (referenced as a Framework Registry responsibility in [ADR-0002](0002-framework-registry.md) and in [CONTEXT.md](../../CONTEXT.md)'s Framework Registry entry) are **deferred** — the Registry ships with no per-slot prompt content until the Researcher's actual failure modes are observed in use. **Constraint that survives the deferral:** when prompts are eventually added, they **must contain no domain math, no figures, no Source-specific instructions, and no business-strategic content** — only methodological guidance about what *competent research on this slot looks like in general*. The Registry remains static, code-defined, and free of runtime domain content per [ADR-0002](0002-framework-registry.md).

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Composes with [ADR-0002](0002-framework-registry.md) (Registry as code), [ADR-0007](0007-llm-never-computes-derived-figures.md) (LLM never computes derived figures — and by symmetry, the Registry never seeds figures), and [memory-architecture.md](../principles/memory-architecture.md) (agent-never-invents posture).

## Considered Options

- **A — Skeletal prompts now.** One-sentence-per-slot, naming the angle. Cheap to write but variable Researcher quality on first pass.
- **B — Methodology-shaped prompts now.** Each slot's prompt structurally guides the Researcher toward testable Hypotheses with specific Citation patterns, encoding the "be critical of every finding" posture at the slot level. Higher first-pass quality; substantial registry surface to maintain; designs against unobserved failure modes.
- **C — Defer; ship empty defaults; iterate on prompts after seeing what the Researcher actually does.** Same logic that justified deferring the confidence formula in [ADR-0018](0018-confidence-decomposed-display-no-stored-scalar.md): the prompt format is reversible at low cost, and designing the shape before observing failures is premature optimization.
- **C-with-constraint — defer (chosen), but lock in *what the prompts cannot contain* now.** Registry stays static, code-defined, and free of runtime domain content. Eventual prompts encode methodology only — never figures, never Source-specific instructions, never business knowledge.

## Why C-with-constraint over plain C

Plain deferral leaves a hazard: the next person (or the user a year from now) opens the empty Registry, decides "I'll just paste in some helpful examples for `MarketSizing.tam`," and quietly turns the Registry into a half-baked source of figures. That violates two existing structural commitments at once — [ADR-0002](0002-framework-registry.md)'s Registry-as-static-code rule, and [ADR-0007](0007-llm-never-computes-derived-figures.md)'s LLM-never-computes-derived-figures posture (the Registry feeding *seed numbers* to the LLM is the same anti-pattern from the other direction).

C-with-constraint records the structural commitment now, even though the content is deferred. When prompts are eventually added, the constraint is the gate: anyone proposing prompt content that names a figure, a Source, or a strategic conclusion is proposing a Registry change that violates this ADR and needs a superseding decision.

## What "free of runtime domain content" means concretely

Allowed in eventual per-slot prompts:
- Methodological framing (*"Identify external forces that could meaningfully erode position over the planning horizon"*)
- Structural shape requirements (*"Produce 3-7 candidate **Hypotheses**, each with a named actor, mechanism, and time horizon"*)
- Citation-pattern requirements (*"Each candidate **Hypothesis** must be supportable by at least one **Claim** citing a **Source** with `trustScore ≥ 0.7`"*)
- Pointers to other slots or Framework Kinds for canonical research order (*"Read upstream PESTEL Hypotheses before populating this slot"*)

Forbidden:
- Specific figures or ranges (*"the SaaS market is typically $X-$Y"*)
- Specific Source recommendations (*"start with the latest Gartner report"*)
- Strategic conclusions (*"buyer power is usually high in B2B SaaS"*)
- Anything that pre-supposes findings the Researcher hasn't yet produced

## Consequences

- **Framework Registry ships empty per-slot prompts.** The Coordinator passes `slotName` and the Framework Kind context to the Researcher; the Researcher operates from its system prompt and identity ([CLAUDE.md](../../CLAUDE.md)) until per-slot prompts are added.
- **[ADR-0002](0002-framework-registry.md)'s "encodes ... per-slot default research prompts" line is now correctly read as "is the *future home* of per-slot default research prompts; currently empty."** No code or migration needs to change — the Registry's slot schema already permits the field; it just isn't populated.
- **Adding per-slot prompts is a Registry data change, not necessarily an ADR per slot.** Per [ADR-0002](0002-framework-registry.md), adding/removing Kinds requires an ADR. Tuning *prompts on existing slots* is lighter — a Registry data change, reviewed in a normal commit. The constraint in this ADR is the gate the change must clear.
- **The constraint is testable.** A custom ESLint rule (or a Registry self-test) could fail Registry entries whose prompt strings contain `$`, percent signs adjacent to digits, named known Source domains, or specific figures. Not blocking; track as a follow-up Sandcastle issue alongside the other custom-rule items in [linting-and-tooling.md](../principles/linting-and-tooling.md).
- **Reversal:** if observation shows the Researcher genuinely cannot produce useful Hypotheses without seeded figures, that's a finding worth a superseding ADR, not a quiet drift. The constraint protects the structural posture; lifting it would be deliberate.
