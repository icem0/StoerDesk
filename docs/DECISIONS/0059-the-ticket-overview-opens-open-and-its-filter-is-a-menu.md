# ADR-0059: The ticket overview opens open and its filter is a menu

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office

## Context

The list at `/tickets` showed **every** ticket of the instance: the open work
and the finished work in one table, and the finished tickets had to be pushed
out of the way with the switch „nur offene“. The office asked for three
changes: „in der ticketübersicht sollen in der grundeinstellung nur die offenen
zu sehen sein und die option nur offene muss weg und eine checkbox erledigte
anzeigen“; „ausserdem will ich das ganze cleaner gestalten … der filter soll
ein pulldown menü werden neben dem button neue meldung soll ein button mit
filter“.

The page carried five filter fields in one row under the header — the search
field, the status, the priority and two switches — and the row wrapped on a
phone. The filters of the page live in the URL, so every field of the row was
a place to look at.

## Decision

1. **The overview opens on the open tickets.** Without a filter the page asks
   the API with `open=true`. The option „nur offene“ is **gone** — the default
   carries it.
2. **A checkbox „Erledigte anzeigen“ takes the completed ones in.** The
   checkbox lives in the filter menu; while it is checked the page asks the API
   without the filter `open`, so the closed and the cancelled tickets join the
   list. The open tickets keep the first places (§14.9).
3. **The filters sit in a menu.** The **Filter button** stands beside
   „Neue Meldung“ in the header of the page and pulls the menu down below the
   header; the menu holds the search field, the status, the priority, the
   checkbox of the completed tickets and the switch of the overdue ones. The
   menu is closed at the start.
4. **The API is untouched.** `open` keeps its three states (absent, `true`,
   `false`); the page sends `open=true` or nothing. The choice of the page
   lives in the URL as `closed=true`.

## Alternatives

- **The API would answer the open tickets by default.** Rejected: the external
  list of the API keys and the saved views would change their meaning with it,
  and the office asked for the change of the overview, not of the contract.
- **The filter row would stay and only the switch would change.** Rejected:
  the office asked for a cleaner page and for the filters in a menu.
- **The menu would be a native `<details>` or a list of links.** Rejected: the
  filter holds a form — a search field, two selects and two switches — and not
  a list of actions.
- **The completed tickets would be a separate list.** Rejected: the office
  wants one list, with the completed ones among the open ones.

## Consequences

- Positive: the page opens on the work that is to do; the header carries two
  buttons and the filters are one click away.
- Negative: a ticket that is finished is not in the list at the start — the
  office has to check the box to see it.
- A link of the office with the old parameter `open=true` shows the open
  tickets as well: the default of the page is the same list.
- Follow-up WPs: `WP-M35-03` (the overview of the ticket list, out of band in
  phase 35).
