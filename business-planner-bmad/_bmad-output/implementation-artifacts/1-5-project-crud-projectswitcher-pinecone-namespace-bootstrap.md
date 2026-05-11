# Story 1.5: Project CRUD + ProjectSwitcher + Pinecone namespace bootstrap

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Downe,
I want to create, list, switch between, and soft-delete projects, each with its own Pinecone namespace,
so that project isolation — the hard boundary underlying every later epic — works from day one.

## Acceptance Criteria

1. **AC1 — `POST /api/projects` creates project + bootstraps namespace.** Given the server is running and `PINECONE_API_KEY` is configured, when I `POST /api/projects` with `{ "name": "radio-app", "description": "..." }`, then the server: (a) generates a UUID v4 server-side, (b) persists the record to the JSON store at `${DATA_ROOT}/projects.json` (Postgres path is Phase 2 — feature-flagged off this story), (c) ensures the Pinecone index `business-planner-intelligence` exists, creating a serverless 1024-d cosine index in `aws/us-east-1` if absent (idempotent — already-exists errors swallowed), and (d) returns `200` with `{ project_id, name, description, namespace, created_at }` where `namespace === project_id`.

2. **AC2 — `GET /api/projects` returns active list sorted by created_at desc.** Given projects exist, when I `GET /api/projects`, then the response contains every project where `deleted_at` is unset as a top-level array `[Project, Project, ...]` sorted by `created_at` descending. Per architecture format §API response envelopes, the response IS the array — no `{ data: [...] }` wrapper.

3. **AC3 — `DELETE /api/projects/:project_id` soft-deletes.** Given a project exists, when I `DELETE /api/projects/:project_id`, then the project record is updated with `deleted_at` set to the current ISO-8601 UTC timestamp, the response is `204 No Content`, and subsequent `GET /api/projects` calls exclude that project. The Pinecone namespace is **retained** (not purged) so historical corpora remain accessible — this matches the product brief's "older corpora remain accessible" requirement.

4. **AC4 — Reserved namespaces rejected.** Given any project create or delete call, when the supplied or stored `project_id` would equal a reserved namespace token (`__wiki__` is reserved per Epic 4 Story 4.3, plus any name starting with double underscore `__`), then the server rejects the request with `400` and `AppError('invalid_input', 'reserved namespace', { status: 400 })`. Project IDs are server-generated UUIDs so this is defensive — but the guard ships now to lock the contract before Epic 4 lands.

5. **AC5 — First-launch modal blocks until project selected.** Given the web app loads with no `project_id` in session storage, when the app mounts, then a non-dismissible modal (shadcn `Dialog`) prompts me to either select an existing project from the fetched list or create a new one inline; the chat input remains `disabled` and the status bar continues to show "No project selected" until a project is chosen.

6. **AC6 — ProjectSwitcher dropdown in top-left header area.** Given at least one project exists and one is selected, when I view the app, then a `ProjectSwitcher` (shadcn `Popover`-anchored dropdown button) is mounted in a new top-left header bar showing the active project name; clicking it opens a list of all active projects (sorted as in AC2), a divider, and a "+ New project…" entry at the bottom. Selecting an existing project switches; clicking "+ New project…" opens the same create dialog as AC5.

7. **AC7 — Project switch atomically resets scoped state.** Given I am in project A, when I select project B in the `ProjectSwitcher`, then within one render tick: (a) the chat history clears to the empty placeholder, (b) all five sidebar tabs reset to their empty-state copy, (c) status-bar gauges reset to the placeholder values from Story 1.4, (d) any in-flight requests for project A are abandoned (no-op for this story since SSE/streaming land in 1.6/1.7 — but the project-id swap must precede any future fetch issuance), and (e) the new `project_id` is persisted to `localStorage` under key `bp.session.project_id`.

8. **AC8 — Selection persists across page reload.** Given I have selected a project, when I reload the page, then the app reads `bp.session.project_id` from `localStorage`, validates it against the fetched `GET /api/projects` list, and: if found → activates it without showing the first-launch modal; if not found (e.g., deleted in another window) → clears the stale id and shows the first-launch modal.

9. **AC9 — Chat input enables only when project selected.** Given a project is active, when I view the input bar, then the `Textarea` is `disabled={false}`, placeholder reads "Message the agent…", and the `if (disabled) return;` guard inside `handleKeyDown` (added this story to close the deferred 1.4 review item) prevents any submit when the prop is `true`.

10. **AC10 — Pinecone namespace bootstrap is verified, not eager.** Given a new project is created, when I inspect the Pinecone index via `describeIndexStats`, then the index exists with the configured spec but the namespace `${project_id}` is **not** materialized yet (Pinecone serverless creates namespaces lazily on first upsert). The story's contract is: namespace **name is reserved** (UUID, no collision possible), `clients/pinecone.ts` exposes a `namespaceFor(projectId)` helper that later epics use, and the integration test asserts the index spec rather than asserting an empty namespace exists. **This is a deliberate refinement of the epic AC** — see Dev Notes §"Pinecone namespace lifecycle" for rationale.

11. **AC11 — Server tests pass.** Given `pnpm --filter @bp/server test`, then unit tests cover: `projectService` JSON persistence (create, list-excludes-deleted, soft-delete, reserved-namespace rejection); `routes/projects` request/response envelopes and error mapping; and an integration-tier test (`tests/integration/pinecone.test.ts`, gated by `INTEGRATION=1` per architecture §Test organization) that creates a project, asserts the index exists, and tears down test projects. Default `pnpm test` stays offline — Pinecone tests only run when `INTEGRATION=1` and `PINECONE_API_KEY` are both set.

12. **AC12 — Web tests pass.** Given `pnpm --filter @bp/web test`, then RTL tests cover: first-launch modal renders when no `project_id` is stored, modal closes on create or select, `ProjectSwitcher` button shows active project name and lists alternatives, switch action calls the session-store action, and chat input transitions from disabled to enabled on selection. TanStack Query is exercised with a mocked `fetch` (no network).

13. **AC13 — Repo gate green.** Given I run `pnpm typecheck && pnpm lint && pnpm test` from the repo root, then all three exit `0`. The `pnpm dev` server starts without error; `POST /api/projects` succeeds end-to-end against a live `PINECONE_API_KEY` (manual smoke step — not gated in CI).

## Tasks / Subtasks

- [ ] **Task 1: Extend `packages/shared` with project HTTP shapes (AC: 1, 2, 3, 4)**
  - [ ] Add to `packages/shared/src/http.ts`:
    ```ts
    export interface CreateProjectRequest {
      name: string;
      description: string;
    }
    export type CreateProjectResponse = Project;
    export type ListProjectsResponse = Project[];
    ```
    Import `Project` from `./domain` at the top of `http.ts`.
  - [ ] Verify `Project` in `packages/shared/src/domain.ts` already has `project_id`, `name`, `description`, `namespace`, `created_at`, `deleted_at?` — it does (Story 1.2). No changes to `domain.ts`.
  - [ ] No new error code needed — `invalid_input` already exists in `errors.ts` for AC4 reserved-namespace rejection.
  - [ ] Run `pnpm --filter @bp/shared build` to refresh the declaration files consumed by `apps/server` and `apps/web`.

- [ ] **Task 2: Install dependencies (AC: 1, 5, 6, 12)**
  - [ ] Server: from `apps/server/`, run `pnpm add @pinecone-database/pinecone uuid` and `pnpm add -D @types/uuid`. Pin Pinecone to `"@pinecone-database/pinecone": "^4"` per architecture §Vector store decision (the v4.x line is the documented choice; do **not** upgrade to v5/v6/v7 in this story even though newer versions exist — see Dev Notes §"Pinecone SDK version").
  - [ ] Web: from `apps/web/`, run `pnpm add @tanstack/react-query @radix-ui/react-popover` and `pnpm dlx shadcn@latest add dialog popover --yes`. The dialog primitive may already be partially present via Sheet (both wrap Radix Dialog) — `dialog.tsx` is a separate component; add it explicitly.
  - [ ] Inspect generated `apps/web/src/components/ui/dialog.tsx` and `popover.tsx` after the CLI runs: replace any `import { cn } from '@/lib/utils'` with `import { cn } from '@/lib/cn'` (same reason as Story 1.4 — `lib/utils` is forbidden, `lib/cn` is canonical). Also convert any `React.ElementRef` to `React.ComponentRef` to match the Story 1.4 React 19 pattern.

