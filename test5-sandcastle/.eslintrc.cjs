module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'boundaries', 'local'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json', './apps/ui/tsconfig.json'],
      },
    },
    'boundaries/elements': [
      { type: 'domain', pattern: ['packages/domain'] },
      { type: 'application', pattern: ['packages/application'] },
      { type: 'external', pattern: ['packages/external'] },
      { type: 'external', pattern: ['packages/openbrain'] },
      { type: 'presentation', pattern: ['apps/*'] },
    ],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'domain', allow: ['domain'] },
          { from: 'application', allow: ['domain', 'application'] },
          { from: 'external', allow: ['domain', 'application', 'external'] },
          { from: 'presentation', allow: ['domain', 'application', 'external', 'presentation'] },
        ],
      },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',
  },
  ignorePatterns: [
    'node_modules',
    '.sandcastle',
    'coverage',
    'dist',
    '*.cjs',
    '*.js',
    '*.mjs',
    'vitest.workspace.ts',
    'vitest.config.ts',
    'apps/ui/vite.config.ts',
    'apps/ui/playwright.config.ts',
    'apps/ui/e2e/**',
  ],
};
