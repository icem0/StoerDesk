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
collapsible. The work surfaces leave the menu — they live in the header menu. The
menu names **every module of the administration with its path**: users, roles,
groups, statuses, fault types, detected errors, escalation, default values,
readiness plan, channels, delivery problems, mailbox of the office, webhooks, API
keys and the BMAcloud sync stand there directly. No module disappears behind a
level of indirection; the groups only sort them. The channels page loses its
one-page-for-all-channels layout: each channel gets its own page
(`/admin/channels/:kind`, e. g. Matrix with homeserver and room), reachable by one
link. Every settings/administration page keeps exactly one `<main>` landmark inside
the shell, a heading and a back link.

This reverses WP-M14-01 („the administration home is gone") only in its sorting: the
administration stays a list of modules, but a sorted one — single-column, with
symbols, with a description per entry and with a search field.

## Alternatives

- Keep the flat list and add only symbols and a search field: the list stays 30
  entries long on one page; the Matrix server remains one card among many.
- Put the modules behind four topic pages (`/admin/access`, `/admin/workflow`,
  `/admin/readiness`, `/admin/messaging`): tried in WP-M29-04 and reversed in
  WP-M29-06 — the paths of the settings disappear from the menu, and a second click
  buys nothing, because the menu was sorted anyway.
- Move everything back into a real administration home (`/admin`): that route was
  removed on purpose (WP-M14-01) and would recreate the second entry point the
  settings page replaced.
- Add a third-party icon library (lucide/heroicons): rejected, the repo paints its
  symbols as hand-written inline SVGs (gear, bell) and adds no dependency for it.

## Consequences

- Positive: one column is scannable on phones and desktops; symbols and descriptions
  make each entry self-explanatory; the search field tames 30+ entries; every path
  stays one click away; each channel is configurable on its own page.
- Negative: the menu is long again — the groups and the collapsible section of the
  administration keep it short on the screen; the decision reverses a phase-14 rule,
  so bookkeeping (specs, ADR, PLAN, REPO-MAP) names the reversal explicitly.
