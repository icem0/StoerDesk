# WP-M14-149a: the catalogue knows the key of the internal comment

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/01-rbac.md §3.3, §3.4; docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md
spec-lines: 30

depends-on: WP-M14-149

files-read:

- packages/shared/src/permissions.ts (the catalogue and the matrix of the roles)
- packages/shared/src/__tests__/permissions.test.ts (the test of the catalogue)
- specs/01-rbac.md (§3.3 the matrix, §3.4 the catalogue)

files-write:

- packages/shared/src/permissions.ts
- packages/shared/src/__tests__/permissions.test.ts

interfaces:

- `PERMISSIONS.ticket.internalComment` — the key `ticket.comment.internal` in the catalogue
- `PERMISSION_KEYS` — the list of the keys; the new key belongs to it
- `DEFAULT_ROLES` — the five system roles; none of them holds the new key

## Task

1. `packages/shared/src/permissions.ts`: the group `ticket` gains the entry
   `internalComment: 'ticket.comment.internal'`, and `PERMISSION_KEYS` gains the
   key. The key is a constant of the catalogue — the seed, the API guard and the
   UI read it from here.
2. The same file: `DEFAULT_ROLES` stays as it is — the key belongs to no
   default role, the administration grants it to a role or to a colleague. The
   `admin` role holds it through `PERMISSION_KEYS`, like every other key.
3. `packages/shared/src/__tests__/permissions.test.ts`: the test proves that the
   key is in the catalogue, that every key of the catalogue is a valid key and
   that no default role holds it — the role `admin` excepted.

## Non-goals

- No seed change: `seedRbac` writes every key of `PERMISSION_KEYS` into the
  table `permissions`, so the key exists in the database with the next start.
- No route, no guard: the guard of the route follows in WP-M14-149b.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the catalogue of the permissions, its test, this document
- Interfaces added: the key `ticket.comment.internal`
- Verified: `npm run check`
- Follow-up WP: WP-M14-149b (the route of the internal comment)
- Open question: none
