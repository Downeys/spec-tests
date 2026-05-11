# oneBrain Composer

Personal AI venture-planning agent. Cloned per venture (one repo = one venture = isolated Postgres).

v1 wedge: investor-grade music licensing economics brief for a local-streaming-radio venture. Soft target 2026-07-31.

Source-of-truth docs (in `~/.gstack/projects/test2-gstack/`):

- Design doc: `downe-main-design-20260424-192625.md`
- Eng review decisions: `downe-main-eng-review-decisions-20260424-205940.md`
- Test plan: `downe-main-eng-review-test-plan-20260424-203301.md`

The decisions doc is the joint source of truth alongside the design doc — implementation should treat both as authoritative.

## Prerequisites

- Node 20.10+
- pnpm 9 (`corepack enable` if needed)
- Docker Desktop with WSL2 backend (Windows) or native Docker (macOS/Linux)
- Claude Desktop (chat client; downloads from claude.ai)
- Obsidian (read-only wiki viewer; optional until Phase 3)

## Setup

```bash
pnpm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY, TAVILY_API_KEY in .env
docker compose up -d postgres
pnpm migrate:up
```

## Phase 1 Windows Smoke Gate (T3 / CMT5)

Before continuing past Setup, run all five checks. Any failure = stop and fix; do not build on top of a broken platform.

1. **Postgres up via Docker Desktop WSL2.**
   ```bash
   docker compose up -d postgres
   docker compose ps
   ```
   Expect `onebrain-postgres` healthy. If not, check Docker Desktop's settings → Resources → WSL Integration is on.

2. **Migrations run cleanly against the dev DB.**
   ```bash
   pnpm migrate:up
   ```
   Expect `Migrations complete!`. Re-running should be a no-op.

3. **Testcontainers spins a fresh PG and migrations run inside it.**
   ```bash
   pnpm test tests/integration
   ```
   Expect all `schema.test.ts` cases to pass. First run will pull `postgres:16` (~30s).

4. **Lint enforces the A1 stdout rule.**
   ```bash
   pnpm lint
   ```
   Expect 0 errors. Try adding a `console.log("test");` to any file under `src/` and re-running — the lint should fail loudly.

5. **MCP server starts via stdio and the ping tool responds.**
   ```bash
   pnpm dev
   # In another terminal, send an MCP initialize + tools/call ping. Easiest path:
   # configure Claude Desktop (see "Wiring Claude Desktop" below) and call `ping`
   # from a chat. Expect `{ reply: "pong", echo: "...", ts: "..." }`.
   ```

If all five pass, the platform is good. Move on.

## Wiring Claude Desktop

`claude_desktop_config.json` lives at:

- **Windows (Microsoft Store install):** `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json` (UWP-virtualized — the standard `%APPDATA%\Claude\` path is NOT honored on Store installs)
- **Windows (standalone install):** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this entry (using forward slashes — works on Windows in JSON and sidesteps backslash escaping):

```json
{
  "mcpServers": {
    "onebrain-local-radio": {
      "command": "node",
      "args": ["C:/Users/downe/spec-tests/test2-gstack/dist/server.js"],
      "env": {
        "DATABASE_URL": "postgres://onebrain:onebrain@localhost:5432/onebrain",
        "VENTURE_NAME": "local-radio"
      }
    }
  }
}
```

`ANTHROPIC_API_KEY` and `TAVILY_API_KEY` are read from `.env` (loaded via dotenv with a path resolved from the script's own location, so it works regardless of the spawned process's cwd). Don't put them in `claude_desktop_config.json` — that file is more public than `.env`.

After editing the config, **fully quit Claude Desktop** (right-click tray → Quit; the X close doesn't kill it on Windows), then reopen.

### Critical-posture system prompt

For the agent to behave as designed (retrieve before claiming, cite every claim, engage with contradictions), paste the contents of `ONEBRAIN-CRITICAL-POSTURE.md` into Claude Desktop's project-level system prompt for this venture. The agent self-checks via `verify_critical_posture` on the first turn of every conversation; if it warns the prompt is missing/stale, this is the file to look at.

For local dev iteration, replace `node` + `dist/server.js` with `npx tsx` + `src/server.ts` so you don't need to rebuild on every change. Restart Claude Desktop after editing the config.

## Backups

Postgres holds the source of truth (every entry, every relation, every contradiction). Before a long session — or when you remember — run:

```bash
pnpm backup-db
```

That dumps the venture's database via `docker compose exec postgres pg_dump`, gzips on the host, and writes to `backup-${VENTURE_NAME}/onebrain-<timestamp>.sql.gz`. The backup directory is gitignored. To restore on a new machine: `gunzip -c backup-local-radio/onebrain-<ts>.sql.gz | docker compose exec -T postgres psql -U onebrain -d onebrain`.

(TODO 7 in `TODOS.md`: automate this on a schedule via Windows Task Scheduler so backups happen even when you forget.)

## Day-to-day

```bash
pnpm dev          # MCP server in watch mode (tsx)
pnpm test         # Unit + integration tests
pnpm test:watch   # TDD loop
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint (A1 enforcement included)
pnpm build        # Production build to dist/
```

## Per-venture cloning (Phase 4)

Phase 4 ships `bin/new-venture` which:

1. Picks a free Postgres port (probe-based with retry).
2. Writes `docker-compose.override.yml` with venture-scoped container names + chosen port.
3. Writes `.env` from `.env.example` with the venture name + DATABASE_URL pointing at the chosen port.
4. Prints a `claude_desktop_config.json` snippet to stdout for you to paste in.

The full clone test (Phase 4 Exit Gate B) instantiates a second venture, exercises the MCP tools end-to-end, then tears down — verifying no port collisions, separate Postgres DB, separate wiki dir, no entry cross-contamination.

## Status

- [x] Setup lane (this file's prerequisites + Phase 1 smoke gate)
- [ ] Phase 1: 4 MCP tools (`tavily_search`, `store_entry`, `query_entries`, `get_entry`)
- [ ] Phase 2: 5 MCP tools (`add_user_observation`, `traverse_provenance`, `flag_contradiction`, `verify_critical_posture`, `fetch_and_archive`)
- [ ] Phase 3: `compile_wiki` + wiki-compiler module + `[[entry-uuid]]` regenerability test
- [ ] Phase 4: licensing brief + clone test on Windows

See `TODOS.md` for v2 deferred items captured during the eng review.
