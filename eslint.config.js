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

  // Project-wide tuning. Rules are intentionally gentle to start: the most
  // common existing issues (any, console, unused vars) are warnings, not
  // errors, so they don't block the build. Tighten to "error" over time as
  // the codebase is cleaned up.
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
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
      eqeqeq: ['warn', 'always'],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
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
