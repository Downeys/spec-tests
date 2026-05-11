// IDE-compatibility shim. ESLint 9 reads `eslint.config.js` (flat config) and
// ignores this file. Older IDE plugins that have not migrated to flat config
// fall back to this file so they can still highlight rules in-editor.
//
// Keep this minimal — it is intentionally a subset of `eslint.config.js`.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '.turbo', '_bmad', '_bmad-output'],
};
