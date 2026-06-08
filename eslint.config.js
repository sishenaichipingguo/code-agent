import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Ignore build output, deps, and config files
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', 'bun.config.ts'],
  },

  // Base JS + TypeScript recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide rules. The codebase has been cleaned up, so these are
  // enforced as errors to prevent regressions (CI fails on violations).
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Bun: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-empty': 'error',
      'preserve-caught-error': 'error',
      'no-useless-assignment': 'error',
    },
  },

  // Logger and CLI entry legitimately use console; allow it there.
  {
    files: [
      'src/infra/logger/**',
      'src/infra/logger.ts',
      'src/infra/metrics.ts',
      'src/infra/graceful-shutdown.ts',
      'src/cli/**',
      'scripts/**',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // Tests can be looser.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Must be last: turn off rules that conflict with Prettier formatting.
  prettier,
)
