# Slot schema variants: FixedSlots and RepeatingSlots

The **Framework Registry** models a Kind's slot schema as a discriminated union with exactly two variants:

- **`FixedSlots(slots: SlotName[])`** — enumerated slot names defined by the registry (e.g. SWOT, PESTEL, FourPs).
- **`RepeatingSlots(segmentInnerSchema: SlotName[], minSegments?, maxSegments?)`** — a repeating outer slot whose label is **user-named** at instance time, and an inner schema of registry-defined slot names that each user-created segment must populate (e.g. STP, FeedbackChannels).

Slot identity for FixedSlots is `(StrategyId, FrameworkKind, SlotName)`. For RepeatingSlots it is `(StrategyId, FrameworkKind, SegmentLabel, InnerSlotName)` — `SegmentLabel` user-named, `InnerSlotName` registry-defined.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Composes with [ADR-0002](0002-framework-registry.md) (Framework Registry) and [ADR-0011](0011-one-framework-instance-per-kind-per-strategy.md) (one instance per Kind per Strategy).

## Considered Options

- **A — Two variants: FixedSlots + RepeatingSlots, with structured inner schema for repeating (chosen).** As above. Most Kinds use FixedSlots; STP, FeedbackChannels, and similar segment-shaped Kinds use RepeatingSlots with registry-defined inner sub-slots.
- **B — Two variants, but RepeatingSlots is flat (no inner schema).** Each segment is a labeled bucket of Hypotheses with no internal structure. Cheaper to model; loses the per-segment structured analysis that gives STP its analytical value.
- **C — Repeating slots use integer indices, not user labels.** Slot identity is `(StrategyId, FrameworkKind, SlotName=segment, SlotIndex=0..N)`. The user-given segment name lives inside metadata. Mechanically simpler; user's mental model and slot key drift apart.
- **D — A third variant for hybrid (some fixed slots + some repeating).** Allow Kinds that mix both. Maximally flexible; no current Kind needs it.

## Why A over B, C, and D

- **B collapses STP into a tag system.** STP's analytical value is the *structured* per-segment analysis: targeting / sizing / decision-makers / positioning. A flat bucket of Hypotheses per segment lets the user paste any Hypothesis under any segment without the framework prompting "what's the targeting for this segment?" or "what's the positioning for this segment?" The whole point of using STP as a framework is the discipline its inner structure imposes; B removes that discipline.
- **C breaks the user's mental model.** The user thinks "the mid-market-cfos segment", not "segment 0." Hiding the segment label inside metadata that isn't part of the slot key forces every query, every wiki page, and every conversational reference to dereference the metadata to display the segment to the user. Making the user-given label the slot key keeps the model and the UI in sync. The cost — the registry has to support user-named slot identifiers — is paid once at the registry level and is small.
- **D adds a variant for a use case that doesn't exist.** No current Kind in [CONTEXT.md](../../CONTEXT.md) (PESTEL, FiveForces, SWOT, STP, FourPs, FeedbackChannels, plus the deferred Quantitative Kinds) needs hybrid fixed-plus-repeating slots. Adding D speculatively complicates the slot-iteration code and the Renderer's composition logic for no current win. Add D *only if* a real Kind needs it; the two-variant union covers everything in the current scope.

## Inner schemas, illustrative

Exact inner schemas for repeating-slot Kinds are registry data (per [ADR-0002](0002-framework-registry.md)) and live in `packages/domain/strategic-frameworks/`. Examples:

- **STP** segment inner schema: `targeting`, `sizing`, `decisionMakers`, `positioning`. Optional bounds: `minSegments: 1`, `maxSegments: 8` (above 8, the framework loses analytical resolution; revisit only if a real use case surfaces).
- **FeedbackChannels** channel inner schema: `channelType`, `cadence`, `signalCaptured`, `decisionsItInforms`. Bounds: `minSegments: 1`, no fixed max.

These are illustrative; precise inner schemas land in the per-Kind ADR that introduces them, per [ADR-0002](0002-framework-registry.md)'s "adding a Kind is a code change + ADR" rule.

## Consequences

- **`FrameworkKindDefinition.slotSchema`** is a discriminated union: `{ kind: 'fixed', slots: SlotName[] }` | `{ kind: 'repeating', segmentInnerSchema: SlotName[], minSegments?, maxSegments? }`. Lives in the Framework Registry code, branded SlotName type.
- **Strategic Framework aggregate's slot storage** is a single map keyed by composite slot identity. For FixedSlots that's `(SlotName) → HypothesisId[]`. For RepeatingSlots that's `(SegmentLabel, InnerSlotName) → HypothesisId[]`, with the segment-label set tracked separately so the Strategic Framework can answer "what segments exist in this STP?"
- **Cartographer slotting prompt** is parameterised on slot schema variant. For FixedSlots, the Cartographer picks an existing slot. For RepeatingSlots, the Cartographer either picks an existing segment label *and* an inner slot, or proposes a new segment label (subject to `minSegments` / `maxSegments`).
- **Renderer composition** treats the two variants uniformly at the section level — both render as a structured set of "slot heading → Hypotheses." The repeating variant adds a layer of grouping by segment label.
- **Wiki page paths** mirror slot identity. FixedSlots: `wiki/strategies/<strat>/frameworks/swot.md` with `## Strengths`, `## Threats` headings. RepeatingSlots: `wiki/strategies/<strat>/frameworks/stp.md` with `## Mid-Market CFOs` (segment heading) → `### Targeting`, `### Sizing`, etc.
- **Adding a third variant later is open** but blocked by an ADR. If a Kind genuinely needs hybrid fixed-plus-repeating (e.g. a CostStructure Kind with fixed `fixedCosts` / `variableCosts` slots plus a repeating per-cost-line breakdown), a follow-up ADR adds the variant.
