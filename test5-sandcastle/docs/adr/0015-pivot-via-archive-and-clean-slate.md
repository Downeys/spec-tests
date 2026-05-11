# Pivot via Strategy archive + clean-slate new Strategy

The user-facing operation for "pivot" is **Strategy-level archive followed by a fresh Strategy**. The new Strategy starts empty: no Hypotheses, Strategic Frameworks, Critic Attempts, or Objections carry over. Evidence aggregates (Sources, Claims, Citations) remain reusable from the global pool. The archived Strategy stays in OpenBrain as a read-only historical record, fully queryable but excluded from default Strategy listings and Business Plan / Marketing Plan / Financial Projection renders.

No `fork from` operation, no "import Hypotheses from prior Strategy" operation, no Critic Attempt history carry-over.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Adds the `archive` command to the [ADR-0010](0010-strategy-as-scope-unit.md) Strategy-command set. Composes with [ADR-0012](0012-ripple-semantics-and-domain-events.md) (Critic Attempt snapshot integrity).

## Considered Options

- **A — Strategy-level archive only, clean slate (chosen).** `/strategy archive <name>` flips `archived: true`. New Strategy is empty. User manually re-creates any Hypotheses worth keeping.
- **B — Strategy archive + Hypothesis-level import.** New Strategy can `/strategy import-hypotheses-from <archivedStrategy>`. Imported Hypotheses come over with text and slot assignments at `unverified`, no Critic history.
- **C — Fork-from operation with provenance.** `/strategy fork <name> --from <source>`. Hypotheses, Frameworks, Critic Attempts copied as new aggregates with `derivedFromStrategyId` / `derivedFromHypothesisId` provenance fields. Old Strategy auto-archived as the historical snapshot.

## Why A over B and C

- **A is the simplest model that gets the pivot use case working.** No new aggregate fields, no copy semantics, no provenance plumbing. The user's stated workflow ("rebuild any Hypothesis I want to keep from one strategy to another, that won't take long") is well-served by A.
- **C adds significant complexity** for a use case the user has explicitly opted out of. Provenance fields on every strategy-laden aggregate; fork-time reasoning about Critic Attempt validity in the new Strategy's upstream graph; UI for "show me how this Strategy diverged from its parent." Build A; revisit C only if the user keeps manually re-creating Strategies that look like forks.
- **B looks small but breaks Critic Attempt integrity.** Imported Hypotheses _could_ carry over their Critic Attempts — but those Attempts' `evidenceSnapshot` referenced the _old_ Strategy's upstream Hypothesis IDs, which don't exist (or have different IDs) in the new Strategy. Either you fix up the snapshot at import time (synthesizing IDs into a historical snapshot — mutates the audit trail, defeats the [ADR-0012](0012-ripple-semantics-and-domain-events.md) rule that snapshots are faithful), or you import Hypotheses _without_ Critic history and force re-Critic immediately (most of B's "convenience" wins evaporate). The cleaner cut is no import at all.
- **The audit-grade rule about Critic Attempt snapshots being faithful is too important to bend.** This is the same posture established in [ADR-0012](0012-ripple-semantics-and-domain-events.md) (snapshots must reflect the actual evidence-and-upstream-state at attempt time) and in the append-only Critic Attempt rule in [CONTEXT.md](../../CONTEXT.md). Carry-over breaks it.

## Why "archive" instead of "delete"

- **Append-only at the aggregate level** is the OpenBrain principle. Archiving flips a flag; deleting removes data. The archived Strategy is the user's three-month research trail — losing it via accidental delete is exactly the kind of irreversible loss the personal-use-tradeoffs principle calls out (see [personal-use-tradeoffs.md](../principles/personal-use-tradeoffs.md), backup section).
- **Archived Strategies stay queryable.** The user reads the archived Strategy alongside the new one when re-creating Hypotheses worth keeping. The Renderer's cross-Strategy comparison render (per [ADR-0010](0010-strategy-as-scope-unit.md)) can include archived Strategies explicitly via flag, supporting "show me what changed between the old direction and the new one."
- **No `delete` command exists** in the `/strategy` command set. Period. If a Strategy was created in error and the user wants it gone, the answer is `archive` (and accept the small storage cost) — or, in the rare case of genuinely unwanted state, drop the OpenBrain DB entirely and start over.

## Strategy command set, finalised

| Command                                | Effect                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/strategy create <name>`              | Creates a new Strategy. New Strategies start empty.                                                                                                      |
| `/strategy switch <name>`              | Resets the Coordinator's `activeStrategyId` to the named Strategy.                                                                                       |
| `/strategy list`                       | Lists non-archived Strategies.                                                                                                                           |
| `/strategy list --all`                 | Lists all Strategies, archived included.                                                                                                                 |
| `/strategy rename <name> <new-name>`   | Renames a Strategy (archived or not).                                                                                                                    |
| `/strategy archive <name>`             | Marks `archived: true`. Excluded from default listings and renders.                                                                                      |
| `/strategy unarchive <name>`           | Reverts `archived: false`. Same Strategy, no data lost. _(Deferred — no use-case, no API endpoint, no UI control as of PRD-3. Lands when first needed.)_ |
| ~~`/strategy delete`~~                 | **Does not exist.**                                                                                                                                      |
| ~~`/strategy fork`~~                   | **Does not exist** (deferred — see Considered Options).                                                                                                  |
| ~~`/strategy import-hypotheses-from`~~ | **Does not exist** (deferred — see Considered Options).                                                                                                  |

## Consequences

- **`Strategy.archived: boolean`** is the only state on the Strategy aggregate beyond `id`, `name`, `createdAt`. Strategies do not have a state machine. `archived` is toggled by the `archive` command (and, when implemented, `unarchive`).
- **`unarchive` is deferred.** No use-case, no API endpoint, no UI control as of PRD-3. Until it ships, archive is reversible only by direct edit of the strategies JSON file. The archive-confirmation friction in PRD-3's UI is the operator's recovery mechanism.
- **Default queries exclude archived Strategies.** Business Plan / Marketing Plan / Financial Projection renders skip archived; `/strategy list` excludes archived by default; cross-Strategy comparison renders exclude archived unless the user explicitly opts them in.
- **Read-only access to archived Strategies is unchanged.** The user can still `/strategy switch <archived-name>` to view its frameworks and Critic history, but the Coordinator refuses _write_ operations against an archived Strategy (no new Hypotheses, no slot changes, no Critic Attempts) — returning `Result<void, StrategyArchived>` at the use-case layer.
- **The user's three-month research trail is preserved** when they pivot. They can read it; they can cite it; they cannot accidentally lose it; they cannot accidentally mutate it.
- **Re-creating Hypotheses is manual.** When the user wants Hypothesis text from the old Strategy in the new one, they read the old one and re-create — typing or paste-from-wiki. Citations to global Claims survive (Claims are global per [ADR-0010](0010-strategy-as-scope-unit.md)); only the Hypothesis text and slot assignment have to be re-entered. Cost: a few minutes per Hypothesis worth keeping. Benefit: zero ambiguity about Critic-history validity in the new Strategy.
- **Future fork-from operation is not blocked** by this ADR. If usage data ever shows the user repeatedly recreating Strategies that look like forks, a follow-up ADR can introduce the operation with full provenance — at that time, the carry-over-Critic-history question gets re-answered with explicit semantics.