- [ ] **Task 3: Pinecone client adapter `apps/server/src/clients/pinecone.ts` (AC: 1, 4, 10)**
  - [ ] Create `apps/server/src/clients/` directory with `index.ts` barrel.
  - [ ] Create `apps/server/src/clients/pinecone.ts` exporting:
    - `createPineconeClient(env: Env): Pinecone` — constructs the SDK client from `env.PINECONE_API_KEY`.
    - `ensureIndex(client, indexName, opts?: { dimension?: number; metric?: 'cosine'; cloud?: 'aws'; region?: string }): Promise<void>` — calls `client.describeIndex(indexName)`; if the call throws `404`/`PineconeNotFoundError`, calls `createIndex({ name, dimension: 1024, metric: 'cosine', spec: { serverless: { cloud: 'aws', region: 'us-east-1' } } })` and polls `describeIndex` until `status.ready === true` (max 60s, 2s interval). Idempotent — already-exists errors are swallowed.
    - `namespaceFor(projectId: ProjectId): string` — returns the projectId verbatim. Centralizes the contract: namespace = projectId. Future epics import this rather than concatenating strings.
    - `RESERVED_NAMESPACES = new Set(['__wiki__'])` plus a predicate `isReservedNamespace(name: string): boolean` that returns `true` if `name` starts with `__` or is in the reserved set. Export both.
  - [ ] On any Pinecone SDK throw, wrap into `AppError('pinecone_write_failure', message, { status: 502, retryable: true, cause: err })` for write paths and `AppError('pinecone_read_failure', message, { status: 502, retryable: true, cause: err })` for read paths (per architecture §Error envelope and §Per-dependency resilience).
  - [ ] **Do NOT** create a "namespace bootstrap" call that writes a placeholder vector. Pinecone serverless does not support empty namespaces — namespaces materialize on first real upsert. The story's "namespace bootstrap" contract is: index exists + projectId reserved as the namespace name. See Dev Notes §"Pinecone namespace lifecycle".
  - [ ] Co-locate `pinecone.test.ts` for unit tests of the predicate + `namespaceFor` (no network). Live integration test goes under `apps/server/tests/integration/pinecone.test.ts` (Task 7).

- [ ] **Task 4: ProjectService domain module (AC: 1, 2, 3, 4)**
  - [ ] Create `apps/server/src/domain/` directory with `index.ts` barrel.
  - [ ] Create `apps/server/src/domain/projectService.ts` exporting `createProjectService(opts: { dataRoot: string; pinecone: Pinecone; pineconeIndex: string }): ProjectService` returning an object with `create`, `list`, `softDelete` methods. The factory pattern (not a singleton) keeps tests injectable per architecture §State Management.
  - [ ] Internal store path: `${dataRoot}/projects.json`. On startup, the service ensures the file exists (`{ "projects": [] }` if missing). All writes go through the same `withFileLock` helper to avoid lost-update race during concurrent requests — use a simple mutex (`async-mutex` is not needed; a `Promise` chain queue inside the service instance is sufficient since this is a single-process server).
  - [ ] **Atomic write pattern (NFR7 echo):** write to `projects.json.tmp` then `fs.rename` to `projects.json`. Never partial writes.
  - [ ] `create({ name, description })`:
    1. Validate `name` is a non-empty trimmed string (1-100 chars), `description` is a string (0-500 chars). Throw `AppError('invalid_input', ..., { status: 400 })` on violation.
    2. Generate `project_id` via `uuid.v4()` server-side.
    3. Check `isReservedNamespace(project_id)` (defensive — UUID v4 cannot start with `__`, but the check belongs at the boundary).
    4. Call `ensureIndex(pinecone, pineconeIndex)`. If it throws, propagate the wrapped `AppError` — do NOT persist the project record (atomic create: index ready before the row lands).
    5. Build `Project` with `created_at = new Date().toISOString()` (cast via `as IsoUtcTimestamp` — branded types have no runtime, see deferred-work.md note from Story 1.2).
    6. Append to the JSON store, atomic write.
    7. Return the new `Project`.
  - [ ] `list()`: read JSON store, filter out records where `deleted_at` is set, sort by `created_at` descending (string compare works for ISO-8601 UTC), return the array.
  - [ ] `softDelete(projectId)`: read store; if record not found, throw `AppError('not_found', ..., { status: 404 })`; if already deleted, throw `AppError('not_found', 'project already deleted', { status: 404 })`; else set `deleted_at = new Date().toISOString()` and write atomically. Returns `void`.
  - [ ] Co-locate `projectService.test.ts` using a temp-dir `dataRoot` per test (`os.tmpdir() + crypto.randomUUID()`); mock the Pinecone client with a stub object exposing `describeIndex`/`createIndex`. Test all four branches above (success, reserved-namespace rejection, validation failure, soft-delete excludes from list).

- [ ] **Task 5: Routes `apps/server/src/routes/projects.ts` (AC: 1, 2, 3, 11)**
  - [ ] Create `apps/server/src/routes/projects.ts` exporting `registerProjectsRoute(app, opts: { service: ProjectService })`.
  - [ ] Use Fastify's JSON Schema validation for `POST /api/projects` body — define inline:
    ```ts
    const createBodySchema = {
      type: 'object',
      required: ['name', 'description'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: 'string', maxLength: 500 },
      },
    } as const;
    ```
  - [ ] `POST /api/projects` → `await service.create(req.body)` → `reply.status(201).send(project)`. Validation errors thrown by Fastify map through the existing `errorHook` to the shared `ErrorEnvelope` shape.
  - [ ] `GET /api/projects` → `await service.list()` → `reply.send(projects)`.
  - [ ] `DELETE /api/projects/:project_id` → params schema `{ type: 'object', required: ['project_id'], properties: { project_id: { type: 'string', format: 'uuid' } } }` → `await service.softDelete(req.params.project_id)` → `reply.status(204).send()`.
  - [ ] Register inside `apps/server/src/routes/index.ts`:
    ```ts
    import { registerProjectsRoute } from './projects.js';
    // inside registerRoutes(app, opts):
    registerProjectsRoute(app, { service: opts.projectService });
    ```
  - [ ] Update `RoutesOptions` interface to include `projectService: ProjectService`. Update `buildApp.ts` to construct the Pinecone client + ProjectService at boot and pass them through. Construction order: `createPineconeClient(env)` → `createProjectService({ dataRoot: env.DATA_ROOT, pinecone, pineconeIndex: env.PINECONE_INDEX })`. Note: Pinecone client is constructed eagerly at boot, but `ensureIndex` is **lazy** — it only runs on first `POST /api/projects` (so the server boots without `PINECONE_API_KEY` for non-project routes; create attempts then surface a clean error).
  - [ ] Co-locate `projects.test.ts` covering: create returns 201 with snake_case body; create with missing `name` returns 400 + `invalid_input` envelope; list returns sorted array; delete returns 204; delete of unknown id returns 404 + `not_found` envelope. Use a stub `projectService` injected into a fresh `buildApp`.

