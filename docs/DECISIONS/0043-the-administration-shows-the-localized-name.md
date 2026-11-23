# ADR-0043: The administration shows the localized name, the row menu carries the actions

- Status: accepted
- Date: 2026-11-23
- Stakeholders: office, admin

## Context

The office read the administration and asked: a list should show only the name
of the language the interface is set to. Beside the name there may be one
button with `…`; it opens a menu with the actions of the row — delete, edit and
the like. Under „edit“ the key and the translation texts of all languages are
visible.

Today a row of the fault types (`/admin/text-templates`), of the detected
errors (`/admin/detected-errors`) and of the ticket statuses
(`/admin/statuses`) carries the machine key, the German name and the English
name next to each other, and the escalation stage carries a field per
language. Every further language would add another column, the row would grow
into three lines and the actions of the row would be pushed out of the sight.
The tables are the widest surfaces of the administration and they are read on
a laptop as well as on a phone.

The data itself is not the problem: the texts are already localized
(`text_template_translations`, the `names` of a status, the `names` of a stage).
Only the presentation of them is.

## Decision

1. **One name per row.** A list of the administration shows the name of the
   interface language (`i18n.language`) and nothing else as the name of the
   entry. The fallback is `de` and then the machine key, so a row is never
   nameless.
2. **The actions of a row sit behind one `…` button.** The button opens a
   menu with the actions of that row (edit, archive, delete …). The menu
   closes on a click beside it, on `Escape` and after an action was chosen.
   The list itself carries no action button any more.
3. **The edit shows the key and every translation.** The machine key is
   readable — read-only where the entry is referenced by the workflow, the
   escalation or the tickets (the fault types, the ticket statuses, the stages
   of the escalation), editable where the API allows a rename (the detected
   errors). The texts are editable, one field per language the entry carries.
4. **The API stays as it is.** The web composes the record of the languages
   out of what the endpoint answers (`translations` of a fault type, `nameDe`
   and `nameEn` of a status, `labelDe` and `labelEn` of a detected error,
   `names` of a stage). A language that is added later grows the edit dialog
   and never the table.
5. **The rule holds for every list of the administration that names an entry in
   a row:** the fault types, the detected errors, the ticket statuses, the
   stages of the escalation, the groups, the roles, the users, the webhooks, the
   API keys and the readiness pools. The channels of `/admin/channels` are
   configuration cards — every card carries its own form — so they keep their
   form and name their channel once.

## Alternatives

- **A column per language (the state of today):** rejected. The width of the
  table grows with every language, the actions of the row leave the visible
  area and the administration looks like a translation tool instead of a list
  of entries.
- **Only the key and the name, the texts somewhere else:** rejected. The
  administration would have to leave the list to correct a translation, and
  the texts are the reason the entry exists.
- **A separate page per language:** rejected. The office corrects the German
  and the English text of a fault type in one place; a page per language would
  make that two journeys.
- **A modal dialog for every edit:** rejected for the entries that are edited
  often (the stages of the escalation). The rule is about the *list*: one name
  per row and one menu per row. The edit itself stays where the page already
  keeps it.

## Consequences

- The lists of the administration become narrow and stay narrow; a row is one
  line high and the actions are one click away.
- The machine key is reachable in two ways: the tooltip of the name and the
  read-only field of the edit.
- The web needs one shared row menu (`apps/web/src/components/row-menu.tsx`)
  and one shared helper for the localized name
  (`apps/web/src/lib/localized-name.ts`); every list uses them, so the
  behaviour of the menu is the same everywhere.
- A language that arrives later is a field in the edit dialog. The table does
  not know it.
