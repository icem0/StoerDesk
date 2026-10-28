# WP-M1-01: Monorepo-Grundgerüst

depends-on: —
milestone: m1

## Ziel

npm-Workspaces mit apps/web, apps/api, packages/shared. TypeScript strict.
ESLint + Prettier + Vitest konfiguriert. `npm run check` existiert.

## Spec-Referenzen

- specs/00-conventions.md §Stack
- specs/14-nfr.md §Wartbarkeit

## Aufgabe

1. Root-`package.json` mit `"workspaces": ["apps/*", "packages/*"]`
2. `tsconfig.base.json` (strict, ES2022, moduleResolution bundler)
3. `apps/web/package.json` (React, Vite, TS)
4. `apps/api/package.json` (Fastify, Drizzle, TS)
5. `packages/shared/package.json` (TS, exports)
6. `.eslintrc.cjs` mit `@typescript-eslint`, `i18next/no-literal-string` (error, nur apps/web/src/**/*.tsx)
7. `.prettierrc`
8. `vitest.config.ts` pro Workspace
9. Root-Skript `"check": "tsc --noEmit && eslint . && vitest run && npm run i18n:check"`
10. Root-Skript `"i18n:check": "tsx scripts/i18n-check.ts"`

## Nicht im Scope

- Fachlicher Code
- Docker
- i18n-Dateien (WP-M1-04)

## Akzeptanz

- `npm install` läuft durch
- `npm run check` läuft durch (leere Tests, leere i18n)
- `tsc --noEmit` in jedem Workspace grün