- [ ] **Task 6: Wire `buildApp` boot + env requirements (AC: 1, 11, 13)**
  - [ ] In `apps/server/src/buildApp.ts`, before `registerRoutes`:
    1. `const pinecone = createPineconeClient(env);` — constructs the Pinecone client. Construction does NOT make a network call; safe even if `PINECONE_API_KEY` is missing in dev (call sites surface clean errors).
    2. `const projectService = createProjectService({ dataRoot: env.DATA_ROOT, pinecone, pineconeIndex: env.PINECONE_INDEX });`
    3. Pass `projectService` into `registerRoutes(app, { version: pkg.version, projectService })`.
  - [ ] Update `apps/server/src/config/env.ts`: keep `PINECONE_API_KEY: z.string().optional()` (already optional from Story 1.3 — do NOT make it required; the server must still boot for the health check and tests). Add a runtime guard inside `createPineconeClient` that throws a clear `AppError('invalid_input', 'PINECONE_API_KEY is not configured', { status: 500 })` when the SDK call is attempted without a key.
  - [ ] Update `apps/server/src/routes/health.test.ts` and `errors/errorHook.test.ts` if their `buildApp` invocations need a stub `projectService` — the simplest path is to construct a real Pinecone client (no network) and a real ProjectService over a temp `dataRoot` per test. Keep the existing `fakeEnv` shape; just expand `dataRoot` to point at `os.tmpdir()`.
  - [ ] Verify `pnpm --filter @bp/server test` passes — existing 7 tests must stay green plus the new project routes/service tests.

- [ ] **Task 7: Integration test `apps/server/tests/integration/pinecone.test.ts` (AC: 10, 11)**
  - [ ] Create `apps/server/tests/integration/pinecone.test.ts`. Skip the entire suite at the top with `describe.skipIf(!process.env.INTEGRATION || !process.env.PINECONE_API_KEY)(...)`.
  - [ ] Test cases:
    1. `ensureIndex` is idempotent — calling twice in succession does not throw and does not create duplicates.
    2. After `ensureIndex`, `describeIndex(indexName)` returns `{ status: { ready: true } }`.
    3. `namespaceFor(projectId)` returns the projectId unchanged.
    4. `isReservedNamespace('__wiki__')` returns `true`; `isReservedNamespace(uuidv4())` returns `false`.
  - [ ] **Do NOT** assert that an empty namespace exists post-create. Pinecone serverless materializes namespaces on first upsert — this is by-design and asserting the contrary will produce flaky tests. The architecture's AC text "namespace exists and is empty" is reinterpreted to "namespace name is reserved + index exists" per AC10 of this story.
  - [ ] Update `apps/server/tsconfig.json` `include` to add `"tests/**/*.ts"` (a deferred item from Story 1.1) so integration tests type-check.
  - [ ] Update `apps/server/vitest.config.ts` `include` to `['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts']` (deferred item from Story 1.1).

- [ ] **Task 8: Web — TanStack Query setup + projects API client (AC: 1, 2, 5, 6, 12)**
  - [ ] Update `apps/web/src/app/providers.tsx`:
    ```tsx
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import type { ReactNode } from 'react';

    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
    });

    export function Providers({ children }: { readonly children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    ```
  - [ ] Create `apps/web/src/api/` directory with `client.ts`:
    ```ts
    import type { ErrorEnvelope } from '@bp/shared';

    export class ApiError extends Error {
      constructor(
        readonly status: number,
        readonly envelope: ErrorEnvelope,
      ) { super(envelope.error.message); }
    }

    export async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const res = await fetch(path, {
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        ...init,
      });
      if (!res.ok) {
        const envelope = (await res.json()) as ErrorEnvelope;
        throw new ApiError(res.status, envelope);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
    ```
  - [ ] Create `apps/web/src/api/projects.ts`:
    ```ts
    import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
    import type {
      CreateProjectRequest,
      CreateProjectResponse,
      ListProjectsResponse,
      Project,
    } from '@bp/shared';
    import { api } from './client';

    const KEY = ['projects'] as const;

    export function useProjectsQuery() {
      return useQuery({
        queryKey: KEY,
        queryFn: () => api<ListProjectsResponse>('/api/projects'),
      });
    }

    export function useCreateProjectMutation() {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (body: CreateProjectRequest) =>
          api<CreateProjectResponse>('/api/projects', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
        onSuccess: (created: Project) => {
          qc.setQueryData<ListProjectsResponse>(KEY, (prev) =>
            prev ? [created, ...prev] : [created],
          );
        },
      });
    }
    ```
  - [ ] No `useDeleteProjectMutation` in this story — delete is server-tested via Task 5; UI delete affordance lands when a Settings/Project-Admin surface is added (no surface in Phase 1).

- [ ] **Task 9: Web — session store (Zustand) for active project (AC: 5, 6, 7, 8, 9)**
  - [ ] Create `apps/web/src/features/Session/store.ts` (new feature folder — `Session` not `ProjectSwitcher`, because the slice owns broader session state that grows in Stories 1.7/1.11):
    ```ts
    import { create } from 'zustand';
    import type { ProjectId } from '@bp/shared';

    const STORAGE_KEY = 'bp.session.project_id';

    interface SessionState {
      projectId: ProjectId | null;
      setProjectId: (id: ProjectId | null) => void;
    }

    function readPersisted(): ProjectId | null {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (raw as ProjectId) : null;
      } catch { return null; }
    }

    export const useSessionStore = create<SessionState>((set) => ({
      projectId: readPersisted(),
      setProjectId: (id) => {
        try {
          if (id) localStorage.setItem(STORAGE_KEY, id);
          else localStorage.removeItem(STORAGE_KEY);
        } catch { /* private mode — ignore */ }
        set({ projectId: id });
      },
    }));
    ```
  - [ ] Action name `setProjectId` is a verb per architecture §Streaming state. No `immer` middleware needed yet — single-field set; immer arrives when the store grows in Story 1.7.
  - [ ] Create `apps/web/src/features/Session/index.ts` barrel: `export { useSessionStore } from './store';`.

- [ ] **Task 10: Web — `ProjectSwitcher` feature folder (AC: 5, 6, 7, 12)**
  - [ ] Create `apps/web/src/features/ProjectSwitcher/` per architecture §Frontend feature boundaries with: `index.ts`, `ProjectSwitcher.tsx`, `CreateProjectDialog.tsx`, `FirstLaunchDialog.tsx`. No `store.ts` — the active project lives in the shared `Session` slice, not a per-feature one.
  - [ ] `ProjectSwitcher.tsx`:
    - Renders a `Popover` button labeled with the active project's `name` (truncated to 28 chars + ellipsis).
    - Popover content lists active projects from `useProjectsQuery()`; clicking a row calls `useSessionStore().setProjectId(project.project_id)` and closes the popover.
    - Bottom row "+ New project…" opens `CreateProjectDialog`.
    - When `useProjectsQuery()` is loading, render a button with text "Loading projects…" disabled.
    - When the query errors, render a button with "Projects unavailable" disabled — the toast framework lands in Story 1.12, so for now the error surface is the dropdown disabled state.
  - [ ] `CreateProjectDialog.tsx`:
    - shadcn `Dialog` with title "New project", body containing two controlled inputs (`name`, `description`) and a primary "Create" button.
    - On submit: call `useCreateProjectMutation().mutate({ name, description })`; on success, call `setProjectId(newProject.project_id)` and close the dialog. On error, surface inline below the form (red text using `text-red-400`) and keep the dialog open.
    - Validation: client-side mirrors server schema (`name` 1-100 chars, `description` ≤500 chars). Use plain `useState` — no form library, per architecture §Forms.
  - [ ] `FirstLaunchDialog.tsx`:
    - shadcn `Dialog` with `open={true}` and `onOpenChange` ignored (non-dismissible — no close button, no Esc/outside-click close). Pass `hideCloseButton` if shadcn dialog supports it; otherwise omit the `DialogClose` JSX. Set `onPointerDownOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}` on `DialogContent`.
    - Body: header "Select or create a project", followed by either:
      - The list of fetched projects (rendered as buttons; click → `setProjectId`), with a "+ New project" button at the bottom that swaps the dialog body to the create form.
      - Or, if no projects exist, the create form directly.
    - Closes (unmounts) automatically when `useSessionStore().projectId` becomes non-null — App.tsx controls the mount.
  - [ ] `index.ts` barrel: `export { ProjectSwitcher } from './ProjectSwitcher'; export { FirstLaunchDialog } from './FirstLaunchDialog';` — `CreateProjectDialog` is internal to the feature.

