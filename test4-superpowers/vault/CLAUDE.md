# Vault Schema

This file defines how the compilation agent organizes the wiki vault. It is read at the start of every compilation run and is **never regenerated** — co-evolve it with the project.

## Directory layout

```
vault/
├── CLAUDE.md            — this file (hand-maintained)
├── index.md             — catalog of all pages (generated)
├── log.md               — chronological events (generated, append-only-by-section)
├── sources.md           — single aggregate source catalog (generated)
├── contradictions.md    — surfaced unresolved 'contradicts' relations (generated)
├── assets/              — images/charts (user-owned)
├── notes/               — user notes; compilation never reads or writes here
└── concepts/            — one page per tag (generated)
    └── <slug>.md
```

## Frontmatter

Every generated page has YAML frontmatter:

```yaml
---
type: concept | source-index | index | log | contradictions
slug: <tag-slug>             # concept pages only
display: <human name>        # concept pages only
generated_at: <ISO8601>
compilation_run: <uuid>
claim_count: <int>           # concept pages
status_summary: { open: N, validated: N, refuted: N, superseded: N }  # concept pages
source_count: <int>          # source-index page
---
```

## Cross-link conventions

- Concept-to-concept: `[[concepts/<slug>|Display]]`
- Concept-to-source: `[[sources#^src-<short-uuid>|Source Title]]`
- Claim block-id: each quoted claim is followed by `^claim-<short-uuid>`. Other pages can deep-link via `[[concepts/<slug>#^claim-<short-uuid>]]`.

Always use explicit paths; never rely on default link resolution.

## Rules

1. **Every claim has a status.** Promotion to `validated` / `refuted` requires `status_reason`. Promotion to `superseded` requires an inbound `supersedes` relation. The agent never auto-promotes.
2. **Contradictions are preserved, never smoothed.** Both sides of a `contradicts` relation appear in `contradictions.md` with sources, until one side is `retired` or `superseded`.
3. **Provenance is required.** Every claim quoted in a wiki page must link to its source via `[[sources#^src-<id>]]` (or render as `*(user statement)*` if `sourceId` is null).
4. **Agent owns:** `concepts/`, `sources.md`, `index.md`, `log.md`, `contradictions.md`. Compilation may overwrite these.
5. **User owns:** `notes/`, `assets/`, this file. Compilation never touches these.
