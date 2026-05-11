# One Strategic Framework instance per Kind per Strategy

Within a single **Strategy**, at most one **Strategic Framework** instance exists per **Framework Kind**. Instance identity is the pair `(StrategyId, FrameworkKind)`. Time-horizon variants ("current state" vs "5-year view") and per-segment variants ("North America" vs "Europe") are modelled as separate **Strategies**, not as additional Strategic Framework instances within one Strategy.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Builds on [ADR-0010](0010-strategy-as-scope-unit.md) (Strategy as scope unit). Composed with [ADR-0002](0002-framework-registry.md) (Framework Registry).

## Considered Options

- **A — One instance per Kind per Strategy (chosen).** Strategic Framework natural key is `(StrategyId, FrameworkKind)`. Aggregate construction refuses to create a second instance with the same key.
- **B — Multiple instances per Kind per Strategy, user-named.** Strategic Framework instances carry a user-given label (`PESTEL/current-state`, `PESTEL/5-year`, `SWOT/north-america`). Slot identity becomes `(StrategicFrameworkId, SlotName)` with `StrategicFrameworkId` as a synthetic key.
- **C — Default to one, allow multiple via "variant" tag.** Same as A by default; user can opt into a `variant: string` discriminator. Adds a concept (variant) that doesn't otherwise exist in the model.

## Why A over B and C

- **B breaks the Framework Registry's upstream/downstream hint.** [ADR-0002](0002-framework-registry.md) records that Kinds have canonical upstream/downstream relationships (`PESTEL → FiveForces → SWOT → STP → Positioning → FourPs → FeedbackChannels`). The Cartographer uses these as derivation hints. With multiple PESTELs and multiple FiveForces in one Strategy, the Cartographer cannot suggest derivations without asking "which PESTEL feeds which FiveForces?" — turning hints into ceremony.
- **The use cases for multi-instance map cleanly to other abstractions we already have.**
  - "Current state vs 5-year horizon" → either time-keyed Hypothesis values inside one PESTEL ("regulation: HIGH today, MODERATE by 2030") or two **Strategies**.
  - "Per-market-segment views" → these are separate strategic explorations with different facts and different Hypotheses about buyer power, regulation, etc. The **Strategy** abstraction (per [ADR-0010](0010-strategy-as-scope-unit.md)) is the right granularity.
- **C adds a concept that does no work the Strategy abstraction isn't already doing.** A `variant` tag is a half-Strategy with worse audit semantics — the user has to remember which variant a given Hypothesis belongs to without the structural guard a separate Strategy provides.
- **A keeps the slot-identity simple.** A slot is uniquely identified by `(StrategyId, FrameworkKind, SlotName, [SlotIndex])`. Cartographer slotting decisions, Renderer composition, ripple traversal, and wiki page paths all line up with this key shape without needing a synthetic instance ID.

## Consequences

- **Strategic Framework aggregate construction enforces uniqueness.** Attempting to create a second instance with the same `(StrategyId, FrameworkKind)` returns `Result<void, FrameworkAlreadyExists>`. Enforced at the domain layer (per the DDD ceremony rule in [domain-modeling.md](../principles/domain-modeling.md)), not at the database layer alone.
- **Strategic Framework natural key is `(StrategyId, FrameworkKind)`.** A synthetic `StrategicFrameworkId` exists for join convenience but is not the identity-defining key.
- **Wiki page paths reflect the natural key.** `wiki/strategies/<strategy-slug>/frameworks/<kind-slug>.md` — no instance suffix. One markdown file per `(Strategy, Kind)`.
- **The "5-year view" use case has explicit guidance.** When the user asks for a 5-year horizon view of one Strategy, the Coordinator offers two options: (a) extend existing Hypotheses with a time-keyed value, (b) create a `<strategy>-5y` sibling Strategy. The Coordinator does *not* offer "add a second PESTEL to this Strategy."
- **Escape hatch.** If a real use case for "two PESTELs in one Strategy" surfaces in practice, this ADR is revisited. Until then, blocking it at construction keeps the Cartographer's hint logic and the Renderer's composition logic simple.