- [ ] **Task 11: Web — header bar + integrate switcher into `App.tsx` (AC: 6, 7, 9)**
  - [ ] Add a 40px top header bar to `App.tsx`, mounted between the Sheet and the chat region. Class skeleton: `<header className="h-10 flex-none flex items-center px-3 border-b border-[#3f3f46]">`. The status bar at the bottom is unchanged; this top bar is **new this story** specifically to host the `ProjectSwitcher` per AC6 ("top-left header area").
  - [ ] Inside the header, on the left: render `<ProjectSwitcher />` only when `useSessionStore((s) => s.projectId)` is non-null; otherwise show a static placeholder `<span className="text-sm text-bp-muted">No project</span>`.
  - [ ] At the App.tsx root, conditionally render `<FirstLaunchDialog />` when `projectId === null` AND the projects query has resolved (loading or success — render after the first fetch completes; null render during initial load avoids a 1-frame modal flash). When `projectId !== null`, do not render the dialog.
  - [ ] Pass `disabled={projectId === null}` to `<ChatInput />` in the input bar region.
  - [ ] Update the status bar's `<span data-testid="project-name">`: if `projectId` is set, render the active project's `name` (look up via `useProjectsQuery().data?.find(p => p.project_id === projectId)?.name ?? '…'`); else keep "No project selected".
  - [ ] Layout invariant: chat column max-width 800px stays unchanged. Header bar spans full width (does NOT reduce chat column width). Sidebar Sheet still overlays everything per Story 1.4 — no changes to Sheet structure.

- [ ] **Task 12: Close `ChatInput` deferred guard (AC: 9)**
  - [ ] In `apps/web/src/features/Chat/ChatInput.tsx`, add `if (disabled) return;` as the FIRST line of `handleKeyDown`. This closes the deferred review item from Story 1.4 (deferred-work.md, "ChatInput.handleKeyDown no disabled guard"). Add to the existing `Textarea`'s native disabled attribute — both layers of defense.
  - [ ] Update `App.test.tsx` "chat input is disabled by default" test → still passes since project_id starts null in tests (no localStorage).
  - [ ] Add a new test "chat input enables when a project is active" — exercises Task 9's store directly: set `useSessionStore.setState({ projectId: 'test-uuid' as ProjectId })` then re-render and assert `expect(screen.getByTestId('chat-input')).not.toBeDisabled()`.

- [ ] **Task 13: Web tests `apps/web/src/features/ProjectSwitcher/ProjectSwitcher.test.tsx` and `FirstLaunchDialog.test.tsx` (AC: 5, 6, 7, 12)**
  - [ ] Each test wraps the component under test in a fresh `QueryClientProvider` (helper in `apps/web/src/tests/helpers/QueryWrapper.tsx`).
  - [ ] Mock `fetch` globally with `vi.stubGlobal('fetch', vi.fn())`. Resolve to `{ ok: true, status: 200, json: async () => [...] }` for `GET /api/projects` and `{ ok: true, status: 201, json: async () => ({...}) }` for `POST /api/projects`. Cleanup with `vi.unstubAllGlobals()` in `afterEach`.
  - [ ] `ProjectSwitcher.test.tsx`:
    1. Renders the active project's name in the trigger button.
    2. Clicking the trigger opens the popover; clicking another project calls `setProjectId` (assert via `useSessionStore.getState().projectId`).
    3. Clicking "+ New project…" shows the create dialog.
  - [ ] `FirstLaunchDialog.test.tsx`:
    1. Renders when `projectId` is null and projects list resolves to `[]` — shows the create form directly.
    2. Renders when `projectId` is null and projects exist — shows the list.
    3. Selecting a project closes the dialog (asserted by querying for the dialog title and expecting it not to be in the document).
    4. Submitting a valid create call updates the store and closes the dialog.
    5. Esc and outside-click do NOT close it (assert dialog still in document after both events).

- [ ] **Task 14: Repo gate verification (AC: 11, 12, 13)**
  - [ ] `pnpm --filter @bp/shared build` exits 0; `dist/http.d.ts` includes `CreateProjectRequest` and `ListProjectsResponse`.
  - [ ] `pnpm --filter @bp/server typecheck`, `lint`, `test` all exit 0. Test count grows: existing 7 + projectService (≥4) + projects route (≥5) + pinecone unit (≥2) ≈ 18+.
  - [ ] `pnpm --filter @bp/web typecheck`, `lint`, `test` all exit 0. Existing 4 + ChatInput-enabled test (1) + ProjectSwitcher (3) + FirstLaunchDialog (5) ≈ 13.
  - [ ] `pnpm --filter @bp/web build` succeeds; bundle size delta from Story 1.4 baseline (284 kB JS) noted in completion notes — TanStack Query adds ~13 kB gzipped, Popover ~5 kB.
  - [ ] Manual smoke (not gated): `pnpm dev` → open `http://127.0.0.1:5173` → first-launch modal appears → enter name "smoke-test", description "manual" → create succeeds → `data/projects.json` shows the row → switcher appears in header with the project name → reload page → no modal, project still active. **Browser verification at 1440×900 is pending user confirmation** (per Story 1.4 pattern, agent has no interactive browser).
  - [ ] If `PINECONE_API_KEY` is set in `.env`, the create call succeeds end-to-end and the index appears in Pinecone console. If not, the create call returns 500 with `invalid_input` envelope — document this in the completion notes so reviewers know the smoke gating.

### Review Findings

- [x] [Review][Patch] AC8 violation — stale `localStorage` projectId not validated against fetched list; modal never shows for deleted project [apps/web/src/app/App.tsx:18-20]
- [x] [Review][Patch] FirstLaunchDialog shows create form during initial load (no loading guard); projects.data ?? [] evaluates to [] while pending [apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.tsx:26-28]
- [x] [Review][Patch] FirstLaunchDialog has no "Back" button from create mode; `userChoseCreate` is never reset; user with existing projects cannot return to pick mode [apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.tsx:27]
- [x] [Review][Patch] `readStore` JSON.parse uncaught — corrupt `projects.json` produces unhandled rejection; should throw `AppError` not raw SyntaxError [apps/server/src/domain/projectService.ts:39]
- [x] [Review][Patch] DELETE params schema uses `minLength: 1` instead of `format: 'uuid'` per spec; reserved namespace strings return 400 instead of 404 [apps/server/src/routes/projects.ts:21]
- [x] [Review][Patch] `uuid@14` paired with `@types/uuid@11` — 3 major versions apart; type definitions do not describe v14 API surface [apps/server/package.json]
- [x] [Review][Patch] AC12 missing test: `FirstLaunchDialog.test.tsx` asserts store state changes but never asserts dialog closes after project selection [apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.test.tsx]
- [x] [Review][Defer] `ensureIndex` called outside serialize lock; concurrent creates race on Pinecone calls (harmless in single-user server; 409 handled correctly) [apps/server/src/domain/projectService.ts:89-91] — deferred, pre-existing
- [x] [Review][Defer] `api<T>` sets `content-type: application/json` unconditionally on all methods including GET [apps/web/src/api/client.ts:15] — deferred, pre-existing
- [x] [Review][Defer] `showFirstLaunch` shows create form when query errors with projectId null; spec doesn't define error-state behavior [apps/web/src/app/App.tsx:18] — deferred, pre-existing
- [x] [Review][Defer] AC7(a-c) project-switch state reset mechanism absent; trivially satisfied now (all state is placeholder); mechanism needed when Stories 1.8+ add real chat/tab state [apps/web/src/features/ProjectSwitcher/ProjectSwitcher.tsx] — deferred, pre-existing
- [x] [Review][Defer] AC7(d) in-flight request cancellation — explicitly no-op this story per spec; required when SSE/streaming land in 1.6/1.7 [apps/web/src/features/ProjectSwitcher/ProjectSwitcher.tsx] — deferred, pre-existing
- [x] [Review][Defer] `create` reserved-namespace defensive branch is dead code (UUID v4 cannot start with `__`); untestable without mocking uuid [apps/server/src/domain/projectService.ts:86-87] — deferred, pre-existing
- [x] [Review][Defer] `list()` runs inside serialize lock; unnecessarily queues concurrent reads behind writes (acceptable in single-user server) [apps/server/src/domain/projectService.ts:109] — deferred, pre-existing

