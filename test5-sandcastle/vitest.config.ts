import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
        'apps/agent/main.ts',
        'apps/api/main.ts',
        'apps/ui/src/main.tsx',
        'apps/ui/vite.config.ts',
        'apps/ui/playwright.config.ts',
        'apps/ui/e2e/**',
      ],
    },
  },
});
