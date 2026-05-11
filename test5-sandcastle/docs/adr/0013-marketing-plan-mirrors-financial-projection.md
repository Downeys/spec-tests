# Marketing Plan mirrors Financial Projection; marketing-relevance is registry-encoded

**Marketing Plan** is symmetrical to **Financial Projection**: both are render-time projections that are *embedded as a section of the Business Plan* AND *independently renderable* as standalone documents. The "marketing-relevant" subset of Strategic Frameworks and slots is **statically encoded in the Framework Registry**, per Kind and per slot — not selected by the user at render time.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Composed with [ADR-0002](0002-framework-registry.md) (Framework Registry), [ADR-0006](0006-wiki-commit-policy.md) (deterministic projection), [ADR-0007](0007-llm-never-computes-derived-figures.md) (deterministic vs LLM split), and [ADR-0010](0010-strategy-as-scope-unit.md) (single-Strategy renders).

## Decision 1 — Marketing Plan is symmetrical to Financial Projection

Marketing Plan and Financial Projection have the same dual nature:

- **Embedded as a Business Plan section.** The Business Plan render composes its marketing section by invoking the Marketing Plan projection, and its financial section by invoking the Financial Projection projection. Composition, not duplication.
- **Independently exposable.** Either can be rendered standalone for an audience that doesn't need the full Business Plan (a marketing-team reader, a finance reviewer).

### Considered Options

- **A — Symmetrical (chosen).** Marketing Plan = section + standalone; Financial Projection = section + standalone. Both are sub-projections of Business Plan when embedded.
- **B — Both as separate siblings.** Business Plan has no marketing or financial chapter; the user exports the three independently and reads them side-by-side. Removes the embedded relationship from Financial Projection too, for symmetry.
- **C — Asymmetric on purpose.** Financial Projection is embedded because it's *deterministic numbers*; Marketing Plan is sibling-only because it's *narrative-with-LLM*. The asymmetry encodes the deterministic-vs-narrative split.

### Why A over B and C

- **The spec is unambiguous about marketing being part of the business plan.** [spec.md](../../spec.md) describes the system as guiding "documenting a full business plan **including** comprehensive marketing strategy and financial projections." Treating Marketing Plan as a separate document fights the user's natural framing for no gain.
- **The deterministic-vs-narrative argument for C belongs at the Renderer layer, not the projection layer.** The Renderer's deterministic-base + optional-LLM-polish pattern (per [ADR-0003](0003-agent-topology.md)) applies uniformly to either projection. Treating Marketing Plan as "narrative-only" implicitly assumes the Renderer can't apply the same discipline to marketing content as to financial content — but the discipline is structural (deterministic base, optional polish), not domain-specific.
- **B loses the convenient single-document export.** The user wanting "show me the whole business plan as one document" should not have to manually stitch three exports. Composition gives them this for free.

### Consequences

- **Renderer composition is uniform.** A Business Plan is a sequence of `RenderedSection`s, some of which come from sub-projections (Marketing Plan, Financial Projection) and some of which are direct framework renders (the strategy chapter, executive summary). One composition primitive.
- **Standalone Marketing Plan reuses the Business Plan's marketing-chapter logic exactly.** No fork, no drift. The standalone case is just the embedded case with a different surrounding template.
- **Cross-Strategy comparison renders work uniformly.** Comparison-of-Marketing-Plans and comparison-of-Business-Plans both reuse the same per-Strategy render logic, fanned out side-by-side per [ADR-0010](0010-strategy-as-scope-unit.md).

## Decision 2 — Marketing-relevance is statically encoded in the Framework Registry

Each **Framework Kind** and each *slot within a Kind* carries a `marketingRelevant: boolean` flag in the **Framework Registry**. The Marketing Plan projection is a pure traversal of these flags. The user does not pick which frameworks/slots to include at render time.

Examples (illustrative, exact registry contents per [ADR-0002](0002-framework-registry.md)):

- `STP` Kind → `marketingRelevant: true` (every slot inherits).
- `FourPs` Kind → `marketingRelevant: true`.
- `FeedbackChannels` Kind → `marketingRelevant: true`.
- `Positioning` Kind → `marketingRelevant: true`.
- `SWOT` Kind → mixed; `strengths`, `opportunities` → `true`; `weaknesses`, `threats` → `false` by default.
- `FiveForces` Kind → mixed; `buyer-power`, `substitutes` → `true`; `supplier-power`, `new-entrants`, `rivalry` → `false` by default.
- `PESTEL` Kind → `marketingRelevant: false` for all slots (macro-environmental, not marketing-specific). Reconsidered if a real use case surfaces.

### Considered Options

- **A — Static at the Framework Registry level (chosen).** Per-Kind and per-slot boolean flags. Marketing Plan render is a function of state.
- **B — Per-render selection by the user.** Checkbox UI at render time. Maximally flexible.
- **C — Static defaults from registry, user can override per-render.** Hybrid; per-render overrides shadow the static defaults.

### Why A over B and C

- **B and C make Marketing Plan output non-deterministic across renders.** A comparison render of two Strategies could show different slot inclusion if the user toggled differently between runs — which collapses the audit-grade-projection posture established in [ADR-0006](0006-wiki-commit-policy.md). Determinism is the load-bearing requirement; static encoding gets it for free.
- **Classifying a slot as "marketing-relevant" is a strategic-taxonomy decision, not a per-render preference.** It's the kind of decision that benefits from the [ADR-0002](0002-framework-registry.md) ceremony rule (registry change = code change + ADR). If the user wishes SWOT.threats was marketing-relevant, that's a reasoned reclassification that should be recorded — not a transient toggle.
- **The freedom B offers can be recovered by other means.** A user wanting a custom one-off marketing summary can render the Business Plan and ask the Coordinator to extract the relevant sections — that's a Coordinator-conversation operation, not a Renderer feature.

### Consequences

- **`marketingRelevant: boolean`** appears on each `FrameworkKindDefinition` in the Framework Registry, with optional per-slot overrides for mixed Kinds (SWOT, FiveForces).
- **Marketing Plan render is a pure projection function** — same input state always yields same output. No render-time configuration surface.
- **Adding/removing a slot from the marketing projection requires a code change with an ADR.** Per the [ADR-0002](0002-framework-registry.md) rule. Future ADRs may adjust the boundaries (e.g. ADR-NN: "Move SWOT.threats into marketing-relevant because of competitive-positioning use cases").
- **The Framework Registry's data shape grows.** Each Kind now carries `marketingRelevant` (and any future projection-relevance flags). Existing Kinds get sane defaults; the schema migration is trivial because the registry is code, not DB state.