## Dev Notes

### Reference state from Stories 1.1–1.4

**Already in place — do not recreate:**
- `apps/server/src/buildApp.ts` — Fastify factory wiring CORS + error hook + routes. Story extends with Pinecone client + ProjectService construction.
- `apps/server/src/config/env.ts` — Zod env schema with `PINECONE_API_KEY` already optional, `PINECONE_INDEX` defaulting to `business-planner-intelligence`, `DATA_ROOT` defaulting to `./data`. No changes needed to the schema this story.
- `apps/server/src/errors/AppError.ts` + `errorHook.ts` — typed error class + Fastify hook that maps `AppError` → `ErrorEnvelope`. Use directly; no extension needed.
- `apps/server/src/routes/index.ts` — barrel that registers routes. Story extends to add `registerProjectsRoute`.
- `packages/shared/src/domain.ts` — `Project` interface already exists with all required fields (story 1.2). Add HTTP shapes to `http.ts` only.
- `packages/shared/src/errors.ts` — `invalid_input`, `not_found`, `pinecone_write_failure`, `pinecone_read_failure` all already in the `ErrorCode` union. No additions.
- `apps/web/src/app/App.tsx` — Direction B layout with sidebar Sheet, status bar, chat region, disabled input. Story adds a top header bar between the Sheet and the chat region; status bar text is updated to read from the session store; conditional `<FirstLaunchDialog />` mounted at root.
- `apps/web/src/features/Chat/ChatInput.tsx` — already accepts `disabled` prop; story adds the in-handler `disabled` guard.
- `apps/web/src/components/ui/sheet.tsx`, `tabs.tsx`, `textarea.tsx`, `scroll-area.tsx`, `button.tsx`, `badge.tsx` — shadcn primitives copied in Story 1.4. Story adds `dialog.tsx` and `popover.tsx` via the same CLI.
- `apps/web/src/lib/cn.ts` — canonical `cn()` helper. Any newly-generated shadcn components MUST import from `@/lib/cn`, not `@/lib/utils`.
- Tailwind palette tokens `bp-bg`, `bp-surface`, `bp-text`, `bp-muted`, `bp-border`, `bp-accent` — use these (not raw hex) for any new UI in this story. Story 1.4 inlined hex in App.tsx for layout — that pattern should NOT propagate. New components use `bg-bp-surface text-bp-text` etc.
- `apps/web/src/app/providers.tsx` — currently a passthrough. Story replaces with `QueryClientProvider`.

**Status of installed deps (do not duplicate):**
- Web has `zustand` (Story 1.4) — use it for the Session store.
- Web has `@radix-ui/react-dialog` (Story 1.4) — `Dialog` is built on the same primitive as `Sheet`. The shadcn `dialog.tsx` Task 2 generates is a different component file but reuses the installed Radix dep.
- Web does NOT have `@tanstack/react-query` or `@radix-ui/react-popover` — both added this story.
- Server does NOT have `@pinecone-database/pinecone` or `uuid` — both added this story.

### Pinecone SDK version

Architecture §Vector store mandates `@pinecone-database/pinecone` v4.x. Current published version (verified via web search 2026-04-23) is v7.x. **Use v4.x for this story** to match the architecture decision. The v4 → v6/v7 migration includes a few breaking API changes (e.g., signature of `createIndex`, embed/inference helpers); we accept staying behind to keep this story scoped. A "Phase 1.x: bump Pinecone SDK to v7" item is appropriate for `deferred-work.md` once Story 1.5 ships.

The v4 API surface this story uses:
- `new Pinecone({ apiKey })` — constructor, no network call.
- `pinecone.describeIndex(name)` — read; throws on 404. v4 returns the index description.
- `pinecone.createIndex({ name, dimension, metric, spec: { serverless: { cloud, region } } })` — creates a serverless index. Async; readiness must be polled via `describeIndex`.
- `pinecone.index(name).namespace(ns)` — narrow handle for future upserts (NOT used this story; `namespaceFor` returns the string only).

### Pinecone namespace lifecycle

Pinecone serverless does not support pre-created empty namespaces. A namespace materializes the moment the first vector is upserted into it; before that, `describeIndexStats` does not list it.

This contradicts the surface reading of Epic 1 Story 1.5 AC #7: "namespace exists under business-planner-intelligence keyed by project_id and is empty — ready for later epics to write…". Three options were considered:

1. **Eagerly upsert + delete a placeholder vector to force namespace materialization.** Rejected: wasteful (1 write + 1 delete per project create), pollutes the cost meter (Story 1.11), and creates a confusing record in transcripts.
2. **Skip the bootstrap entirely; let Story 2.x materialize on first real write.** Accepted in spirit but loses the "namespace reserved" contract that gives later epics confidence the projectId won't collide with reserved names.
3. **Reserve the namespace name + ensure the index exists; defer materialization to first real upsert.** Chosen. The `namespaceFor(projectId)` helper centralizes the contract; `RESERVED_NAMESPACES` + `isReservedNamespace` guard Project CRUD; index existence is the only physically-verifiable bootstrap step. This reading is encoded in AC10 (this story) and supersedes the looser epic AC text.

**Future-epic consequences:** when Stories 2.1/2.2 first upsert evidence/findings, they will materialize the namespace as a side effect. No special "first upsert" branch needed — namespaces appear naturally in `describeIndexStats` once non-empty. The `intelligence` tools (Stories 2.1+) MUST still call `namespaceFor(projectId)` from this story's helper rather than concatenating their own strings — that's the cross-story contract this story freezes.

### JSON store vs Postgres

Architecture §Data architecture lists Postgres as Phase 2; the epic AC explicitly authorizes a JSON fallback for "pre-DB development." This story commits fully to the JSON path — there is no `STORAGE_BACKEND=json|postgres` feature flag, no abstract `ProjectRepository` interface with two implementations. Build the simplest thing that works: the service writes to `${DATA_ROOT}/projects.json` directly; the Postgres swap (when it lands in a Phase 2 story) replaces the service implementation entirely.

**Why no abstraction now:** the repository interface would be a single-implementation abstraction in Phase 1 and would lock the future Postgres implementation into the JSON shape's transactional semantics (lock-free reads with whole-file write). Postgres deserves its own design when the time comes.

**Atomic file write:**
```ts
import { writeFile, rename, readFile } from 'node:fs/promises';
import path from 'node:path';

async function writeStoreAtomic(filePath: string, data: { projects: Project[] }) {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, filePath);
}
```
Concurrency: serialize through an in-instance promise queue. Single-process server, single user — `flock` is overkill.

### Wire format compliance

Per architecture §Format Patterns:
- `POST /api/projects` request body: `{ "name": "...", "description": "..." }` — snake_case (already snake-friendly; no camelCase invented).
- Create response body: returns the `Project` directly with `project_id`, `created_at`, `deleted_at` snake_case fields. **DO NOT** wrap in `{ data: { ... } }` — architecture §API response envelopes is explicit: "Non-streaming JSON responses return the payload directly." The epic AC text shows `{ data: { project_id, ... } }` — that is **incorrect** relative to the architecture's locked envelope decision. Follow the architecture; flag the inconsistency in the project notes section below.
- List response: returns the `Project[]` array directly. Same envelope override.
- Delete: `204 No Content` with empty body — no envelope at all.
- Error responses: `{ "error": { "code": ErrorCode, "message": string, "retryable": boolean } }` — handled by the existing `errorHook`.

