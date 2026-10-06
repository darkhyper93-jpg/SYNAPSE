// Minimal lint config (ESLint flat config). Run: npx eslint src tests
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', location: 'readonly',
        performance: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        console: 'readonly', process: 'readonly', structuredClone: 'readonly', Node: 'readonly',
        HTMLButtonElement: 'readonly', URLSearchParams: 'readonly', getComputedStyle: 'readonly',
        MutationObserver: 'readonly', history: 'readonly', self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-const-assign': 'error',
      'prefer-const': 'warn',
    },
  },
];
