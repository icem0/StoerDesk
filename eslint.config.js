import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    name: 'stoerdesk/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'docs/material/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    name: 'stoerdesk/node',
    files: ['**/*.{ts,tsx,mjs,cjs}', 'scripts/**'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    name: 'stoerdesk/browser',
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    name: 'stoerdesk/react-hooks',
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    name: 'stoerdesk/react-refresh',
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    name: 'stoerdesk/i18n',
    files: ['apps/web/src/**/*.tsx'],
    plugins: {
      i18next,
    },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          validateTemplate: true,
          message: 'UI-Texte nur über i18n-Keys (siehe specs/00-conventions.md §0.1).',
        },
      ],
    },
  },
  {
    name: 'stoerdesk/rules',
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  {
    name: 'stoerdesk/scripts',
    files: ['scripts/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
]