**Anti-pattern reminder (Story 1.3 already covered, restated):**
```ts
// WRONG: invents camelCase fields not in @bp/shared
return reply.send({ projectId: id, createdAt: now });
// RIGHT: mirror shared
return reply.send({ project_id: id, created_at: now });
```

### Frontend component placement

Per architecture §Frontend feature boundaries the layout is:
- `apps/web/src/features/ProjectSwitcher/` — feature folder for the dropdown + create dialog
- `apps/web/src/features/Session/` — new feature folder for the session store (project_id + future session_id)
- `apps/web/src/api/` — TanStack Query hooks + fetch wrapper
- `apps/web/src/components/ui/dialog.tsx`, `popover.tsx` — shadcn copy-ins
- `apps/web/src/app/providers.tsx` — wraps `QueryClientProvider`

`Session` is a new feature folder. Architecture's named feature folders (`Chat`, `SkepticPanel`, `Sources`, `CostMeter`, `ContextGauge`, `SessionControls`, `ProjectSwitcher`) do not include `Session` — the architecture refers to "session state" as a Zustand slice without prescribing its folder. We place it under `features/Session/` rather than `features/SessionControls/` because `SessionControls` (Story 1.7+) will own checkpoint + new-session UI controls, while `Session` is the underlying state. Two folders, two responsibilities. If the developer prefers, the slice could live at `apps/web/src/lib/sessionStore.ts` instead — equivalent acceptance.

### `ProjectSwitcher` placement clarification (intentional deviation)

UX-DR35 (epics.md:280) describes "Projects tab in sidebar shows project list" and UX spec §Implementation Approach echoes a "Projects" tab. **Story 1.5 AC explicitly overrides this** — "the `ProjectSwitcher` in the top-left header area" — and Epic 1's narrative (epics.md:241, 375) confirms: "Projects is not a tab; project switching is a `ProjectSwitcher` dropdown per UX-DR35." The five-tab order from Story 1.4 is locked: Intelligence → Skeptic → Wiki → Decisions → History (no Projects tab).

**Implementation contract:** add a 40px top header bar (new this story) that hosts `ProjectSwitcher`. The header bar replaces the "optionally in a minimal top bar" mention in UX spec line 411. Status bar bottom continues to host the sidebar toggle from Story 1.4.

The first-launch **modal** is a similarly intentional deviation: UX spec line 174 forbids modals for "routine" actions like project switching, but a non-dismissible modal for the no-project-selected state is the only way to honor AC5's "chat input remains disabled until I do" without painting an empty-state CTA in the chat column itself (which conflicts with Story 1.8's chat ownership). This is the only modal in Phase 1.

### Architecture compliance cross-reference

| Concern | Architecture § | This story's move |
|---|---|---|
| Single Pinecone index, namespace per project | §Data architecture | `business-planner-intelligence` index; `namespaceFor(projectId) === projectId` |
| Pinecone serverless 1024-d cosine | §Data architecture | `dimension: 1024, metric: 'cosine', spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }` |
| `clients/` adapters for external SDKs | §Backend module boundaries | `apps/server/src/clients/pinecone.ts` |
| `domain/` pure-TS services | §Backend module boundaries | `apps/server/src/domain/projectService.ts` |
| `routes/` Fastify route modules | §Backend module boundaries | `apps/server/src/routes/projects.ts` |
| snake_case wire | §Format Patterns | `project_id`, `created_at`, `deleted_at` end-to-end |
| Direct array response (no envelope wrapper) | §API response envelopes | `GET /api/projects` returns `Project[]`, not `{ data: [] }` |
| UUID v4 server-generated | §Format Patterns | `uuid.v4()` inside `projectService.create` |
| ISO-8601 UTC dates | §Format Patterns | `new Date().toISOString()` cast as `IsoUtcTimestamp` |
| AppError + ErrorEnvelope | §Error handling | All thrown errors are `AppError`; existing hook handles serialization |
| TanStack Query for HTTP reads | §State management split | `useProjectsQuery`, `useCreateProjectMutation` |
| Zustand for session/streaming state | §State management split | `useSessionStore` for active `projectId` |
| Verb action names | §Loading and streaming state | `setProjectId` |
| `features/<FeatureName>/` structure | §Frontend feature boundaries | `features/ProjectSwitcher/`, `features/Session/` |
| `api/` TanStack Query + fetch wrapper | §Frontend feature boundaries | `api/client.ts`, `api/projects.ts` |
| Pinecone write blocks until ack | §Per-dependency resilience | `ensureIndex` polls `describeIndex` until ready before persisting project |
| Project switch atomic | §ProjectId boundary | All scoped UI re-derives from `useSessionStore.projectId`; switch is a single store action |

### Latest tech information (verified 2026-04-23)

- **Pinecone TS SDK**: latest published is v7.x; we pin to v4.x per architecture decision (see §Pinecone SDK version above). The v4 `createIndex` signature accepts `{ name, dimension, metric, spec }`; the `spec.serverless` object takes `{ cloud: 'aws' | 'gcp' | 'azure', region: string }`. Docs: https://www.npmjs.com/package/@pinecone-database/pinecone.
- **TanStack Query v5**: stable for React 19. `useQuery` returns `data`, `isLoading`, `isError`, `error`. Use `queryKey: ['projects']` (array of literals). Optimistic updates via `setQueryData` are preferred over invalidation for the create flow since the server returns the canonical record.
- **Fastify 5**: JSON Schema validation via Ajv is built-in. Use `as const` on schema literals to enable type narrowing if you wire `@fastify/type-provider-typebox` later (out of scope this story; plain `req.body as CreateProjectRequest` cast is acceptable).
- **shadcn `Dialog`**: `onPointerDownOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}` on `DialogContent` is the documented escape-hatch for a non-dismissible dialog — works with the `@radix-ui/react-dialog` v1 peer that Story 1.4 already installed.

### Previous-story intelligence (Stories 1.1 → 1.4)

**Patterns established that this story reuses:**
- **Atomic file write** (Story 1.3 wired this for `data/logs/`; reuse pattern in `projectService.writeStoreAtomic`).
- **Co-located unit tests** (`foo.test.ts` next to `foo.ts`) — established in Stories 1.2/1.3/1.4. Maintain.
- **Integration tests under `tests/integration/` gated by `INTEGRATION=1`** — declared in architecture, deferred in Story 1.1 (the tsconfig `include` and vitest `include` were left missing). This story closes both gaps as part of Task 7.
- **Test envs construct a real `buildApp(fakeEnv, silentLogger)` and use Fastify's `.inject()`** (established in Story 1.3's `health.test.ts` and `errorHook.test.ts`). Reuse exactly for `projects.test.ts`.
- **shadcn CLI quirks** (Story 1.4 retro): the CLI may default to `base-nova` style on `@base-ui/react`; reset to `default` style on Radix. The `components.json` `aliases.utils` was already updated to `@/lib/cn` in Story 1.4 — newly-added `dialog.tsx` and `popover.tsx` should generate with `@/lib/cn` imports automatically. If they don't, search-replace as in Story 1.4 Task 3.
- **React 19 `ComponentRef`** — convert any new shadcn-generated `React.ElementRef` to `React.ComponentRef` to match the lint discipline established in Story 1.4 (the `react-refresh/only-export-components` ESLint exception under `apps/web/src/components/ui/**` from Story 1.4 still applies and should not be widened).
- **No theme provider** — `<html class="dark">` is the only dark-mode toggle; do NOT introduce one. shadcn `Dialog` and `Popover` should render with the same dark-mode CSS-var values from `globals.css`.

**Deferred items this story closes:**
1. `ChatInput.handleKeyDown` no `disabled` guard (deferred from 1.4) — Task 12 adds the early-return guard.
2. `apps/server/tests/include` missing in tsconfig + vitest config (deferred from 1.1) — Task 7 adds both.

