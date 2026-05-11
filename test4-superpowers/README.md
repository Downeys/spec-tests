# business-plan-builder

Memory-driven business-plan-builder. PRD 1 ships the OpenBrain (Postgres) + wiki-vault memory architecture and a deterministic compilation agent. PRD 2 adds the agent shell — a chat UI backed by a Node service running an Opus agent loop with read/write tools over OpenBrain.

## Layout

| Path | Purpose |
|---|---|
| `backend/` | Node + TypeScript backend (Fastify + custom agent loop) |
| `frontend/` | Vite + React + Tailwind chat UI |
| `migrations/` | `node-pg-migrate` schema migrations |
| `vault/` | Compiled wiki — read in Obsidian, written by the compilation agent |
| `tests/e2e/` | Playwright happy-path |
| `docs/superpowers/` | Specs and plans |

## PRD 2 — Agent shell (chat UI + backend)

### Local setup

1. Set `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` in `.env` (see `.env.example`).
2. `docker compose up -d` (Postgres + pgAdmin).
3. `pnpm migrate up`
4. Optional — backfill embeddings for any pre-existing claims:
   ```bash
   pnpm cli embed-missing
   ```

### Run the agent

Terminal 1:
```bash
pnpm cli serve              # backend on :8787
```

Terminal 2:
```bash
pnpm --filter frontend dev  # UI on :5173
```

Open http://localhost:5173.

### CLI

| Command | Purpose |
|---|---|
| `pnpm cli embed-missing` | Backfill embeddings for claims with NULL embedding |
| `pnpm cli embed-all --yes` | Re-embed every claim (after a model swap) |
| `pnpm cli serve` | Start the backend HTTP service |
| `pnpm cli compile` | Run the compilation agent once |
| `pnpm cli reset --db --yes` | Truncate app tables (preserves migrations) |

### Tests

```bash
pnpm test                                    # backend Vitest suite
pnpm --filter frontend test                  # frontend component tests
pnpm test:e2e                                # Playwright happy-path
```
