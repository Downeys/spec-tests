---
status: accepted
---

# `SourceRepositoryPort` reads are literal-id; head-of-chain resolution lives in use cases

The `SourceRepositoryPort` defined in `packages/application/ports/source-repository.ts` exposes `findById`, `findContentById`, and `findByContentHash` with **literal-id semantics** — given an id, the method returns the exact row with that id (or null), never a "head of the `previousVersionId` chain that contains this id." Head-resolution is a use-case-layer concern, materialised when the first consumer needs it (likely a future wiki Source-page renderer or UI detail view).

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Append-only chain shape in [ADR-0024](0024-two-role-postgres-model.md). Source two-tier lifecycle in [ADR-0008](0008-source-ingestion-two-tier.md).

## Why literal-id is the right default

The triage of PRD-4 slice 3 (`#34`) considered a "reads return the head of each chain by default" rule because it sounds clean — callers don't have to reason about versions. Walking through the three slice-3 consumers showed the rule actively hostile to each:

1. **`GET /api/sources/:id/content` would break Citation re-verification.** A Citation's `span_hash` is computed over the bytes of a specific row version (per [memory-architecture.md](../principles/memory-architecture.md) §"Citation integrity"). If `findContentById` head-resolves, re-verification after a re-promotion would load the new bytes and produce a hash mismatch — even though the original Citation is still correct against its original bytes. Head-resolving breaks the audit-grade invariant the entire OpenBrain design is built on.
2. **`POST /api/sources/:id/promote-to-full` would be ambiguous.** Promoting a candidate id after that candidate has been superseded by another candidate (a metadata-correction insert) is meaningless under head-resolution: should it promote the new candidate? The full row if one already exists? Error? Literal-id makes the operation deterministic — you promote the exact row whose id you passed, and the runtime guard on `Source.promoteToFull` rejects non-candidates.
3. **`GET /api/sources/:id` reading the head doesn't help any current caller.** No consumer in slice 3 wants "the latest version of the chain containing this id." Adding the affordance pre-emptively for a renderer that doesn't exist couples the port to a hypothetical reader.

## Considered options

- **A — All port methods literal-id (chosen).** `findById`, `findContentById`, `findByContentHash` return the exact-id row. Head-resolution is added when a consumer materialises, as a separate method (e.g. `findHeadForChainContaining(id)`) or in a use case via a recursive CTE.
- **B — `findById` and `findByContentHash` head-resolve; `findContentById` is literal.** Considered because it appears to honour the slice-3 issue body's "return the head by default" reading. Rejected because the asymmetry is easy to misuse — a call site that head-resolves metadata and then literal-loads bytes can silently load bytes from a row whose metadata they never saw.
- **C — Phantom types `Source<K, S>` and per-status method visibility.** Considered because it would push more invariants to compile-time. Rejected because the type plumbing infects every downstream signature; the runtime guard on `promoteToFull` already matches the prior-art pattern from `Strategy.archive()`.

## Consequences

- **The port stays predictable.** `findById` is "give me the row with this id, or null." No surprise post-promotion reads, no caller has to know about chain semantics to use the port safely.
- **`listCandidates` filters supersession at query time** rather than chasing chain heads — a single `WHERE NOT EXISTS (SELECT 1 FROM sources s2 WHERE s2.previous_version_id = s.id)` clause. The "live candidate" workset is just the set of leaf-of-chain candidates.
- **`findByContentHash` is naturally single-row.** Only `full` rows have a `content_hash`; the unique partial index on `content_hash WHERE status='full'` is the source of truth. No chain-walking needed.
- **Head-resolution is deferred and explicit.** When the wiki Source-page renderer or a UI detail view needs "latest version of this conceptual source," it asks for it by name — a separate port method or a recursive-CTE use case. This keeps the literal-id contract intact for audit-grade callers and gives the head-walking caller a method whose name describes what it does.
- **The slice-3 acceptance criterion "Repository reads return the head of each chain by default" is replaced by "Repository reads are literal-id."** The slice-3 agent brief carries the updated criterion; this ADR is the durable record of why.
- **No retroactive impact.** Slice 1 (#32) and slice 2 (#33) ship before slice 3; neither involves chains. The literal-id rule applies to every port method from slice 2 onward, but there is nothing earlier to revise.
