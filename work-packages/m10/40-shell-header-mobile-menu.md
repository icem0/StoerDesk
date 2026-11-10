# WP-M10-40: Shell header — logo left, menu centred, mobile drawer

format: small-model
status: planned
depends-on: WP-M1-13, WP-M1-17
phase: 10
milestone: m10
context-budget: 18k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 40

files-read:

- apps/web/src/components/Shell.tsx (the header and the settings dropdown)
- apps/web/src/styles.css (the light theme and mobile table overrides)
- apps/web/src/i18n/locales/de/common.json (the navigation and settings labels)
- apps/web/src/i18n/locales/en/common.json (the navigation and settings labels)

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/styles.css

interfaces:

- header: `[ Logo + Titel ] [ Menü (zentriert) ] [ Version | Einstellungen ]` auf Desktop
- mobile Drawer mit allen Nav-Zielen über einen Hamburger-Button (≥ 44 px)
- keine neuen i18n-Keys (bestehende `app.nav.*` und `auth.*` werden wiederverwendet)

## Task

1. Header auf volle Viewport-Breite (kein `mx-auto max-w-5xl` mehr auf dem Header-Container). Drei Zonen mit `justify-between`:
   - links: Logo (`/logo.png`) + Titel, Logo sitzt ganz am linken Bildschirmrand wenn genug Platz ist.
   - mittig: die Nav-Links `Dashboard` und `Tickets` (bisher in der zweiten Zeile), zentriert über `flex-1 justify-center`.
   - rechts: `AppVersion` und das `SettingsMenu`-Getriebe.
2. Die zweite Nav-Zeile unter dem Header entfällt; die Links leben nur noch im Header.
3. Mobile (Handy, wenig Platz): Logo klein (nur Bild-Marke, Titel ausblenden), ein Hamburger-Button (≥ 44 px Touch-Target) öffnet eine von rechts einfahrende Schublade (Drawer) mit allen Nav-Zielen (Dashboard, Tickets, Objekte, Einstellungen, Abmelden, Version). Der Drawer lässt sich per Escape und Klick ausserhalb schliessen.
4. Keine neuen i18n-Keys; die Drawer-Einträge nutzen `app.nav.dashboard`, `app.nav.tickets` und die bestehenden `auth.links.*` Keys.
5. Touch-Targets bleiben ≥ 44 px (PLAN.md §14 Barrierefreiheit).

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

Expected: all green; Logo sitzt ganz links, das Menü ist mittig oben, auf dem Handy öffnet der Hamburger-Button die Schublade.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `apps/web/src/styles.css`
- Interfaces added: none new (reuses existing i18n keys)
- Verified: typecheck, lint, test:run, i18n:check, wp:check, build
- Follow-up WP: none
- Open question: none
