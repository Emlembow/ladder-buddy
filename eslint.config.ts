import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        chrome: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'prefer-const': 'error',
    },
  },
);
