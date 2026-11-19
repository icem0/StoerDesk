# ADR-0036: The interface has one server-wide accent colour

- Status: accepted
- Date: 2026-11-19
- Stakeholders: office, admin, internal user, reporter

## Context

The office asked for a facelift of the whole interface. Every accent of the
interface — the active entry of the header menu, the links of the settings
menu, the focus ring, the badge of the unread messages — is a fixed Tailwind
step (`sky-*`) chosen at build time. A deployment therefore always paints the
same blue, and a branded instance (company name, logo, the colour of the
internal comment under „Darstellung“) still looks like the demo.

The accent has to come from the instance. Three places could decide it: a CSS
file the deployment ships (a build decision, not configurable at runtime), a
preference per user (the theme of WP-M2-92 is per user and works offline) or
the settings of the instance. A per-user accent would need a new column of
`users`, a form on the personal settings page and would fight the branded
look: the company colour belongs to the instance, not to one colleague.

## Decision

1. **One accent per instance.** The value is `accentColor`, a hex colour
   `#rrggbb`, stored in the existing jsonb row of the `branding` settings key —
   no table, no migration, no new route. The default is `#0ea5e9`, the blue the
   interface painted before, so an instance that configures nothing looks
   like it looked before.
2. **The administration sets it under „Darstellung“.** The field sits on the
   page of the branding next to the colour of the internal comment: the
   presentation of the instance is configured in one place, one save writes the
   whole row. A hex value that is malformed never leaves the browser.
3. **The colour travels to the shell through the branding.** `GET
   /api/v1/settings/branding` (already read by the shell) answers it, and `GET
   /api/v1/settings/display` answers it beside the colour of the internal
   comment, because a colour of the presentation is no secret.
4. **One CSS custom property carries it, the ramp stays in the stylesheet.**
   The shell writes the value into `--brand-accent` on its own root;
   `styles.css` derives `--color-accent-300 … --color-accent-700` from it with
   `color-mix()` and the light theme mixes towards black. Every interface class
   paints `*-accent-*` instead of a Tailwind step. A page that needs no
   session never sees the colour and keeps the default of `:root`.

## Alternatives

- **A preference per user (`users.accent`):** rejected. The colour belongs to
  the instance and to its branding; a per-user accent would need a column, a
  personal form and would let one colleague destroy the branded look.
- **A Tailwind palette swapped at build time:** rejected. It cannot be
  configured in a running deployment and every accent would need a rebuild.
- **Arbitrary-value classes (`bg-[var(--brand-accent)]`):** rejected for the
  ramp. The interface needs several steps of one colour (background tint,
  border, text); deriving them at the place of use repeats the mixing rule in
  every class.
- **Overriding the Tailwind `sky-*` variables:** rejected. It would silently
  repaint the blues that are not accents (the info semantics of the readiness
  calendar, the dashboard tiles), so the accent could no longer be taken away
  from a semantics colour.

## Consequences

- One configuration line repaints the frame of the whole interface; the branded
  instance and the interface agree.
- The accent is a value of the instance: it is cached with the branding
  request of the shell and needs no request of its own.
- A page outside the shell (the public report form, the public status page, the
  sticker sheets) keeps the default blue — those surfaces are not the
  interface of the colleagues and the report form must stay familiar.
- `styles.css` gains the ramp, the interface classes gain one name
  (`accent`), and the light theme keeps working because it mixes the same
  property.
- A custom accent has to be checked for contrast by the office: the ramp keeps
  the luminance distance to the background, but a colour the office chooses can
  still be too weak — the AA requirement of §14.2 stays a manual check.
