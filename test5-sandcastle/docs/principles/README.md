# Development principles

The rules Claude Code (interactive + Sandcastle-autonomous) follows when building code in this repo, plus the architectural constraints those rules force the _product code_ to take.

These principles serve two readers:

- **Claude Code** — what to enforce when writing TypeScript, when to skip ceremony, how to size Sandcastle issues, what's relaxed because this is personal-use, what is not.
- **The product code itself** — what shape the runtime business-planning agent must take so it stays structurally faithful to the hypothesis-driven, "be critical of every finding" posture.

The product itself — its lifecycle, agent topology, ingestion workflow — is **out of scope** here. Those decisions land in [CONTEXT.md](../../CONTEXT.md) and [docs/adr/](../adr/) (created lazily, see [docs/agents/domain.md](../agents/domain.md)) as they crystallise via `grill-with-docs`.

## Index

| File                                                   | Scope            | Topic                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [language-and-types.md](language-and-types.md)         | Dev              | TypeScript strict mode, Zod at boundaries, branded types, tagged-union results, no-Effect rationale                                                                        |
| [architecture.md](architecture.md)                     | Dev + Product    | Onion layers (Domain / Application / External / Presentation), package layout, dependency direction                                                                        |
| [domain-modeling.md](domain-modeling.md)               | Dev + Product    | DDD ceremony rule (wrong-if-violated), anemic-model ban, Citation as Reified Association, three-confidence composition, nomenclature binding to CONTEXT.md                 |
| [memory-architecture.md](memory-architecture.md)       | Product          | OpenBrain as source of truth, append-only schema, wiki as derived projection, citation-required at OpenBrain boundary, agent-never-invents, hypothesis state machine       |
| [testing.md](testing.md)                               | Dev              | Vitest + Playwright, per-layer coverage, property-based for domain, testcontainers + recorded fixtures, behavior-required test rule                                        |
| [linting-and-tooling.md](linting-and-tooling.md)       | Dev              | ESLint + plugins, three custom rules, Husky + lint-staged + pre-commit, no `--no-verify` ever                                                                              |
| [clean-code.md](clean-code.md)                         | Dev              | DRY / YAGNI / KISS, small focused functions with lint-enforced max-depth and complexity, composition over inheritance, pure functions and immutability in the domain layer |
| [personal-use-tradeoffs.md](personal-use-tradeoffs.md) | Dev + Product    | What's relaxed (UI, auth, ops), what's not (domain correctness, citations, types, backups), tech-selection rule with paid-service ADR requirement                          |
| [context-budget.md](context-budget.md)                 | Dev (Sandcastle) | 100k target / 150k ceiling, BUDGET config location, mechanical post-run measurement, summarize-don't-paste                                                                 |
| [claude-code-modes.md](claude-code-modes.md)           | Dev              | Universal rules + Sandcastle-only deltas, including "Claude Code does not write `wiki/` or ingest into OpenBrain"                                                          |

## How to use this folder

- **Read [CLAUDE.md](../../CLAUDE.md) first** — it links here and to the other agent-skill docs in [docs/agents/](../agents/).
- **Then read the file relevant to what you're about to do.** Don't load the whole folder unless you're auditing.
- **If two files contradict, the more specific one wins** (e.g. `claude-code-modes.md` overrides general guidance for autonomous runs).
- **If a principle conflicts with what you're being asked to do**, surface the conflict in the issue or session — don't silently override.

## What's deliberately _not_ here

- The product's lifecycle, workflow, agent topology — those go in CONTEXT.md and ADRs once decided.
- Tooling enforcement (lint config, tsconfig flags, pre-commit hook wiring) — those are queued as separate Sandcastle issues; principles describe the rules, follow-up issues implement them.
- Scaffolded package folders — created when the first product issue needs them.
