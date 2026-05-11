import { defineConfig } from 'vitest/config';
import path from 'node:path';

const aliases = {
  '@/onebrain': path.resolve(__dirname, 'src/onebrain'),
  '@/lib': path.resolve(__dirname, 'src/lib'),
  '@/cli': path.resolve(__dirname, 'src/cli'),
  '@/compilation': path.resolve(__dirname, 'src/compilation'),
  // Plan 01-07 (Rule 3 deviation): @/ui alias added so the React UI scaffold test
  // (tests/integration/ui-scaffold.test.tsx) can import from '@/ui/App'. Mirrors
  // the alias already present in vite.config.ts and tsconfig.json paths.
  '@/ui': path.resolve(__dirname, 'src/ui'),
  // Plan 02-01, Task 3 (Rule 3 deviation): @/server and @/agents aliases added
  // so Phase 2 specs (tests/server/health.spec.ts, future tests/agents/*) can
  // import from '@/server/*' and '@/agents/*'. Mirrors aliases in vite.config.ts
  // and tsconfig.json paths. Without these the unit project would fail at module
  // resolution under NodeNext + paths discipline.
  '@/server': path.resolve(__dirname, 'src/server'),
  '@/agents': path.resolve(__dirname, 'src/agents'),
};

export default defineConfig({
  resolve: { alias: aliases },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Plan success criterion #4: Vitest config loads without error in an empty repo.
    // Default behavior in v4 exits 1 when no tests found; the walking-skeleton
    // explicitly ships with zero tests, so we relax the default.
    passWithNoTests: true,
    // Plan 02-03 (Rule 3 deviation): vitest@4.1.5 default pool ('forks' on Windows) is
    // broken in this environment — every test file fails before describe() runs with
    // `TypeError: Cannot read properties of undefined (reading 'config')` (the runner
    // global is never set in worker context). `vmThreads` works for unit suites; the
    // integration project keeps default 'forks' (overridden below) because vmThreads
    // disallows process.chdir which the existing pipeline.test.ts pattern relies on.
    // Discovered cold at 02-03 Task 1 start; pre-existing issue (02-02 ran 161 tests
    // green at 02-02 close — environment regression between then and now).
    pool: 'vmThreads',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'tests/unit/**/*.test.ts',
            // Plan 02-01, Task 3 — Phase 2 server probes (DB-mocked) live alongside
            // the unit suite because they're fast and use vi.mock('@/onebrain/db').
            // Future probes that need a real DB should move to tests/agents/ or
            // tests/integration/ instead. (See 02-01-SUMMARY.md "Test routing rule".)
            'tests/server/**/*.spec.ts',
          ],
          setupFiles: ['./tests/setup/voyage-mock.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          // Plan 01-07 (Rule 3 deviation): include .tsx so the UI scaffold test
          // (which renders <App /> via @testing-library/react) is picked up.
          // Plan 02-02, Task 4 — Phase 2 search-hybrid probe (real DB + FTS index)
          // lives under tests/onebrain/ so it pairs with src/onebrain/search.ts;
          // route it through the integration project to inherit fileParallelism: false
          // and the 30s test timeout.
          include: [
            'tests/integration/**/*.test.{ts,tsx}',
            'tests/onebrain/**/*.spec.ts',
          ],
          // NO setupFiles — integration tests import resetSchemaAndMigrate explicitly
          // and call it in their own beforeEach. This avoids the implicit-coupling
          // pitfall where a global hook collides with import-only consumers.
          testTimeout: 30000,
          // Plan 01-06 (Rule 3 deviation): integration tests share a single Postgres DB
          // and resetSchemaAndMigrate() takes an exclusive node-pg-migrate advisory lock.
          // Running multiple integration files in parallel would (a) cause "Failed to
          // release migration lock" errors, and (b) drop the schema underneath a peer
          // test's open queries. Serialize file execution for integration only; unit
          // tests remain parallel. (Within-file tests still run serially per Vitest default.)
          fileParallelism: false,
          // Plan 02-03: inherits the vmThreads pool from the parent. The pipeline.test.ts
          // (chdir-based) probe breaks under vmThreads — see deferred-items.md "Vitest
          // runner fails to initialize". 02-03's own integration probes do NOT use chdir.
        },
      },
      // Plan 02-01, Task 3 — Phase 2 adds two new projects.
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.spec.{ts,tsx}'],
          setupFiles: ['./tests/setup/jsdom-setup.ts'],
          // No DB; no fileParallelism constraint — UI tests are pure-render.
        },
      },
      {
        extends: true,
        test: {
          name: 'agents',
          environment: 'node',
          include: ['tests/agents/**/*.spec.ts'],
          testTimeout: 60000,
          // RESEARCH landmine #3 — node-pg-migrate advisory lock collides under
          // parallel files when tests call resetSchemaAndMigrate(). Same constraint
          // as the integration project.
          fileParallelism: false,
          // Plan 02-03: inherits vmThreads pool. The agents probes use spawnSync
          // (resetSchemaAndMigrate → npm run migrate) which works under vmThreads.
        },
      },
    ],
  },
});
