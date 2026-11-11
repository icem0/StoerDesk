# WP-M10-40: Shell header — logo left, menu centred, mobile tab strip

format: small-model
status: done
depends-on: WP-M1-13, WP-M1-17
phase: 10
milestone: m10
context-budget: 18k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 40

files-read:

- apps/web/src/components/Shell.tsx (the header and the settings dropdown)
- apps/web/src/i18n/locales/de/common.json (the navigation and settings labels)
- apps/web/src/i18n/locales/en/common.json (the navigation and settings labels)

files-write:

- apps/web/src/components/Shell.tsx
- docs/REPO-MAP.md

interfaces:

- header desktop: `[ Logo + Titel ] [ Menü (zentriert) ] [ Version | Einstellungen ]` in einer Zeile
- header mobil: `[ Logo ] .... [ Version | Einstellungen ]`, darunter die Nav als scrollbare Tab-Leiste
- eine einzige DOM-Navigation für beide Layouts (keine doppelten Links)
- keine neuen i18n-Keys (bestehende `app.nav.*` werden wiederverwendet)

## Task

1. Header auf volle Viewport-Breite (kein `mx-auto max-w-5xl` mehr auf dem Header-Container), damit das Logo bei genug Platz ganz am linken Rand sitzt.
2. Eine einzige `<nav>` (ein DOM-Knoten, damit Tests und Screenreader keine doppelten Links sehen) wird per Flex-Reihenfolge umgesetzt:
   - Desktop (`sm+`, genug Platz): Logo links, die Nav als mittlere Zone (`flex-1 justify-center`, also mittig zwischen Logo und Aktionen), Version und Einstellungs-Getriebe rechts — alles in einer Zeile, keine zweite Nav-Zeile mehr.
   - Mobil (wenig Platz): Logo links, Version + Getriebe rechts in der ersten Zeile; die Nav bricht per `w-full` in eine eigene Zeile um und scrollt horizontal als breite Tab-Leiste (Touch-Targets ≥ 44 px). Der Titel wird auf dem Handy ausgeblendet, das Logo bleibt als Marke.
3. Keine neuen i18n-Keys; die Nav nutzt `app.nav.dashboard`, `app.nav.tickets` und `app.nav.oncall`.
4. Touch-Targets bleiben ≥ 44 px (PLAN.md §14 Barrierefreiheit).

## Non-goals

- Keine neuen i18n-Keys.
- Keine Änderung der Routen und keine Änderung der Seiten hinter dem Menü.
- Keine Änderung des `SettingsMenu` selbst (bleibt so, nur die Position im Header bleibt rechts).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; Logo sitzt ganz links, das Menü ist mittig oben in derselben Zeile wie das Logo, auf dem Handy sind die Nav-Links eine Tab-Leiste unter der ersten Zeile.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `docs/REPO-MAP.md`
- Interfaces added: none new (reuses existing i18n keys)
- Verified: typecheck, lint, test:run, i18n:check, wp:check, build
- Follow-up WP: none
- Open question: none
