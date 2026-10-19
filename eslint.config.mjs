import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['node_modules/**', 'backend/node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  { files: ['**/*.{js,mjs,cjs}'], rules: { 'no-undef': 'error' } }
];
