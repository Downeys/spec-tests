# Business Planner

A single-user, local-first business planning workbench built around the Claude Agent SDK, with research/citations (Tavily + Pinecone + Voyage), a Skeptic sub-agent, an Obsidian-compatible wiki, and SSE-driven UI.

## Prerequisites

- **Node 22 LTS** (`node --version` ≥ 22.0.0)
- **pnpm 10.x** (install via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** — only required from Phase 2 onward (Postgres in compose)

## One-time setup

```bash
pnpm install
cp .env.example .env
# Then fill in the API keys in .env
```

## Dev loop

Boot both apps in parallel:

```bash
pnpm dev
```

Or run each individually in separate terminals:

```bash
pnpm --filter @bp/web dev      # Vite on http://localhost:5173
pnpm --filter @bp/server dev   # Fastify on http://127.0.0.1:3000
```

The Vite dev server proxies `/api/*` to the Fastify server, so the web app calls `/api/health` and the request transparently lands on the backend.

## Quality commands

```bash
pnpm typecheck   # tsc --noEmit across all workspaces
pnpm lint        # ESLint, zero warnings tolerated
pnpm test        # Vitest across all workspaces
pnpm build       # Production build
```

A pre-commit hook (husky + lint-staged) runs ESLint + Prettier on staged `.ts`/`.tsx` files before each commit.

## Workspace layout

```
apps/
  web/         # @bp/web    — Vite + React 19 + TS strict frontend
  server/      # @bp/server — Fastify 5 backend (binds 127.0.0.1 only)
packages/
  shared/      # @bp/shared — Wire-shape types (events, errors, domain) shared by both apps
wiki/          # Obsidian-compatible knowledge base (populated in Epic 4)
docker/        # Phase 2 compose files
data/          # Local persistence (costs, sessions, logs) — gitignored
```

## Architecture & planning

See `_bmad-output/planning-artifacts/architecture.md`, `prd.md`, and `epics.md` for the full design and story map.
