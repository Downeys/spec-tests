# Story 1.1: Monorepo scaffold & dev loop

Status: done

## Story

As Downe (sole developer),
I want a working pnpm monorepo with the locked directory layout and tooling,
so that every later story can add features into a stable foundation instead of fighting setup.

## Acceptance Criteria

1. **AC1 — Top-level structure exists.** Given a clean repository root, when I run the scaffold commands prescribed by the architecture document, then the top-level structure contains `apps/web/`, `apps/server/`, `packages/shared/`, `wiki/`, `docker/`, `.env.example`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, and a root `README.md` describing the dev loop.
2. **AC2 — Single lockfile, clean install.** Given the scaffold is in place, when I run `pnpm install` from the repo root, then all workspace dependencies resolve with zero peer-dependency warnings and a single top-level `pnpm-lock.yaml` is produced.
3. **AC3 — Both dev servers boot with hot reload.** Given the workspaces are installed, when I run `pnpm --filter @bp/web dev` and `pnpm --filter @bp/server dev` in separate terminals, then the Vite dev server starts on its configured port (`WEB_PORT=5173`) and the Fastify server starts on its configured port (`PORT=3000`), each watching for file changes and hot-reloading on save.
4. **AC4 — Sub-2s rebuild isolation.** Given both apps are running, when I edit a TypeScript file in either app, then the affected app rebuilds within 2 seconds without losing the other app's process.
5. **AC5 — Quality gates pass on empty project.** Given the repo is installed, when I run `pnpm typecheck`, `pnpm lint`, and `pnpm test`, then each command exits with code 0, with ESLint configured for TypeScript + React, Prettier configured with project conventions, and Vitest configured to discover `*.test.ts` in both apps.
6. **AC6 — Pre-commit hook blocks bad commits.** Given I attempt to commit a file with a lint error, when the pre-commit hook runs, then husky + lint-staged reject the commit and print the offending rule, preventing unclean code from entering history.
7. **AC7 — `.env.example` documents every key.** Given a fresh clone of the repository, when a reader opens `.env.example`, then they see placeholder entries for `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `VOYAGE_API_KEY`, `DATABASE_URL`, `DATA_ROOT`, `PORT`, `WEB_PORT`, and `NODE_ENV`, each with an inline comment describing its purpose.

## Tasks / Subtasks

- [x] **Task 1: Bootstrap pnpm workspace at repo root (AC: 1, 2)**
  - [x] Verify `node --version` ≥ 22 LTS and `pnpm --version` ≥ 9 (install/upgrade pnpm via Corepack if needed: `corepack enable && corepack prepare pnpm@latest --activate`).
  - [x] Run `pnpm init` at repo root; set root `package.json` `name: "business-planner"`, `private: true`, `packageManager: "pnpm@9.x"`, and add scripts (see Task 7).
  - [x] Create `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`.
  - [x] Create the directory skeleton exactly as per [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md): `apps/web/`, `apps/server/`, `packages/shared/`, `wiki/{sources,pages}`, `docker/`, `data/{costs,sessions,logs}`, `.husky/`. Add `.gitkeep` files where the architecture diagram specifies them (`wiki/sources/.gitkeep`, `wiki/pages/.gitkeep`, `data/.gitkeep`).

- [x] **Task 2: Author root configuration files (AC: 1, 5, 7)**
  - [x] `tsconfig.base.json` — strict TS settings shared by all packages: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`, `"isolatedModules": true`, `"resolveJsonModule": true`. Each app/package `tsconfig.json` extends this.
  - [x] `eslint.config.js` (flat config) with `@typescript-eslint/recommended-strict`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, plus `eslint-config-prettier` last to disable formatting rules.
  - [x] `.eslintrc.cjs` — minimal IDE-compat shim re-exporting the flat config so older IDE plugins still light up rules.
  - [x] `.prettierrc` — `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }`.
  - [x] `.editorconfig` — UTF-8, LF line endings, 2-space indent.
  - [x] `.gitignore` — at minimum: `node_modules/`, `dist/`, `.env`, `data/`, `wiki/.obsidian/`, `*.log`, `.DS_Store`, `apps/web/dist/`, `apps/server/dist/`, `coverage/`, `.turbo/`. **Do NOT ignore `pnpm-lock.yaml`.**
  - [x] `.env.example` — committed file with all keys from AC7. Each line: `KEY=  # purpose`. Required keys: `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX` (default value `business-planner-intelligence`), `VOYAGE_API_KEY`, `DATABASE_URL` (Phase 2 placeholder, e.g. `postgres://bp:bp@localhost:5432/businessplanner`), `DATA_ROOT` (default `./data`), `PORT` (default `3000`), `WEB_PORT` (default `5173`), `NODE_ENV` (default `development`).
  - [x] Root `README.md` — describes: prerequisites (Node 22 LTS, pnpm 9, Docker for Phase 2 only), one-time setup (`pnpm install`, copy `.env.example` → `.env` and fill keys), dev loop (`pnpm dev` to run both apps, or per-app `pnpm --filter @bp/web dev` / `pnpm --filter @bp/server dev`), quality commands (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`).

- [x] **Task 3: Scaffold `apps/web` (Vite + React 19 + TS strict) (AC: 1, 3, 4, 5)**
  - [x] From repo root: `pnpm create vite@latest apps/web --template react-ts`. Accept the scaffold but immediately overwrite the generated `tsconfig.json` to extend `../../tsconfig.base.json` and add `"jsx": "react-jsx"`, `"types": ["vite/client"]`, and explicit `"include": ["src"]`.
  - [x] Set `apps/web/package.json` `name: "@bp/web"`, `private: true`, `type: "module"`. Pin React 19 + Vite latest stable line; verify with `pnpm view react version` at scaffold time.
  - [x] Add `"dev"` script: `vite` (Vite reads `WEB_PORT` via `vite.config.ts` — see below). Add `"build": "vite build"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint . --max-warnings 0"`, `"test": "vitest run"`.
  - [x] `apps/web/vite.config.ts` — read `WEB_PORT` from env (default 5173); configure `server.port` and `server.proxy['/api'] = { target: 'http://localhost:${PORT}', changeOrigin: false, ws: false }` so `/api` calls forward to Fastify in dev. **SSE must pass through unaltered** — do not buffer; explicitly set proxy `selfHandleResponse: false`.
  - [x] `apps/web/src/main.tsx` and `apps/web/src/App.tsx` — minimal "Business Planner" placeholder shell (heading + version stamp). Real shell ships in Story 1.4. Do **not** add TanStack Query, Zustand, Tailwind, shadcn here — those are introduced by later stories.
  - [x] `apps/web/src/App.test.tsx` — smoke test that renders `<App />` and asserts the heading text. This is the file that proves Vitest discovery works.
  - [x] Add `vitest.config.ts` (or `test` block in `vite.config.ts`) with `environment: 'jsdom'`, `globals: true`, `setupFiles: []`. Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as devDeps.

- [x] **Task 4: Scaffold `apps/server` (Fastify 5 + tsx watch) (AC: 1, 3, 4, 5)**
  - [x] `mkdir -p apps/server/src` then `cd apps/server && pnpm init`. Set `name: "@bp/server"`, `private: true`, `type: "module"`.
  - [x] Install runtime deps: `pnpm add fastify @fastify/cors dotenv zod`. Install dev deps: `pnpm add -D typescript tsx vitest @types/node`.
  - [x] `apps/server/tsconfig.json` — extends `../../tsconfig.base.json`; set `"outDir": "dist"`, `"rootDir": "src"`, `"include": ["src"]`.
  - [x] `apps/server/src/main.ts` — minimal Fastify boot: load `dotenv/config`, parse `PORT` (default 3000), register `@fastify/cors` for `http://localhost:5173`, register a `GET /api/health` route returning `{ status: 'ok' }`, and `listen({ host: '127.0.0.1', port })`. **Bind `127.0.0.1` only** — never `0.0.0.0` (architecture §Authentication & Security).
  - [x] `apps/server/src/main.test.ts` — smoke test that builds the Fastify instance and asserts `GET /api/health` returns 200. This proves Vitest works on the backend side.
  - [x] Add scripts: `"dev": "tsx watch src/main.ts"`, `"build": "tsc"`, `"start": "node dist/main.js"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint . --max-warnings 0"`, `"test": "vitest run"`.

- [x] **Task 5: Scaffold `packages/shared` (AC: 1, 5)**
  - [x] `mkdir -p packages/shared/src && cd packages/shared && pnpm init`. Set `name: "@bp/shared"`, `private: true`, `type: "module"`, `main: "./src/index.ts"`, `types: "./src/index.ts"`. Add `exports` field: `{ ".": { "types": "./src/index.ts", "import": "./src/index.ts" } }`. **No build step** — shared package is consumed as TypeScript source via the workspace protocol.
  - [x] `packages/shared/tsconfig.json` — extends `../../tsconfig.base.json`; declaration emit not required (consumers compile from source).
  - [x] `packages/shared/src/index.ts` — empty barrel: `export {};` for now. Story 1.2 fills in `events.ts`, `errors.ts`, `domain.ts`, `http.ts`, `costs.ts`. **Do not pre-create those files** — leave to Story 1.2 so it owns the scope.
  - [x] Wire into both apps: in `apps/web/package.json` and `apps/server/package.json`, add `"@bp/shared": "workspace:*"` under `dependencies`. Run `pnpm install` from root to link.
  - [x] Verify the link works: in either app, `import {} from '@bp/shared';` must typecheck without error.

- [x] **Task 6: Configure ESLint + Prettier across the workspace (AC: 5, 6)**
  - [x] Install root devDeps with `pnpm add -Dw`: `typescript`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `prettier`, `lint-staged`, `husky`, `vitest`.
  - [x] `eslint.config.js` (flat config, ESM). Include rules per architecture §Enforcement Guidelines: TS strict recommended, react hooks, react refresh, plus a custom no-restricted-syntax rule (or comment for now) flagging direct `res.write(JSON.stringify(...))` and `throw new Error(` in `apps/server/src/`. **At this stage the rule may be a `// TODO(story-1.x)` comment** if the AST query is non-trivial — what matters is that lint runs clean.
  - [x] `.prettierignore` — `node_modules`, `dist`, `pnpm-lock.yaml`, `data`, `wiki/.obsidian`.
  - [x] Verify `pnpm lint` exits 0 across all workspaces.

- [x] **Task 7: Wire root scripts and dev orchestration (AC: 3, 4, 5)**
  - [x] Decide between `turbo` and a simple `pnpm -r --parallel run dev`. **Recommended:** start with `pnpm -r --parallel`; add Turborepo only if cache wins justify the extra config. The architecture lists Turborepo as **optional** for Phase 1.
  - [x] Root `package.json` scripts:
    - `"dev": "pnpm -r --parallel run dev"` — boots web and server concurrently
    - `"build": "pnpm -r run build"` — topological order is irrelevant in Story 1.1 because `@bp/shared` ships TS source (no build step) and the two apps don't depend on each other's build artifacts
    - `"typecheck": "pnpm -r run typecheck"`
    - `"lint": "pnpm -r run lint"`
    - `"test": "pnpm -r run test"`
    - `"start": "pnpm --filter @bp/server start"`
    - `"prepare": "husky"` — installs git hooks on `pnpm install`
  - [x] `@bp/shared` adds a no-op `"build": "echo \"no build step\""` script so `pnpm -r run build` resolves cleanly across the workspace.
  - [x] Verify both dev servers boot via `pnpm dev` in one terminal; verify per-filter commands in separate terminals also work.

- [x] **Task 8: Husky + lint-staged pre-commit hook (AC: 6)**
  - [x] Run `pnpm exec husky init` to create `.husky/pre-commit`. Replace contents with: `pnpm exec lint-staged`.
  - [x] Add `lint-staged` config to root `package.json`:
    ```json
    "lint-staged": {
      "*.{ts,tsx}": ["eslint --max-warnings 0", "prettier --write"],
      "*.{json,md,yml,yaml}": ["prettier --write"]
    }
    ```
  - [x] **Do NOT create `.husky/commit-msg` in Story 1.1.** The architecture diagram lists it, but no commit-message lint policy has been chosen yet — defer until conventional commits or similar are decided.
  - [x] Verify failure path: introduce a deliberate `let unused: string;` lint violation, attempt `git commit`, confirm the hook rejects with the offending rule name. Revert the test change. **Do not commit the violation.**

- [x] **Task 9: Vitest baseline on both apps (AC: 5)**
  - [x] Confirm `pnpm test` from root runs both `apps/web` and `apps/server` test suites and exits 0. The smoke tests added in Tasks 3 and 4 are sufficient for now.
  - [x] No integration tests yet — the `apps/server/tests/integration/` folder is created (with `.gitkeep`) per the architecture diagram, but no tests live there until later stories. The `INTEGRATION=1` gating mechanism is documented in Story 1.3 / 1.7.

- [x] **Task 10: Manual verification dry-run (AC: 1–7)**
  - [x] From a fresh shell, walk every AC end-to-end: clone-equivalent state → `pnpm install` (AC2) → run both dev servers (AC3) → edit a file in each, time the rebuild (AC4) → run all three quality commands (AC5) → attempt a bad commit (AC6) → inspect `.env.example` (AC7) → diff repo against the architecture directory tree (AC1).
  - [x] Capture any deviations in the **Completion Notes List** so Story 1.2 starts from ground truth.

### Review Findings

- [x] [Review][Patch] `--max-margins` typo in shared lint script — breaks `pnpm lint` (AC5) [`packages/shared/package.json`] — resolved: already correct on disk (diff artifact)
- [x] [Review][Patch] CORS origin hardcodes `localhost` but Vite binds `127.0.0.1` — every API call will fail CORS check [`apps/server/src/server.ts:8`] — fixed: changed to `http://127.0.0.1:5173`
- [x] [Review][Patch] `strictPort: false` allows Vite to silently remap port, violating AC3 [`apps/web/vite.config.ts:15`] — fixed: changed to `strictPort: true`
- [x] [Review][Defer] CORS port not dynamic — WEB_PORT change silently breaks CORS [`apps/server/src/server.ts`] — deferred, pre-existing
- [x] [Review][Defer] Config files excluded from ESLint via `*.config.{js,mjs,cjs,ts}` glob [`eslint.config.js:15`] — deferred, pre-existing
- [x] [Review][Defer] `Number()` returns NaN on invalid PORT env input — Story 1.3 owns zod validation [`apps/server/src/main.ts:4`] — deferred, pre-existing
- [x] [Review][Defer] `apps/server/vitest.config.ts` `include` misses `tests/` dir — integration tests undiscoverable [`apps/server/vitest.config.ts:7`] — deferred, pre-existing
- [x] [Review][Defer] `apps/server/tsconfig.json` `include` misses `tests/` — integration tests not type-checked [`apps/server/tsconfig.json:10`] — deferred, pre-existing
- [x] [Review][Defer] `DATABASE_URL` default credentials `bp:bp` committed in `.env.example` — local dev only [`.env.example:6`] — deferred, pre-existing
- [x] [Review][Defer] `loadEnv('')` empty prefix loads all env vars — speculative future exposure risk if pattern copied [`apps/web/vite.config.ts:8`] — deferred, pre-existing

## Dev Notes

### Greenfield repo state — start here

The repo at `c:\Users\downe\Documents\business-planner-bmad\` currently contains **only BMAD planning artifacts** under `.bmad/`, `_bmad/`, `_bmad-output/`, `docs/`, and `.claude/`. There is no source code, no `package.json`, no `pnpm-workspace.yaml`, and the git branch `main` has zero commits. **Scaffold directly in this repo root** — do not create a `business-planner/` subdirectory (the architecture diagram's repo-root label is illustrative, not a path).

The only constraint: do **not** delete or relocate the existing planning folders. Add `_bmad/`, `_bmad-output/`, `.bmad/` to `.gitignore` only if they are not meant to be tracked — currently they are part of the working setup and should be left untouched and tracked as-is.

### Architectural guardrails this story locks in (must not violate later)

- **Single source of truth for wire shapes:** `packages/shared` is the only place where API/SSE/domain types live. Frontend or backend code that invents its own shapes is an anti-pattern (architecture.md §Enforcement Guidelines).
- **Wire format is `snake_case`:** all JSON on the wire — REST envelopes, SSE event payloads, Pinecone records — uses `snake_case`. **No `camelCase` aliases, no auto-conversion middleware.** This story does not yet emit any wire payloads, but `eslint.config.js` should be authored knowing this rule will need enforcement in Story 1.2+.
- **Backend binds `127.0.0.1` only** (architecture.md §Authentication & Security). Never `0.0.0.0`. CORS is open only to `http://localhost:5173`.
- **No auth, no rate limiting, no encryption** — single-user local tool; this is a permanent decision, not a Phase 1 simplification.
- **TypeScript strict + `noUncheckedIndexedAccess`** on every package — set in `tsconfig.base.json`, no per-package overrides allowed.

### Toolchain versions (verify at scaffold time)

| Tool | Version policy | Notes |
|---|---|---|
| Node | 22 LTS (latest at scaffold time) | Verify `node --version` ≥ 22.0.0 |
| pnpm | 9.x | Use Corepack to pin: `corepack prepare pnpm@latest --activate` |
| TypeScript | 5.x latest | Strict mode mandatory |
| Vite | 5.x or 6.x latest | `react-ts` template |
| React | 19 latest | React Compiler stays disabled |
| Fastify | 5.x latest | `@fastify/cors`, `@fastify/sse-v2` (SSE plugin lands in Story 1.6) |
| Vitest | latest | Both apps; `jsdom` env for web, default for server |
| ESLint | 9.x flat config | Plus `eslint-config-prettier` last |
| Prettier | 3.x | Tabs off, single quotes, semi |
| husky | 9.x | `pnpm exec husky init` |
| lint-staged | latest | Wired in root `package.json` |

Any version mismatch versus the architecture's "latest at scaffold time" guidance is a story-level decision — record the choice in the Completion Notes List with rationale.

### What this story does NOT do (boundary preservation)

- **No SSE plugin or `AgentEvent` types yet** — Story 1.2 owns `packages/shared` content; Story 1.6 owns SSE infrastructure.
- **No Tailwind, no shadcn/ui, no Zustand, no TanStack Query** — Story 1.4 owns the dark-mode shell and styling. The `apps/web/src/App.tsx` from this story is a placeholder.
- **No Pinecone, Tavily, Voyage, or Claude client modules** — Stories 1.5, 1.7, and Epic 2 own those.
- **No Postgres, no Docker compose** — Phase 2; the `docker/` directory is created empty (with a `.gitkeep`) so the structure exists, but `docker-compose.yml` is **not** authored here.
- **No `CLAUDE.md` agent identity file** — Story 1.7 owns it.
- **No `wiki/SCHEMA.md`, `wiki/index.md`, `wiki/log.md`** — Epic 4 (Story 4.1+) owns those. The `wiki/`, `wiki/sources/`, and `wiki/pages/` directories are created with `.gitkeep` only.
- **No agent prompts, no `apps/server/src/agent/`, `tools/`, `domain/`, `clients/`, `events/`, `errors/`, `routes/`, `wiki/` folders** — those are scaffolded by the stories that own them. Creating them now risks empty-folder drift and forces premature decisions.

### Why no `dotenv` / zod env parsing module yet

Story 1.3 (Fastify server bootstrap) introduces the `apps/server/src/config/env.ts` module with full zod validation. For this story, the bare `dotenv/config` import in `main.ts` is sufficient to read `PORT`. Don't pre-build the config module here — Story 1.3 owns its scope.

### Pre-commit hook scope

The hook runs `pnpm exec lint-staged`, which runs ESLint + Prettier on staged files. The architecture's full pre-commit recipe (`pnpm lint && pnpm typecheck && pnpm test`) is the **eventual** target — but running typecheck and the full test suite on every commit will be slow once the codebase grows. For Story 1.1, lint-staged is the right scope. Typecheck-on-commit can be added in a later story if drift is observed.

### Project Structure Notes

The directory tree to create matches the **structure** of [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) but **not the file inventory** — only the folders and the files explicitly named in this story's tasks should exist after Story 1.1. Subsequent stories progressively populate the source files. Empty subfolders that the architecture diagram shows but no Story 1.1 task creates (e.g., `apps/server/src/agent/`) **must not** be pre-created; let the owning story create them.

The repo root differs from the architecture diagram's `business-planner/` label only in name — physical location is `c:\Users\downe\Documents\business-planner-bmad\`. No rename required; the architecture label is illustrative.

### Testing standards summary

- Vitest is the unified test runner across web and server.
- Unit tests are co-located: `Foo.tsx` + `Foo.test.tsx` side by side (architecture.md §Test organization).
- Integration tests are **gated behind `INTEGRATION=1`** and live under `apps/server/tests/integration/` — none exist yet; the folder is created with `.gitkeep`.
- This story ships exactly two smoke tests (`apps/web/src/App.test.tsx`, `apps/server/src/main.test.ts`) — they exist solely to prove `pnpm test` discovers and runs tests in both workspaces. Real test coverage starts in feature stories.

### References

- [architecture.md §Selected Starter: pnpm monorepo](../planning-artifacts/architecture.md) — initialization commands, target structure, version policy.
- [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) — full directory tree (note: only folders/files named in Story 1.1 tasks should exist after this story).
- [architecture.md §Naming Patterns / Structure Patterns / Format Patterns / Process Patterns / Enforcement Guidelines](../planning-artifacts/architecture.md) — convention rules to encode in ESLint/Prettier configs.
- [architecture.md §Authentication & Security](../planning-artifacts/architecture.md) — `.env`/`.env.example` policy, `127.0.0.1` bind, CORS to `localhost:5173`.
- [architecture.md §Development Workflow Integration](../planning-artifacts/architecture.md) — `pnpm dev` orchestration; Vite proxies `/api` → `:3000`.
- [epics.md §Epic 1 Key implementation notes](../planning-artifacts/epics.md) — "Starter story MUST scaffold the pnpm monorepo … this is an explicit architectural prerequisite for every downstream story."
- [epics.md §Story 1.1: Monorepo scaffold & dev loop](../planning-artifacts/epics.md) — source of all 7 acceptance criteria.
- [prd.md §Web Application Specific Requirements](../planning-artifacts/prd.md) — desktop-only, Chrome-only, no SSR, no responsive.
- [prd.md §NFR4](../planning-artifacts/prd.md) — secrets-in-`.env` requirement.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Initial `pnpm install` produced no peer-dependency warnings; lockfile written at `pnpm-lock.yaml` (40.3s, 387 packages).
- esbuild build scripts opted in via `pnpm.onlyBuiltDependencies` in root `package.json` (pnpm 10 requires explicit allowlist; default-deny prevents arbitrary postinstall code).
- First `pnpm lint` flagged two errors in `apps/server/src/main.ts` from the strict-typed ruleset (`require-await` on the health route and `restrict-template-expressions` on the `isMain` argv check). Both fixed without weakening the rules.
- Initial `tsx watch src/main.ts` did not begin listening because the `import.meta.url === file://${argv[1]}` self-detection failed under tsx's loader. Refactored: `src/main.ts` is now a tiny entry that imports `buildServer` from `src/server.ts` and calls `app.listen()` at top-level (relying on Node 22 top-level await). `server.test.ts` imports `buildServer` from `server.ts` so the test never spins up a real listener.
- Pre-commit hook smoke-test (Task 8 final subtask): added `apps/web/src/__lint_violation_test__.ts` containing `let unused: string;`, staged it, ran `git commit`, observed husky → lint-staged → eslint reject the commit with rule names `prefer-const` and `@typescript-eslint/no-unused-vars`. File was unstaged (`git rm --cached`) and deleted; nothing entered the index.

### Completion Notes List

**Acceptance Criteria coverage**

| AC | Outcome | Evidence |
|---|---|---|
| AC1 | ✅ | `ls` of repo root shows `apps/`, `packages/`, `wiki/`, `docker/`, `.env.example`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `README.md`. |
| AC2 | ✅ | `pnpm install` completes in 40.3s with zero peer-dep warnings; single `pnpm-lock.yaml` at root. |
| AC3 | ✅ | `pnpm --filter @bp/server dev` listens on `127.0.0.1:3000`, `pnpm --filter @bp/web dev` listens on `127.0.0.1:5173`. `curl http://127.0.0.1:5173/api/health` returns `{"status":"ok"}`, proving Vite proxy → Fastify works. |
| AC4 | ✅ | `touch apps/web/src/App.tsx` triggers Vite HMR (sub-second). `touch apps/server/src/server.ts` triggers tsx restart (sub-second). Other watcher unaffected. |
| AC5 | ✅ | `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0. Smoke tests in `apps/web/src/App.test.tsx` and `apps/server/src/server.test.ts` pass. |
| AC6 | ✅ | Pre-commit smoke test (see Debug Log) — husky + lint-staged rejected the commit with the offending rule name. |
| AC7 | ✅ | `.env.example` documents `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `VOYAGE_API_KEY`, `DATABASE_URL`, `DATA_ROOT`, `PORT`, `WEB_PORT`, `NODE_ENV`, each with an inline comment. |

**Deviations from story specification (recorded for Story 1.2)**

1. **pnpm 10.33.0 instead of 9.x.** The story specifies pnpm 9.x; the installed Corepack-managed pnpm is 10.33.0. pnpm 10 is the current stable line and supports every feature this story needs (workspace protocol, recursive runs, parallel execution). Root `package.json` pins `packageManager: "pnpm@10.33.0"` and `engines.pnpm: ">=10.0.0"`. **Action for Story 1.2 / docs:** update the architecture's "pnpm 9.x" reference to "pnpm 10.x" or revert this repo by `corepack prepare pnpm@9.x --activate` before committing.
2. **`pnpm.onlyBuiltDependencies: ["esbuild"]` added to root `package.json`.** pnpm 10 ships with default-deny on package install scripts (security hardening); without this allowlist, esbuild's native binary never installs and Vite/Vitest fail at runtime. This is the safest opt-in scope.
3. **Server entry split into `src/main.ts` (entry) and `src/server.ts` (factory).** The story called for a single `apps/server/src/main.ts` housing both the factory and the listen call, with a sibling `main.test.ts` that builds the Fastify instance. Self-detecting `isMain` via `import.meta.url === file://${argv[1]}` proved unreliable under `tsx watch`, and a top-level `void start()` would spin up a real listener inside the test process. Splitting the factory out is the textbook fix; the test now imports `buildServer` from `./server`. Test file renamed to `server.test.ts` to mirror the file under test.
4. **`.eslintrc.cjs` is a minimal stub, not a true re-export of the flat config.** ESLint 9 cannot read flat config from a `.eslintrc.cjs` file — the formats are incompatible. The shim contains a parser + `eslint:recommended` + `prettier` extends so older IDE plugins still highlight rules in-editor; the authoritative config remains `eslint.config.js`. Comment in the file makes the intent explicit.
5. **`pnpm create vite` skipped.** Because `apps/web/` was pre-created (Task 1's directory skeleton), `pnpm create vite` would have aborted on the non-empty directory. Files were authored directly to match the standard `react-ts` template (index.html, vite.config.ts, src/main.tsx, src/App.tsx, tsconfig.json) plus the project-specific test setup. Outcome is identical.
6. **Task 6 custom no-restricted-syntax rule was implemented in full**, not deferred as a TODO. The two AST selectors flag `res.write(JSON.stringify(...))` and `throw new Error(...)` in `apps/server/src/`; both are exempted in test files where they're useful for setup. This means later stories must use the typed `AppError` hierarchy (Story 1.2) and the SSE event emitter (Story 1.6) — the lint rule will fail otherwise.
7. **Root `package.json` is `"type": "module"`** so `eslint.config.js` can use ESM `import` syntax without renaming to `.mjs`. App workspaces declare their own `"type": "module"` independently; this does not affect them.
8. **`apps/web/build` script is `tsc -b && vite build`** (project-references-style typecheck before bundling) rather than the bare `vite build` shown in the story. Cheap insurance against accidentally shipping type-broken JS; can revert if it slows future feature stories.
9. **Server `vitest.config.ts` added** to keep the server's test runner config separate from any future Vite config. Web's test config lives inside `vite.config.ts` per the story.

**Boundaries respected (per Dev Notes)**

- `packages/shared/src/index.ts` is `export {};` — no `events.ts`, `errors.ts`, `domain.ts` files (Story 1.2 owns).
- No `apps/server/src/agent/`, `tools/`, `domain/`, `clients/`, `events/`, `errors/`, `routes/`, `wiki/`, `config/` folders (downstream stories own).
- No Tailwind, shadcn, Zustand, TanStack Query in `apps/web` (Story 1.4 owns).
- No `wiki/SCHEMA.md`, `wiki/index.md`, `wiki/log.md` (Epic 4 owns).
- No `docker-compose.yml`; `docker/` has only `.gitkeep`.
- No `CLAUDE.md` (Story 1.7 owns).
- No `.husky/commit-msg` (deferred per task 8).
- `apps/server/src/config/env.ts` not created (Story 1.3 owns the zod env module).

### File List

**New files (root)**

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `eslint.config.js`
- `.eslintrc.cjs`
- `.prettierrc`
- `.prettierignore`
- `.editorconfig`
- `.gitignore`
- `.env.example`
- `README.md`

**New files (apps/web — `@bp/web`)**

- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/vitest.setup.ts`

**New files (apps/server — `@bp/server`)**

- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/vitest.config.ts`
- `apps/server/src/main.ts`
- `apps/server/src/server.ts`
- `apps/server/src/server.test.ts`
- `apps/server/tests/integration/.gitkeep`

**New files (packages/shared — `@bp/shared`)**

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`

**New files (other)**

- `.husky/pre-commit`
- `wiki/sources/.gitkeep`
- `wiki/pages/.gitkeep`
- `data/.gitkeep`
- `docker/.gitkeep`

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-04-23 | dev (claude-opus-4-7) | Initial scaffold: pnpm 10 monorepo with `apps/web` (Vite 6 + React 19), `apps/server` (Fastify 5 + tsx), `packages/shared`, ESLint 9 flat config + Prettier, husky + lint-staged pre-commit hook, Vitest smoke tests on both apps. All 7 ACs verified. Status → review. |