**Deferred items this story explicitly leaves:**
- `loadEnv('')` empty-prefix in `vite.config.ts` (1.1) — pattern not copied; not made worse.
- `__dirname` in ESM Vite config (1.4) — works; not touched.
- `ScrollArea` `data-testid` placement (1.4) — no scroll assertions in this story.
- `TabsContent` `forceMount` (1.4) — no live tab content this story.
- `AppError.status` HTTP range validation (1.3) — Task 5 adds reserved-namespace error with `status: 400` (a valid HTTP code) but does not add the range guard. Defer.

### Test environment notes

- TanStack Query in tests: each test file should construct a fresh `QueryClient` (no shared global) to avoid cross-test cache leakage. Use `retry: false` in test config so failed mutations surface synchronously.
- Mock `localStorage` is provided by `jsdom`; clean it between tests with `localStorage.clear()` in `beforeEach`.
- Mock `fetch`: `vi.stubGlobal('fetch', vi.fn(...))` is sufficient. Avoid `msw` — adds complexity for no gain at this scope.
- Reset Zustand store between tests: `useSessionStore.setState({ projectId: null })` in `afterEach`.
- Pinecone integration test: protect with both `INTEGRATION` AND `PINECONE_API_KEY` checks. Default `pnpm test` MUST stay offline and fast.

### What this story does NOT do (boundaries)

- **No Postgres.** JSON-file store only. Postgres lands in a Phase 2 story (no story number assigned).
- **No SSE / streaming.** Story 1.6 owns SSE infrastructure.
- **No Claude orchestrator.** Story 1.7 owns the orchestrator + chat send.
- **No real chat messages.** Story 1.8 owns chat send + streaming display.
- **No project delete UI.** No surface for it in Phase 1; the API is tested via the server suite only.
- **No project rename / edit.** Out of scope; `Project` doesn't expose a mutate endpoint.
- **No Voyage embedding.** Story 2.1 owns Voyage. The reserved `__wiki__` namespace is enforced now to avoid contract churn when Story 4.3 lands.
- **No project-scoped Pinecone writes.** This story creates the index but does not write any records — the namespace materializes in Story 2.1+ on first real upsert. AC10 is explicit about this.
- **No toast framework.** Story 1.12 owns it. Project create errors render inline in the dialog; project switch errors are unreachable in this story (no errorable code path).
- **No multi-window sync.** If two browser tabs are open and one creates a project, the other tab does not auto-refresh until the user manually reloads. TanStack Query's `refetchOnWindowFocus` (default `true`) gives a partial mitigation; no broadcast channel.
- **No `useDeleteProjectMutation` hook.** API supports DELETE; UI does not call it. Adding the hook would be unused and would invite premature surface.

### Project Structure Notes

**New files (server):**

| File | Purpose |
|---|---|
| `apps/server/src/clients/index.ts` | Barrel: `export * from './pinecone'` |
| `apps/server/src/clients/pinecone.ts` | Pinecone client adapter, `ensureIndex`, `namespaceFor`, `isReservedNamespace` |
| `apps/server/src/clients/pinecone.test.ts` | Unit tests for `namespaceFor` + `isReservedNamespace` (no network) |
| `apps/server/src/domain/index.ts` | Barrel: `export * from './projectService'` |
| `apps/server/src/domain/projectService.ts` | `createProjectService`, JSON store, atomic write |
| `apps/server/src/domain/projectService.test.ts` | Unit tests over temp dataRoot |
| `apps/server/src/routes/projects.ts` | `POST/GET/DELETE /api/projects` |
| `apps/server/src/routes/projects.test.ts` | Route tests via `app.inject` |
| `apps/server/tests/integration/pinecone.test.ts` | Live Pinecone test (`INTEGRATION=1` + `PINECONE_API_KEY`) |

**Modified files (server):**

| File | Change |
|---|---|
| `apps/server/src/buildApp.ts` | Construct Pinecone client + ProjectService at boot; pass to `registerRoutes` |
| `apps/server/src/routes/index.ts` | Register `projects.ts`; extend `RoutesOptions` with `projectService` |
| `apps/server/src/routes/health.test.ts` | Construct ProjectService over temp dataRoot in `beforeAll` |
| `apps/server/src/errors/errorHook.test.ts` | Same — construct ProjectService over temp dataRoot |
| `apps/server/tsconfig.json` | Add `"tests/**/*.ts"` to `include` |
| `apps/server/vitest.config.ts` | Extend `include` to cover `tests/**` |
| `apps/server/package.json` | Add `@pinecone-database/pinecone@^4`, `uuid`, `@types/uuid` |

**New files (web):**

| File | Purpose |
|---|---|
| `apps/web/src/api/client.ts` | `fetch` wrapper + `ApiError` class |
| `apps/web/src/api/projects.ts` | `useProjectsQuery`, `useCreateProjectMutation` |
| `apps/web/src/features/Session/store.ts` | Zustand session slice (active `project_id`, `localStorage` persist) |
| `apps/web/src/features/Session/index.ts` | Barrel: `export { useSessionStore } from './store'` |
| `apps/web/src/features/ProjectSwitcher/index.ts` | Barrel: exports `ProjectSwitcher`, `FirstLaunchDialog` |
| `apps/web/src/features/ProjectSwitcher/ProjectSwitcher.tsx` | Popover-based dropdown in top header |
| `apps/web/src/features/ProjectSwitcher/CreateProjectDialog.tsx` | Dialog with name/description form |
| `apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.tsx` | Non-dismissible dialog for no-project state |
| `apps/web/src/features/ProjectSwitcher/ProjectSwitcher.test.tsx` | Component tests |
| `apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.test.tsx` | Dialog behavior tests |
| `apps/web/src/components/ui/dialog.tsx` | shadcn copy-in |
| `apps/web/src/components/ui/popover.tsx` | shadcn copy-in |
| `apps/web/src/tests/helpers/QueryWrapper.tsx` | Test helper providing fresh `QueryClient` |

**Modified files (web):**

| File | Change |
|---|---|
| `apps/web/src/app/providers.tsx` | Wrap children in `QueryClientProvider` |
| `apps/web/src/app/App.tsx` | Add 40px top header with `<ProjectSwitcher />`; conditionally mount `<FirstLaunchDialog />`; status bar reads project name from session store; `<ChatInput disabled={!projectId} />` |
| `apps/web/src/app/App.test.tsx` | Add "chat input enables when project active" test; existing tests must still pass |
| `apps/web/src/features/Chat/ChatInput.tsx` | Add `if (disabled) return;` guard at top of `handleKeyDown` |
| `apps/web/package.json` | Add `@tanstack/react-query`, `@radix-ui/react-popover` |

**Modified files (shared):**

| File | Change |
|---|---|
| `packages/shared/src/http.ts` | Add `CreateProjectRequest`, `CreateProjectResponse`, `ListProjectsResponse` |

**Deleted files:** None.

**Outside `apps/server/`, `apps/web/`, `packages/shared/`:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — workflow updates this file's `1-5-*` status to `ready-for-dev` (this story creation), then dev/review steps update further.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append (after dev) any new deferred items discovered during 1.5 review.

### Conflicts and clarifications surfaced this story

These are flagged for the dev agent to follow without re-litigating; they are spec inconsistencies the architecture-vs-epic-vs-UX docs left ambiguous, resolved here:

1. **Wire envelope.** Epic 1 Story 1.5 AC #1 shows `{ data: { project_id, ... } }`. Architecture §API response envelopes locks the convention to no `data` wrapper. **Architecture wins.** Return `Project` directly.
2. **`ProjectSwitcher` placement.** UX-DR35 implies a sidebar tab; Story 1.5 AC #5/#6 say "top-left header area"; Epic 1 narrative confirms not-a-tab. **Story 1.5 AC wins.** Add a top header bar.
3. **Modal usage.** UX spec line 174 forbids modals for routine actions; Story 1.5 AC #4 requires a modal for first-launch. **Story 1.5 AC wins for the no-project-selected state only.** All other project-switching flows remain inline (popover dropdown).
4. **Namespace eager creation.** Epic AC #7 reads "namespace exists and is empty"; Pinecone serverless cannot create empty namespaces. **AC10 of this story refines the contract** to "namespace name reserved + index ready"; first real upsert (Story 2.1+) materializes the namespace.

