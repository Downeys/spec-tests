# test5-sandcastle

## Development principles

Read [docs/principles/README.md](docs/principles/README.md) before starting work. Each rule lives in its own file:

- [language-and-types.md](docs/principles/language-and-types.md) — TypeScript strict, Zod at boundaries, branded types, tagged-union `Result<T,E>`. No Effect-ts.
- [architecture.md](docs/principles/architecture.md) — Onion: Domain / Application / External / Presentation. Lint-enforced inward dependencies.
- [domain-modeling.md](docs/principles/domain-modeling.md) — DDD ceremony rule (wrong-if-violated), anemic-model ban, Citation as Reified Association, three-confidence composition, nomenclature binding.
- [memory-architecture.md](docs/principles/memory-architecture.md) — _Product_ principles: OpenBrain as source of truth, append-only, wiki as derived projection, citation-required at OpenBrain boundary, agent-never-invents.
- [testing.md](docs/principles/testing.md) — Vitest, per-layer coverage, property-based on domain, testcontainers, behavior-required rule.
- [linting-and-tooling.md](docs/principles/linting-and-tooling.md) — ESLint + plugins + three custom rules + Husky/lint-staged + pre-commit. No `--no-verify` ever.
- [clean-code.md](docs/principles/clean-code.md) — DRY / YAGNI / KISS, small focused functions (lint-enforced max-depth/complexity), composition over inheritance, pure functions in the domain layer.
- [personal-use-tradeoffs.md](docs/principles/personal-use-tradeoffs.md) — What's relaxed (UI, auth, ops), what's not (domain correctness, citations, types, backups).
- [context-budget.md](docs/principles/context-budget.md) — 100k target / 150k ceiling, mechanical measurement, summarize-don't-paste.
- [claude-code-modes.md](docs/principles/claude-code-modes.md) — Universal rules + Sandcastle-only deltas, including "Claude Code does not write `wiki/` or ingest OpenBrain."

## Domain context and decisions

- [CONTEXT.md](CONTEXT.md) — canonical domain vocabulary (Source / Claim / Citation / Strategy / Hypothesis / Quantitative Hypothesis / Strategic Framework / Framework Kind / Framework Registry / Derivation Edge / Critic Attempt / Objection / Conversation / Disambiguation Required / Sub-Agent Invocation / Business Plan / Marketing Plan / Financial Projection). Read before naming or writing anything in `packages/domain/`.
- [docs/adr/](docs/adr/) — architectural decisions:
  - [0001-hypothesis-centric-model.md](docs/adr/0001-hypothesis-centric-model.md)
  - [0002-framework-registry.md](docs/adr/0002-framework-registry.md)
  - [0003-agent-topology.md](docs/adr/0003-agent-topology.md)
  - [0004-anthropic-agent-sdk.md](docs/adr/0004-anthropic-agent-sdk.md)
  - [0005-tavily-for-web-search.md](docs/adr/0005-tavily-for-web-search.md) — _superseded by [ADR-0026](docs/adr/0026-anthropic-web-search-supersedes-tavily.md)_
  - [0006-wiki-commit-policy.md](docs/adr/0006-wiki-commit-policy.md)
  - [0007-llm-never-computes-derived-figures.md](docs/adr/0007-llm-never-computes-derived-figures.md)
  - [0008-source-ingestion-two-tier.md](docs/adr/0008-source-ingestion-two-tier.md)
  - [0009-wiki-is-digest-openbrain-is-rag.md](docs/adr/0009-wiki-is-digest-openbrain-is-rag.md)
  - [0010-strategy-as-scope-unit.md](docs/adr/0010-strategy-as-scope-unit.md)
  - [0011-one-framework-instance-per-kind-per-strategy.md](docs/adr/0011-one-framework-instance-per-kind-per-strategy.md)
  - [0012-ripple-semantics-and-domain-events.md](docs/adr/0012-ripple-semantics-and-domain-events.md)
  - [0013-marketing-plan-mirrors-financial-projection.md](docs/adr/0013-marketing-plan-mirrors-financial-projection.md)
  - [0014-numeric-disambiguation-and-extraction.md](docs/adr/0014-numeric-disambiguation-and-extraction.md)
  - [0015-pivot-via-archive-and-clean-slate.md](docs/adr/0015-pivot-via-archive-and-clean-slate.md)
  - [0016-slot-schema-fixed-and-repeating.md](docs/adr/0016-slot-schema-fixed-and-repeating.md)
  - [0017-conversation-as-aggregate-fresh-context-default.md](docs/adr/0017-conversation-as-aggregate-fresh-context-default.md)
  - [0018-confidence-decomposed-display-no-stored-scalar.md](docs/adr/0018-confidence-decomposed-display-no-stored-scalar.md)
  - [0019-per-slot-research-prompts-deferred-registry-stays-runtime-free.md](docs/adr/0019-per-slot-research-prompts-deferred-registry-stays-runtime-free.md)
  - [0020-product-namespace-separate-from-sandcastle-wrapper.md](docs/adr/0020-product-namespace-separate-from-sandcastle-wrapper.md)
  - [0021-sub-agent-invocations-as-append-only-audit-aggregates.md](docs/adr/0021-sub-agent-invocations-as-append-only-audit-aggregates.md)
  - [0022-voyage-for-embeddings.md](docs/adr/0022-voyage-for-embeddings.md)
  - [0023-node-pg-migrate-sql-only.md](docs/adr/0023-node-pg-migrate-sql-only.md)
  - [0024-two-role-postgres-model.md](docs/adr/0024-two-role-postgres-model.md)
  - [0025-source-content-in-postgres-bytea.md](docs/adr/0025-source-content-in-postgres-bytea.md)
  - [0026-anthropic-web-search-supersedes-tavily.md](docs/adr/0026-anthropic-web-search-supersedes-tavily.md)
  - [0027-source-repository-reads-are-literal-id.md](docs/adr/0027-source-repository-reads-are-literal-id.md)
  - [0028-trust-score-is-nullable-unrated-is-distinct-from-rated.md](docs/adr/0028-trust-score-is-nullable-unrated-is-distinct-from-rated.md)

## Agent skills

### Issue tracker

Issues live as GitHub issues. Use the `gh` CLI. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Five canonical triage-state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus five Sandcastle workflow labels (`sandcastle`, `in-progress`, `needs-review`, `blocked`, `retry`). See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See [docs/agents/domain.md](docs/agents/domain.md).
