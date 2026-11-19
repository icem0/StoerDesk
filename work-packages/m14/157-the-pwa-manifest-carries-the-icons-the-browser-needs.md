# WP-M14-157: the PWA manifest carries the icons the browser needs

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/09-offline.md §9.4; PLAN.md §16
spec-lines: 31

depends-on: WP-M14-155

files-read:

- apps/web/vite.config.ts (the manifest block)
- apps/web/public/logo.png (the only icon asset)
- apps/web/src/__tests__/sw.test.ts (the pattern of a root test)
- apps/web/nginx-pwa.conf.template (the static file locations)
- specs/09-offline.md (§9.4 the PWA shell and service worker)
- docs/REPO-MAP.md (the module table)

files-write:

- apps/web/src/pwa-manifest.ts, apps/web/vite.config.ts
- apps/web/nginx-pwa.conf.template
- apps/web/public/pwa-192x192.png, apps/web/public/pwa-512x512.png
- apps/web/src/__tests__/pwa-manifest.test.ts, specs/09-offline.md (§9.4)

interfaces:

- `pwaIcons` — `IconResource[]` of the manifest: a 192 px and a 512 px PNG icon
- `IconResource` — `{ src: string, sizes: string, type: string }`
- `GET /manifest.webmanifest` — now served as `application/manifest+json`

## Task

**The browser offers no install (out of band in phase 14).** The browser shows
no install prompt and no install chip in the address bar for the app. The
manifest is there and `display: standalone` is right, but its only icon is
`/logo.png` — a 128 × 120 px image declared with `sizes: "any"`. Chrome and Edge
need a **192 px and a 512 px icon** before they offer an install
(web.dev/articles/install-criteria); with the icon missing they keep the app
uninstallable and stay silent.

1. `apps/web/public/pwa-192x192.png` and `apps/web/public/pwa-512x512.png`: the
   StörDesk logo (`docs/material/logo.png`, 471 × 442) centred on a square
   canvas of its own background colour with a margin, so the icon keeps its
   contrast and survives a round or maskable crop.
2. `apps/web/src/pwa-manifest.ts`: `pwaIcons` — the two icons with their
   explicit `sizes`, and the `IconResource` contract of the manifest icons.
3. `apps/web/vite.config.ts`: `icons: pwaIcons` (imported from
   `./src/pwa-manifest`); the plugin precaches them through its
   `includeManifestIcons` default, so `includeAssets` keeps only `logo.png`.
4. `apps/web/nginx-pwa.conf.template`: a `location = /manifest.webmanifest`
   whose `types` block answers `application/manifest+json` — nginx' shipped
   `mime.types` has no entry for the extension.
5. `apps/web/src/__tests__/pwa-manifest.test.ts`: the manifest names a 192 px and
   a 512 px PNG icon and the files in `apps/web/public/` are square PNGs of
   exactly that size — the `IHDR` chunk of the file is read, never the claim of
   the metadata.

## Non-goals

- No HTTPS: the stack still serves plain HTTP and a TLS-terminating proxy stays
  the task of the deployment (`docs/DEPLOYMENT.md` §HTTPS).
- No `screenshots`, no separate `maskable` copy and no `id` in the manifest.
- No install hint inside the app and no `beforeinstallprompt` UI.
- No change of the header logo `/logo.png` and nothing in `apps/api`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build --workspaces --if-present
```

Expected: all green; the new test fails before the change (one icon, 128 px,
`sizes: "any"`) and passes after it. The generated `dist/manifest.webmanifest`
names both icons. The nginx location and the PWA image stay **unverified** here
— the development container has no Docker daemon (`PLAN.md` §18).

## Handoff

- Files changed: `apps/web/src/pwa-manifest.ts`, `apps/web/vite.config.ts`,
  `apps/web/nginx-pwa.conf.template`, `apps/web/public/pwa-192x192.png`,
  `apps/web/public/pwa-512x512.png`,
  `apps/web/src/__tests__/pwa-manifest.test.ts`, `specs/09-offline.md`
  §9.4, `PLAN.md` §16, `CHANGELOG.md`, `docs/REPO-MAP.md` and
  `work-packages/README.md` (their rows of this WP landed in the WP-M14-154b
  commit of the concurrent run), this document
- Interfaces added: `pwaIcons`, `IconResource`; `/manifest.webmanifest` answers
  `application/manifest+json`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check` green; the
  nginx mime type and the Docker image unverified (no Docker daemon)
- Follow-up WP: none — the install prompt is closed by these icons
- Open question: whether a `maskable` copy and `screenshots` are worth the extra
  assets; the rich install UI stays a decision for the office
