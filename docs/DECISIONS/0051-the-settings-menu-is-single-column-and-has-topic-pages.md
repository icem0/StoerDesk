# ADR-0051: The settings menu is single-column and has topic pages

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, developers

## Context

The settings overview (`/settings`) lists every module of the administration in one
flat grid: six topic sections, 30 links, two columns on desktop (`sm:grid-cols-2`).
The section „Verwaltung" alone carries 15 entries — users, roles, groups, statuses,
fault types, detected errors, escalation, defaults, readiness, channels, delivery
problems, mailbox, API keys, webhooks, BMAcloud sync. A user looking for the Matrix
server must open the channels card inside one long page where every channel is pressed
together underneath one another. The header menu already holds the daily work surfaces
(tickets, statistics, readiness, inbox), so the settings menu duplicates them
(Meldungen, Statistik, „Neue Störung melden", „Meine Bereitschaft" → `/oncall`).
There are no symbols in the menu, and the links carry no short description of what
they do.

## Decision

The settings menu becomes single-column. Each entry carries a symbol and a short
description; a search field filters name and description; the sections are
collapsible. The work surfaces and the duplicate readiness entry leave the menu.
The 15 administration entries are not listed individually any more: each topic gets
its own overview page (`/admin/access`, `/admin/workflow`, `/admin/readiness`,
`/admin/messaging`) whose links open the modules. The channels page loses its
one-page-for-all-channels layout: each channel gets its own page
(`/admin/channels/:kind`, e. g. Matrix with homeserver and room), reachable by one
link from the overview page. Every settings/administration page keeps exactly one
`<main>` landmark inside the shell, a heading and a back link.

This reverses WP-M14-01 („the administration home is gone") deliberately: the
administration home did not disappear, it split into four topic pages, because a flat
list of 30 entries under one another is not operable.

## Alternatives

- Keep the flat list and add only symbols and a search field: the list stays 30
  entries long on one page; the Matrix server remains one card among many.
- Move everything back into a real administration home (`/admin`): that route was
  removed on purpose (WP-M14-01) and would recreate the second entry point the
  settings page replaced.
- Add a third-party icon library (lucide/heroicons): rejected, the repo paints its
  symbols as hand-written inline SVGs (gear, bell) and adds no dependency for it.

## Consequences

- Positive: one column is scannable on phones and desktops; symbols and descriptions
  make each entry self-explanatory; the search field tames 30+ entries; each channel
  is configurable on its own page.
- Negative: more clicks from the menu to a module (menu → topic page → module); the
  decision reverses a phase-14 rule, so bookkeeping (specs, ADR, PLAN, REPO-MAP)
  names the reversal explicitly.
