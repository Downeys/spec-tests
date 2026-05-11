// A1 — lint half. Bans console / process.stdout.write / process.stdout.end
// inside src/. Tests can use console freely (vitest writes to stdout itself).
//
// The runtime guard (src/lib/stdout-guard.ts) is the second half of A1 — it
// catches transitive deps that lint can't see at edit time.

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'wiki/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts', 'bin/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // A1 — the load-bearing rule. console.* and process.stdout.* corrupt MCP stdio.
      // Logger lives at src/lib/logger.ts and writes to stderr.
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='stdout'][property.name='write']",
          message:
            'process.stdout.write corrupts the MCP JSON-RPC stream. Use the logger from src/lib/logger.ts (writes to stderr) or route through src/lib/stdout-guard.getTrustedStdout() if this is the MCP transport.',
        },
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='stdout'][property.name='end']",
          message:
            'process.stdout.end corrupts the MCP JSON-RPC stream. See src/lib/logger.ts.',
        },
      ],
      // Surface unused vars; matches the strict tsconfig stance.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // src/lib/stdout-guard.ts is the only file allowed to touch process.stdout
  // directly — its job is to snapshot the real write fn and poison the
  // descriptor. The rest of src/ stays under the no-restricted-syntax rule.
  {
    files: ['src/lib/stdout-guard.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Tests: lint rules are relaxed. Vitest writes its own output to stdout
  // and tests sometimes use console.* for in-test diagnostics.
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
    },
  },
];
