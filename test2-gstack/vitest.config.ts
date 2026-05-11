import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Per-file isolation lets each test file get its own Testcontainers
    // Postgres without ports colliding. forks pool keeps things deterministic
    // on Windows (threads pool can be flaky with native deps).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    // First run pulls postgres:16 (~30s on a fresh box). Don't time out.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Tests live under tests/. Production code is in src/.
    include: ['tests/**/*.test.ts'],
    // Smoke / integration tests use real Docker; mark them so they can be
    // skipped via `vitest --exclude tests/integration` if Docker is down.
    sequence: { concurrent: false },
  },
});
