# WP-M46-05: the German interface speaks German

format: ctx-256k
status: planned
depends-on: —
phase: 46
milestone: m46
context-budget: 45k tokens
spec: PLAN.md §3, §3.1
spec-lines: 60
changed-lines: 420

files-read:

- PLAN.md §3, §3.1, §17, §18
- scripts/i18n-check.ts
- apps/web/src/i18n/locales/de/settings.json, common.json, object.json, ticket.json
- apps/web/src/i18n/locales/en/settings.json, common.json, object.json, ticket.json

files-write:

- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/de/ticket.json
- scripts/i18n-check.ts
- scripts/i18n-language-allowlist.json

interfaces:

- `npm run i18n:check` fails when a `de` value is identical to its `en` twin
  or reads as English (a list of English function words without any German
  one), except for the keys of `scripts/i18n-language-allowlist.json`
  (product names, units, codes such as „SMTP“, „ntfy“, „API“)

## Task

The review of 2026-11-27 found about 40 English texts in the German locale.
`i18n:check` proves only that a key exists in both languages, never that
the German file is German. The places the office sees:

- `settings.json` `admin.status.*`: the whole status administration — the
  hint, „not final“, „Color“, „Actions“, „Status {{key}} edit“, the
  truncated „Lösch“, every error text and „Saved.“;
- `settings.json` `admin.email.standardRegistration`,
  `standardPasswordReset`, `standardCustomerTicket`: the **standard texts of
  the customer mails** are English in the German installation;
- `settings.json` `admin.channels.curlTokenHint`, `ntfyTokenHint`,
  `webpushIncompleteTrio`, `admin.delivery.reasons.push_no_subscription`;
- `object.json` `import.*`: the CSV import (hint, read-only notice, mapping,
  row errors, results, every error text);
- `common.json` `branding.*`: „Akzentcolor“, „Picker (internen Kommentar)“,
  „Picker (Interface)“, „Das Akzentcolor der Interface“, the English
  `hintPicker`; the page title „GUI anpassen“ becomes the name of its menu
  entry „Darstellung & Logo“;
- `ticket.json` `dashboard.topFault.count`: „{{count}}-mal in the last 30
  days“.

1. Translate every listed value into German with the meaning of its `en`
   twin; keep the placeholders (`{{key}}`, `{ticket_no}`, …) unchanged. Use
   the terms of the interface: „Farbe“, „Aktionen“, „final / nicht final“,
   „Akzentfarbe“, „Farbwähler“.
2. `scripts/i18n-check.ts`: after the key comparison, flag every `de` value
   that equals its `en` value or matches the English heuristic, unless its
   key is in the allowlist. The report names file, key and value.
3. `scripts/i18n-language-allowlist.json`: the few keys whose value is
   legitimately the same in both languages (found by the first run).
4. Run the check; fix what it finds beyond the list above or allowlist it
   with a reason in the commit body.

## Non-goals

- No change of the English locale except a missing twin the check finds.
- No change of the mail templates stored in an installation: a saved
  template is data of the office; only the standard text changes.
- No other language.

## Acceptance

```bash
npm run i18n:check
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; `i18n:check` fails before step 1 with the new rule and
passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question (if any):
