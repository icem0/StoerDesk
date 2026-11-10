# WP-M10-06: OpenAPI document under /api/docs

format: small-model
status: done
depends-on: WP-M10-05
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; docs/DECISIONS/0013-external-api-keys-webhooks-openapi.md
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.5)
- apps/api/src/index.ts
- packages/shared/src/schemas/api-key.ts
- packages/shared/src/schemas/object.ts

files-write:

- apps/api/src/{openapi.ts,__tests__/openapi.spec.ts}
- apps/api/src/index.ts
- apps/api/package.json

interfaces:

- `GET /api/docs` and `GET /api/docs/json`
- OpenAPI 3.1 with bearer auth and the external API paths

## Task

1. Add `@fastify/swagger` and `@fastify/swagger-ui` to the API workspace.
2. Build the external OpenAPI document from the shared Zod contracts using
   `z.toJSONSchema`, covering API keys, external objects and external tickets.
3. Serve the JSON and the UI at `/api/docs/json` and `/api/docs`; keep the
   routes public and data-free.
4. Register the plugin in `index.ts`.

## Non-goals

- No annotation of every office-internal route.
- No webhook schema yet; WP-M10-11 extends the document.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; an integration test fetches `/api/docs/json` and finds the
bearer scheme and the external object/ticket paths.

## Handoff

- Files changed: the OpenAPI module, its unit test, the server registration
  and the API dependencies
- Interfaces added: `/api/docs`, `/api/docs/json`
- Verified: the commands above
- Follow-up WP: WP-M10-11 (webhook paths in the document)
- Open question: none
