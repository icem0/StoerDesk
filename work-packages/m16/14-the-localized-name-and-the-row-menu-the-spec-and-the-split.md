# WP-M16-14: the localized name and the row menu — the spec, ADR-0043 and the split

format: small-model
status: done
depends-on: WP-M16-13
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.8; PLAN.md §14, §16, §17
spec-lines: 40

files-read:

- PLAN.md (§14 user interface, §16 phase roadmap, §17 work-package limits)
- specs/13-ui.md (the slice of chapter 14)
- apps/web/src/admin/text-templates-page.tsx (the list with the two names)
- apps/web/src/admin/status-page.tsx (the list with the two names)
- apps/web/src/admin/escalation-page.tsx (the stages with a field per language)
- docs/DECISIONS.md and docs/DECISIONS/0036-the-interface-has-one-server-wide-accent-colour.md

files-write:

- specs/13-ui.md (§14.8, the rule of the localized name and the row menu)
- docs/DECISIONS/0043-the-administration-shows-the-localized-name.md and
  docs/DECISIONS.md (the index)
- PLAN.md (§14, §16 the record of the split)
- work-packages/m16/ (WP-M16-15 … WP-M16-20d, each file created in this commit),
  work-packages/README.md and CHANGELOG.md

interfaces:

- `RowMenu` — the shared `…` button with its menu of the actions of a row
  (`apps/web/src/components/row-menu.tsx`)
- `localizedName(names, locale, fallback)` and `languageRecord(...)` — the name of
  the set language and the record of the languages of an entry
  (`apps/web/src/lib/localized-name.ts`)
- `specs/13-ui.md` §14.8 (the rule of the localized name and the row menu)
## Task

**The comment of the office.** „bei allen menüs sollen nur die für die
eingestellte namen lokalisierten namen angezeigt werden … es kann ja daneben
ein button mit … sein, er beinhaltet dann ein dropdown mit sachen wie Löschen,
bearbeiten usw … unter bearbeiten lässt sich ja der key sowie die
übersetzungstexte aller sprachen anzeigen … das system sollte überall so
etabliert werden.“

This package is the **spec and the split** — it writes no product code:

1. `specs/13-ui.md` gains §14.8: one name per row (the name of
   `i18n.language`, the fallback `de` and then the machine key), the actions of
   the row behind one `…` button, the edit with the key (read-only) and one
   field per language, and the list of the pages that follow the rule.
2. `docs/DECISIONS/0043-the-administration-shows-the-localized-name.md`
   (ADR-0043) decides the rule and names the alternatives it rejected; the
   index of `docs/DECISIONS.md` gains its row.
3. `PLAN.md` §14 gains the requirement, §16 the record of the split.
4. Create the work packages in `work-packages/m16/` in numeric order:
   **WP-M16-15** (the shared row menu and the helper), **WP-M16-16** (the fault
   types), **WP-M16-17** (the detected errors), **WP-M16-18** (the ticket
   statuses), **WP-M16-19** (the stages of the escalation) and **WP-M16-20a …
   WP-M16-20d** (the lists with one name: the groups and the roles, the users,
   the webhooks and the API keys, the readiness pools).
5. Record the phase in `work-packages/README.md` (the backlog rows) and in
   `CHANGELOG.md`.

## Non-goals

- No schema, route, page, component or test code in this package.
- No change of the API: the web composes the record of the languages out of the
  answer of the endpoint (ADR-0043, decision 4).
- No change of the public report form, of the public status page and of the
  printed stickers — they name no entry of the administration.
- No change of the machine keys: the key stays the reference of the workflow,
  the escalation and the tickets.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with the ten new WP files valid; `check` green,
because this package changes documentation only. No Docker gate is part of this
WP.

## Handoff

- Files changed: `specs/13-ui.md`, ADR-0043 and its index row, `PLAN.md` §14 and
  §16, the m16 WP files, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the contracts above — the shared row menu, the helper of the
  localized name and the section of the UI slice
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M16-15, WP-M16-16, WP-M16-17, WP-M16-18, WP-M16-19,
  WP-M16-20a, WP-M16-20b, WP-M16-20c, WP-M16-20d (each file exists in this
  commit)
- Open question: none