### References

- [epics.md §Story 1.5](../planning-artifacts/epics.md) — source of all primary ACs, ProjectSwitcher header placement, first-launch modal language
- [epics.md §Story 4.3](../planning-artifacts/epics.md) — `__wiki__` reserved-namespace contract that Task 3's guard pre-honors
- [architecture.md §Vector store — Pinecone serverless](../planning-artifacts/architecture.md) — `business-planner-intelligence` index, namespace-per-project, 1024-d cosine
- [architecture.md §API response envelopes](../planning-artifacts/architecture.md) — no `{ data: ... }` wrapper for non-streaming responses
- [architecture.md §Wire JSON conventions](../planning-artifacts/architecture.md) — snake_case end-to-end, UUID v4 server-side, ISO-8601 UTC
- [architecture.md §Backend module boundaries](../planning-artifacts/architecture.md) — `clients/`, `domain/`, `routes/` folder responsibilities
- [architecture.md §Frontend feature boundaries](../planning-artifacts/architecture.md) — `features/<FeatureName>/`, `api/`, `components/ui/`
- [architecture.md §State management split](../planning-artifacts/architecture.md) — TanStack Query for reads, Zustand for session state
- [architecture.md §Per-dependency resilience](../planning-artifacts/architecture.md) — Pinecone write blocks until ack; `pinecone_write_failure` envelope
- [architecture.md §ProjectId boundary](../planning-artifacts/architecture.md) — atomic project switch
- [architecture.md §Error handling](../planning-artifacts/architecture.md) — `AppError` with `ErrorCode`, single error hook, no string `throw`
- [architecture.md §Test organization](../planning-artifacts/architecture.md) — co-located unit, `tests/integration/` gated by `INTEGRATION=1`
- [ux-design-specification.md §Implementation Approach](../planning-artifacts/ux-design-specification.md) — "optionally a minimal top bar" — this story converts to a definite 40px top bar
- [ux-design-specification.md §UX-DR35](../planning-artifacts/epics.md) — superseded by AC6 placement
- [1-4-frontend-shell-dark-theme-direction-b-layout.md](./1-4-frontend-shell-dark-theme-direction-b-layout.md) — layout shell, palette, ChatInput baseline
- [1-3-fastify-server-bootstrap.md](./1-3-fastify-server-bootstrap.md) — Fastify factory, error hook, env schema, test patterns
- [1-2-shared-types-package.md](./1-2-shared-types-package.md) — `Project` interface, branded types, runtime cast pattern
- [deferred-work.md](./deferred-work.md) — items closed (ChatInput disabled guard, server tests include) and items intentionally left

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Pinecone serverless does not materialize empty namespaces; AC10 refined to "index exists + namespace name reserved", with materialization deferred to Story 2.1's first upsert.
- Split `apps/server` tsconfig into build (`tsconfig.json`, rootDir=src) and typecheck (`tsconfig.test.json`, rootDir=.) so tests can be typechecked without polluting the publish rootDir.
- Fastify validation: used `attachValidation: true` + explicit `throw new AppError('invalid_input', ...)` to route validation errors through the existing errorHook without extending the hook.
- ProjectService holds a lazy Pinecone factory so the server boots without `PINECONE_API_KEY`; the `invalid_input` missing-key error surfaces only when a route is hit.
- Moved the `QueryClient` inside `Providers` (per-instance via `useState`) so test renders don't share cached query results.
- `FirstLaunchDialog` mode is derived from `projects.length` + a `userChoseCreate` flag rather than `useState(initializer)` — the initializer ran during the loading state and never resynced when data arrived.
- Radix Dialog forces `pointer-events: none` on `<body>`, so outside-click verification uses `fireEvent.pointerDown(document.body)` instead of `user.click`.

### Completion Notes List

- Server: `projects` routes (POST 201, GET 200 array, DELETE 204), JSON-Schema validation → `ErrorEnvelope`, atomic JSON store with in-instance promise-chain serialization, UUID v4 ids, Pinecone `ensureIndex` called before persistence, reserved namespace set includes `__wiki__`.
- Web: TanStack Query + Zustand session store (persisted to `bp.session.project_id`), top-header `ProjectSwitcher` with Popover, non-dismissible `FirstLaunchDialog` (escape + outside click both preventDefault), shared `CreateProjectForm` used by both surfaces with client-side validation mirroring the server (1–100 name, ≤500 description).
- Deferred closures: `ChatInput` disabled-guard Enter swallow, typecheck config now includes server tests via split `tsconfig.test.json`.
- Integration test `apps/server/tests/integration/pinecone.test.ts` gated via `describe.skipIf(!process.env.INTEGRATION || !process.env.PINECONE_API_KEY)`.
- Gates: repo-wide `pnpm typecheck`, `pnpm lint`, `pnpm test` all green (shared 2/2, server 24/24 + 3 skipped integration, web 14/14). Web build succeeds (`vite build` — 369.95 kB main bundle).

### File List

**New — server**
- apps/server/src/clients/pinecone.ts
- apps/server/src/clients/pinecone.test.ts
- apps/server/src/domain/projectService.ts
- apps/server/src/domain/projectService.test.ts
- apps/server/src/routes/projects.ts
- apps/server/src/routes/projects.test.ts
- apps/server/tests/integration/pinecone.test.ts
- apps/server/tests/tsconfig.json
- apps/server/tsconfig.test.json

**Modified — server**
- apps/server/package.json (added `@pinecone-database/pinecone`, `uuid`, `@types/uuid`; typecheck uses `tsconfig.test.json`)
- apps/server/src/buildApp.ts (accepts `pineconeOverride`, constructs `ProjectService`, passes to routes)
- apps/server/src/routes/index.ts (registers `projects` routes; `RoutesOptions.projectService`)
- apps/server/src/routes/health.test.ts (temp `dataRoot` + pinecone override)
- apps/server/src/errors/errorHook.test.ts (temp `dataRoot` + pinecone override)
- apps/server/vitest.config.ts (includes `tests/**/*.{test,spec}.ts`)

**New — web**
- apps/web/src/api/client.ts
- apps/web/src/api/projects.ts
- apps/web/src/components/ui/dialog.tsx
- apps/web/src/components/ui/popover.tsx
- apps/web/src/features/Session/store.ts
- apps/web/src/features/Session/index.ts
- apps/web/src/features/ProjectSwitcher/CreateProjectDialog.tsx
- apps/web/src/features/ProjectSwitcher/ProjectSwitcher.tsx
- apps/web/src/features/ProjectSwitcher/ProjectSwitcher.test.tsx
- apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.tsx
- apps/web/src/features/ProjectSwitcher/FirstLaunchDialog.test.tsx
- apps/web/src/features/ProjectSwitcher/index.ts
- apps/web/src/tests/helpers/QueryWrapper.tsx

**Modified — web**
- apps/web/package.json (added `@tanstack/react-query`, `@radix-ui/react-popover`)
- apps/web/src/app/App.tsx (header bar, `ProjectSwitcher`/placeholder, `FirstLaunchDialog` when no project, ChatInput disabled binding, active project name in status bar)
- apps/web/src/app/App.test.tsx (rewritten with fetch stubs, new assertions for project-driven states)
- apps/web/src/app/providers.tsx (per-instance `QueryClient` via `useState`)
- apps/web/src/features/Chat/ChatInput.tsx (closed deferred 1.4 disabled Enter guard)

**Modified — shared**
- packages/shared/src/http.ts (added `CreateProjectRequest`, `CreateProjectResponse`, `ListProjectsResponse`)

### Change Log

| Date       | Version | Change                                                                                      | Author |
|------------|---------|---------------------------------------------------------------------------------------------|--------|
| 2026-04-23 | 0.1.0   | Implementation complete; all ACs satisfied; status → review                                  | dev    |
