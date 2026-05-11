# Personal-use trade-offs

This is a personal-use, single-operator, attended product. Some standards relax; others stay tight. The dividing line:

> **Standards relax where mistakes cost only your time.**
> **Standards stay tight where mistakes corrupt your knowledge or your decisions.**

A lazy "personal use means skip everything" reading is wrong. Domain bugs corrupt research and bias business decisions. Citation bugs collapse the "be critical" posture. Type drift produces silent wrong answers from the agent. None of those are negotiable just because there's only one user.

## Relaxed

| Area                                       | What that means concretely                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI design polish**                       | Functional > beautiful. No design system, no theme tokens. Tailwind utilities directly. Desktop-only — no responsive layouts. No animations.                                                                                |
| **UI a11y**                                | Not enforced. Use semantic HTML by default but no audit, no a11y tests.                                                                                                                                                     |
| **Auth**                                   | **Localhost-only by default.** API binds to `127.0.0.1`. No user accounts, passwords, OAuth, JWT. If you ever need access from another device, tunnel via Tailscale or SSH port-forward — don't add auth code to this repo. |
| **Onboarding / settings / preferences UI** | Skip. Edit a config file.                                                                                                                                                                                                   |
| **i18n / l10n**                            | Skip. English only.                                                                                                                                                                                                         |
| **Performance budgets**                    | "Fast enough not to annoy you." No SLOs. No premature caching. LLM calls taking 10s is fine.                                                                                                                                |
| **Observability**                          | Plain `console.log` + Sandcastle's own log files. No structured logging service, no tracing, no metrics dashboards.                                                                                                         |
| **Multi-tenancy / RBAC**                   | The system has one user. Postgres role is single-user; no row-level security policies, no per-tenant scoping.                                                                                                               |
| **CI/CD pipeline**                         | None. Tests run via the pre-commit hook locally. Deploy is manual (`git pull && pnpm install && systemd restart`, or whatever you actually use).                                                                            |
| **Marketing / docs site**                  | None.                                                                                                                                                                                                                       |
| **End-user error messages**                | Stack traces are fine. You are the user.                                                                                                                                                                                    |

## NOT relaxed

| Area                            | Why it stays tight                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain correctness**          | A bug in `Hypothesis` state transitions or `FinancialProjection` math means you make a real business decision on wrong data. Domain layer 90% coverage gate / 95% target (line + branch); property-based tests on state machines and math; branded types; no anemic models. See [testing.md](testing.md), [domain-modeling.md](domain-modeling.md). |
| **Citation integrity**          | If citations break, the entire "be critical" posture collapses. Strict citation schema (Zod-validated at OpenBrain write boundary), wiki refuses uncited claims, span_hash verified. See [memory-architecture.md](memory-architecture.md).                                                                                                          |
| **Memory hygiene**              | OpenBrain append-only. Claims require ≥ 1 citation. Agent never invents persisted data. These are the system's _value_, not its plumbing.                                                                                                                                                                                                           |
| **Type safety**                 | TS strict + Zod at every boundary, fully enforced. Personal use does not mean `any` is OK.                                                                                                                                                                                                                                                          |
| **Architecture boundaries**     | Onion enforced via `eslint-plugin-boundaries`. No "I'll skip the layer this once" exemptions.                                                                                                                                                                                                                                                       |
| **Token budget**                | 100k target / 150k ceiling, mechanically measured per-run. Oversized issues labeled. See [context-budget.md](context-budget.md).                                                                                                                                                                                                                    |
| **Secrets handling**            | API keys in `.env`, `.env` gitignored, no keys in logs. The personal project still talks to Anthropic + Voyage — keys do not leak.                                                                                                                                                                                                                  |
| **Backups of OpenBrain + wiki** | **Required.** The OpenBrain database is the irreplaceable artifact of this system. Losing it undoes months of research. `pg_dump` cron + versioned snapshots; wiki is git-versioned. _This is the strongest "not relaxed" — losing OpenBrain undoes the project._                                                                                   |
| **Pre-commit hooks**            | Run on every commit, no `--no-verify`. The agent will try to skip them in tight loops; the hook is a hard block.                                                                                                                                                                                                                                    |

## Tech-selection rule

> **Default to free / open-source for libraries, runtimes, databases, and self-hostable services.** Pay for managed cloud / proprietary services only when **(a)** the open alternative would burn a meaningful fraction of build time on operating it, or **(b)** the proprietary option is meaningfully better at the specific job (e.g. Anthropic API itself, Voyage for embeddings).
>
> **Each paid service requires a one-page ADR** in `docs/adr/` justifying the exception against an OSS alternative.

The ADR requirement keeps the rule from being silent. Every paid dependency has a written "why this over the OSS alternative" that future-you can re-examine when costs shift.

## Backups: this is operational, but it's also a principle

Treating backups as an _operational concern_ would mean the agent can deprioritize them. Treating them as a _principle_ keeps them in the active rule set the agent reads. Given that losing OpenBrain undoes the project, this belongs in principles.

Concretely:

- `pg_dump` runs on a host cron, output to a versioned snapshot dir (e.g. `~/backup/openbrain/YYYY-MM-DD.sql.gz`).
- Retention: at minimum, daily for 14 days + monthly for 12 months.
- A restore drill quarterly: pick a snapshot, restore into a scratch container, verify it loads. If you've never restored, you don't have a backup.
- Specific cron timing, retention details, and offsite mirror policy live in an ADR (queued as a follow-up issue once OpenBrain is actually running).
