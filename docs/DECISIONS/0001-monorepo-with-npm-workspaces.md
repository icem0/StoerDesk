# ADR-0001: Monorepo with npm workspaces

- Status: accepted
- Date: 2026-10-28
- Stakeholders: project responsibility

## Context

StörDesk consists of a PWA (`apps/web`), an API (`apps/api`) and a shared package
(`packages/shared`) with Zod schemas, types, permission constants and i18n resources.
Shared code is referenced from both sides; the specification is organised in `specs/`
and `work-packages/`.

## Decision

One repository with npm workspaces (`apps/*`, `packages/*`). `packages/shared` is
consumed as a TypeScript source package (no build step of its own in the dev flow); the
API and the web app resolve it through the workspace setup.

## Alternatives

- **Separate repositories**: prevents shared changes to schemas and i18n resources.
- **pnpm/Turborepo**: more tooling overhead with no recognisable benefit at this size.
- **Built shared package (`dist`)**: forces a build order and with it friction in the
  dev flow.

## Consequences

- One `package-lock.json` for all workspaces, `npm ci` installs everything.
- `npm run check` (typecheck, lint, tests, `i18n:check`, `wp:check`) runs across all
  workspaces.
- Consistency of shared code has to be secured by typecheck and tests.
