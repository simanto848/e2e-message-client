const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/', 'dist/', '.expo/', 'android/build/', 'android/app/build/'],
  },
  {
    rules: {
      'no-console': 'warn',
      // Disabled: eslint-import-resolver-typescript native binding is broken
      // under bun-installed node_modules (unrs-resolver). Re-enable after a
      // clean `npm i`. These are import-resolution only, not logic checks.
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
];
