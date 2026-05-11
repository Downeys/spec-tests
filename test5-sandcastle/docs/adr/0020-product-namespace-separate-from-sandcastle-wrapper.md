# Product namespace is separate from the Sandcastle wrapper; current placeholder is `bp-agent`

The personal business-planning research agent (the *product*) is namespaced separately from **Sandcastle** (the issue-draining wrapper that runs this product's autonomous tasks). Anywhere the product owns runtime state — config files, systemd unit, Docker image, eventual repo name when forked off the test-bed — uses the **product's** namespace. **Current placeholder name: `bp-agent`** (business-planning agent), to be replaced atomically with a real name when the product crystallizes.

`sandcastle`, `.sandcastle/`, `~/.config/sandcastle-claude-creds/`, `npx sandcastle …`, and the `sandcastle` GitHub-issue label all remain correctly named — those are the wrapper, not the product.

## Why namespace at all

- **They are different artifacts with different lifecycles.** Sandcastle is a third-party library pinned to an exact version (currently 0.5.7), treated as fragile and library-grade per [memory-architecture.md](../principles/memory-architecture.md). The product is the long-running, append-only research system whose data must outlive any specific Sandcastle version. Conflating their config namespaces means an `npx sandcastle` upgrade could touch the product's config; a product-config bug could mask as a wrapper bug; a future fork of either project would need to disentangle them.
- **The agent's identity is the product, not the wrapper.** The runtime agent the user talks to in chat is the business-planning agent — *not* "the Sandcastle agent." Storing the agent's runtime state under `~/.config/sandcastle/` would have made `CLAUDE.md`'s identity claim ("you are the business-planning agent") incoherent at the file-system level.
- **A future reader.** Someone reading this codebase a year from now sees `~/.config/sandcastle/runtime.json` and reasonably assumes it's the wrapper's config — and may "clean up" what looks like duplication. The separate namespace prevents that quiet error.

## Why a placeholder, not a real name yet

- **The product is not finished enough to deserve a permanent name.** Bikeshedding on a name now is the wrong investment.
- **The eventual rename is mechanical** — one find-and-replace across the repo plus an ADR recording the chosen name. Cheap to defer.
- **`bp-agent` is unambiguously a placeholder.** Any reader can tell it's not a real product name; nobody will defend it; the rename is expected.

## Considered Options

- **A — Pick a permanent product name now (e.g. `strategos`, `cartograph`, `hypothesis`).** Cleaner forever; bikeshedding cost up front; commits to a name before knowing whether the product evolves into something differently-named.
- **B — Use a placeholder name, formalize later (chosen).** `bp-agent` everywhere the product owns namespace; rename atomically when the real name is decided.
- **C — Live with the conflation; rename later as one big change.** Every config path, systemd unit, and reference is wrong-named in the meantime; the user reading their own code in a year is confused about which "sandcastle" is which.

## Consequences

- **[ADR-0017](0017-conversation-as-aggregate-fresh-context-default.md)** updated: runtime config path is `~/.config/bp-agent/runtime.json`.
- **Wiki folder structure** is unaffected — `wiki/` at the repo root, not under any product-name folder. The repo *is* the product; the wiki is content within it.
- **Systemd unit name** (when one is set up per [personal-use-tradeoffs.md](../principles/personal-use-tradeoffs.md)) uses the `bp-agent` namespace: e.g. `bp-agent.service`, not `sandcastle.service`.
- **Docker image** for running the product (separate from the Sandcastle base image used by the wrapper) is `bp-agent:<tag>`. Note: the *Sandcastle wrapper's* base image is `sandcastle:test5-sandcastle` per [README.md](../../README.md) — that's correct as Sandcastle-named.
- **Repo rename when forked off the test-bed.** Currently `test5-sandcastle`. When forked from the test-bed, the new repo's directory name should be the product's namespace — placeholder `bp-agent`, real name when chosen.
- **The rename is a single coordinated change** when a real product name is chosen: a superseding ADR records the chosen name and lists every site that gets renamed. Until then, `bp-agent` is the canonical product namespace.
