# Business Strategy Planner — Phase 1

## Setup

1. Copy `.env.example` to `.env` and fill in `VOYAGE_API_KEY` (get from https://www.voyageai.com/).
2. `docker compose up -d` — start Postgres + pgvector + pgAdmin.
3. `npm install`
4. `npm run migrate` — apply schema.
5. `npx tsx src/cli/index.ts ingest --fixture <name>` — load a test fixture.
6. `npx tsx src/cli/index.ts compile` — render the vault.
7. Open `vault/topics/<demo-slug>.md` in Obsidian.

## Tests

- `npm test` — unit + integration suites
- `RUN_VOYAGE_TESTS=1 npm run test:voyage` — live Voyage API check
- `npm run lint` — ESLint
