# WP-M5-09: sign-out clears the internal ticket cache (web)

format: small-model
status: done
depends-on: WP-M5-07
phase: 5
milestone: m5
context-budget: 12k tokens
spec: PLAN.md §15 (privacy), specs/09-offline.md §9.4 (service worker messages)
spec-lines: 25

files-read:

- apps/web/src/sw.ts — the `SKIP_WAITING` / `GET_VERSION` / `CLEAR_CACHES` handler
- apps/web/src/lib/outbox.ts — `pendingWrites()` gate (WP-M5-01)
- apps/web/src/admin/update-page.tsx — the existing message-post pattern
- apps/web/src/auth/login-form.tsx — `LogoutButton` and its logout mutation

files-write:

- apps/web/src/sw.ts — the `CLEAR_USER_CACHE` message
- apps/web/src/auth/login-form.tsx — post it on sign-out
- apps/web/src/auth/__tests__/login-form.test.tsx — the post is asserted there

interfaces:

- message `CLEAR_USER_CACHE` → the worker deletes the `internal-tickets` cache
  only (never the precache), answers `CLEAR_USER_CACHE_DONE` on the port
- sign-out posts the message best-effort, like the update page posts
  `CLEAR_CACHES`

## Task

1. Add the message branch to the existing `message` handler in `sw.ts` next to
   `CLEAR_CACHES`, scoped to the `internal-tickets` cache name.
2. Post `CLEAR_USER_CACHE` from `LogoutButton` before the logout mutation runs,
   best-effort (`catch(() => undefined)`).
3. Test: the port answers the done message and only the named cache is deleted
   while precache entries survive; the login-form test asserts the post.

## Non-goals

- No deletion of queued outbox rows: unsent writes belong to the signed-in user
  and survive a sign-out on the same device.
- No change to the update page's `CLEAR_CACHES` semantics.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the handler test fails before the change and passes after.

## Handoff

- Files changed: `apps/web/src/sw.ts` (`clearUserCache` plus the `CLEAR_USER_CACHE` message branch next to the other caches), `apps/web/src/auth/login-form.tsx` (`LogoutButton` posts `CLEAR_USER_CACHE` best-effort before the logout mutation), `apps/web/src/auth/__tests__/login-form.test.tsx` (asserts the post), new `apps/web/src/__tests__/sw.test.ts` (unit tests for `clearUserCache`: only `internal-tickets` is deleted, `CLEAR_USER_CACHE_DONE` answered on the port, precache untouched)
- Interfaces added: `clearUserCache(cacheStorage, port): Promise<void>`; messages `CLEAR_USER_CACHE` → `CLEAR_USER_CACHE_DONE`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint`, `npm run test:run` (the new handler test fails before the change and passes after), `npm run wp:check`
- Follow-up WP: none
- Open question: none
