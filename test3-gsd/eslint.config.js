import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.node.json' },
    },
    plugins: { '@typescript-eslint': tseslint, react },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Security mitigation (RESEARCH.md §Security Domain): forbid raw sql template
      // interpolation in repo layer — Drizzle parameterized queries only
      'no-restricted-syntax': [
        'error',
        {
          selector: "TaggedTemplateExpression[tag.name='sql'] TemplateLiteral Expression",
          message:
            'Raw sql interpolation forbidden in repo layer; use Drizzle parameterized queries.',
        },
      ],
    },
  },
  { ignores: ['dist/', 'node_modules/', 'src/ui/**'] },
];
