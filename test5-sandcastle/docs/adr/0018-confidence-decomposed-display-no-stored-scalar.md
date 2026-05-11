# Confidence is decomposed at display; composed only as a renderer-internal sort key

The three confidence-bearing fields (`Source.trustScore`, `Citation.confidence`, `Hypothesis.status`) are **always rendered side-by-side** in the wiki and Hypothesis page — never collapsed into a single composed badge. **No composed scalar is stored on any aggregate.** The Renderer / Application layer **may** compute a composed value at read-time as a pure domain function, but only for one specific purpose: ordering items where ranking matters (e.g. "weakest-supporting Hypotheses in this SWOT first" in a Business Plan margin annotation list). The composed value never appears in user-facing copy.

Vocabulary and three-way composition in [docs/principles/domain-modeling.md](../principles/domain-modeling.md#three-confidence-bearing-concepts-on-three-different-objects). Composes with [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md) (wiki is a derived projection — no canonical content the data layer doesn't have) and the never-hidden invariants on [Objection](../../CONTEXT.md) and [Critic Attempt](../../CONTEXT.md).

## Considered Options

- **A — Composed scalar.** A pure function returns a single `0..1` (or `low/medium/high`) badge per Hypothesis. Easy to sort, filter, and put in margin notes. **Rejected.** A Hypothesis backed by one peer-reviewed Source at trust 0.95 × citation 0.9 renders identically to one backed by three Twitter threads at 0.4 × 0.7. The formula compresses the structural difference away — directly contradicting the "make skepticism visible" posture in [memory-architecture.md](../principles/memory-architecture.md) and the never-hidden Objection invariant.
- **B — Decomposed display, no scalar at all.** Wiki always shows the three values side-by-side. No composed value computed anywhere. **Rejected.** Loses the ability to surface "show me the weakest Hypotheses in this SWOT" / "order Business Plan margin annotations by tenuousness" — operationally useful and hard to do by eye on a populated framework.
- **C — Hybrid: decomposed display, composed value only as a renderer-internal sort key (chosen).** Wiki and Hypothesis pages render the three values side-by-side. Renderer/Application can compute a composed value at read-time for ranking/sorting, never persisted, never shown as a badge.

## Why C

- **The structural commitment is "make skepticism visible."** A single composed badge is exactly the same anti-pattern as collapsing dismissed Objections into a count or auto-coalescing repeat Critic Attempts — both already explicitly forbidden. Rendering the three values intact preserves the audit-grade posture the data layer already carries.
- **The structural commitment is reversible only at high cost.** Adding a stored `composedConfidence` field to the `Hypothesis` aggregate later would be a real migration; conversely, removing the wiki's three-way decomposition once UI consumers depend on it is also painful. C nails down the structural shape.
- **The sort-key formula is reversible at low cost.** It lives in one pure function in `packages/domain`, called from Application/Renderer, never persisted. Changing it doesn't ripple. So C lets us defer the formula without locking in the shape.

## Consequences

- **No `composedConfidence` field on `Hypothesis`** (or on any aggregate). Anything that looks like one in code review is a regression.
- **Wiki templates render three rows / three pieces** for every Hypothesis: the status discriminant, the best-supporting Citation's `confidence × Source.trustScore`, and a link to the full Citation list. No composed badge anywhere in `wiki/`.
- **The composed sort-key formula is deferred** until the first Renderer feature that needs it lands. When it lands: pure function in `packages/domain`, called only by Application-layer Renderer code, returning a number used solely for ordering. Never persisted, never returned to user-facing copy.
- **Lint/structural enforcement of "no composed display" is a follow-up.** A custom ESLint rule (or a Renderer test) could fail a wiki template that emits a single composed-confidence string. Not blocking; track as a follow-up Sandcastle issue alongside the other custom-rule items in [linting-and-tooling.md](../principles/linting-and-tooling.md).
- **The "Specific weights, thresholds, and the exact formula are product decisions deferred to the next session" line** in [domain-modeling.md](../principles/domain-modeling.md) is replaced with a pointer to this ADR — the *display rule* is now decided; the *formula* remains deferred, but the deferral now has a defined shape (sort-key only, renderer-internal, pure function, never persisted).
