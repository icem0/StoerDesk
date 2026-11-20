import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import {
  brandingResponseSchema,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_TICKET_SORT_DIRECTION,
  displaySettingsResponseSchema,
  PERMISSIONS,
  titleSwitchResponseSchema,
  type TicketSortDirection,
  updateBrandingRequestSchema,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { BRANDING_KEY, parseTitleEnabled } from './branding-state'
import { detectImageType } from '../tickets/photos'

/**
 * Public branding settings (`PLAN.md` §14, WP-M2-29 / WP-M4-09).
 *
 * One jsonb row under the key `branding` of the existing `settings` table:
 * `{ companyName, titleEnabled, logo }`. No new table, no migration.
 *
 * `GET /api/v1/settings/branding` — `settings.read`, answers `{ companyName, titleEnabled, logo }`
 * (`''`, `false` and `''` when nothing is configured yet).
 * `PUT /api/v1/settings/branding` — `settings.write`, upserts the row and
 * answers the stored value. A malformed body answers `400 invalid_request`.
 * `logo` is an optional `data:image/jpeg` / `data:image/png` base64 URL (at most
 * `MAX_LOGO_BYTES`); `''` or `null` removes the logo. WP-M2-04c and WP-M9-32 both
 * verify the bytes with `detectImageType` — the claim never wins.
 *
 * The row carries the colour of the internal comment as well (ADR-0034): the
 * administration sets it under „Darstellung", and `GET /api/v1/settings/display`
 * (`ticket.read`) answers it for the ticket view — a colour is no secret.
 *
 * Since ADR-0036 the row carries the accent colour of the interface as well:
 * `accentColor` answers in the branding response for the shell and in the
 * display response beside the internal comment colour. One save of the
 * Darstellung writes the whole row, a body without the colour keeps the stored
 * one, and the shell carries the value into the CSS property `--brand-accent`.
 */

/** At most 500 kB of logo payload stored in the settings row. */
const MAX_LOGO_BYTES = 500 * 1024

/** `data:image/jpeg` / `data:image/png` base64 data URL. */
const LOGO_DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/

/** A colour of the form `#rrggbb`. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** The default colour of the internal comment: a dark red (ADR-0034). */
const DEFAULT_INTERNAL_COMMENT_COLOR = '#7f1d1d'

function storedCompanyName(value: unknown): string {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { companyName?: unknown }).companyName === 'string'
      ? (value as { companyName: string }).companyName
      : ''
  )
}

function storedTitleEnabled(value: unknown): boolean {
  return parseTitleEnabled(value)
}

function storedLogo(value: unknown): string {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { logo?: unknown }).logo === 'string'
      ? (value as { logo: string }).logo
      : ''
  )
}

/**
 * The colour of the internal comment (ADR-0034): the stored value of the row,
 * else the default of the server — a dark red. A row with a value that is no
 * hex colour answers the default as well.
 */
function storedInternalCommentColor(value: unknown): string {
  const color =
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { internalCommentColor?: unknown }).internalCommentColor === 'string'
      ? (value as { internalCommentColor: string }).internalCommentColor
      : ''

  return HEX_COLOR.test(color) ? color : DEFAULT_INTERNAL_COMMENT_COLOR
}

/**
 * The accent colour of the interface (ADR-0036): the stored value of the row,
 * else the default of the server — the blue the shell painted before. The
 * administration sets it under „Darstellung“ and the shell carries it into
 * `--brand-accent`; a row with a value that is no hex colour answers the
 * default as well.
 */
function storedAccentColor(value: unknown): string {
  const color =
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { accentColor?: unknown }).accentColor === 'string'
      ? (value as { accentColor: string }).accentColor
      : ''

  return HEX_COLOR.test(color) ? color : DEFAULT_ACCENT_COLOR
}

/**
 * The sort direction of the ticket list under „Darstellung“: the stored value of
 * the row, else the default of the server — `'desc'` puts the newest report on
 * top. A row with a value that is not `'asc'` or `'desc'` answers the default.
 */
function storedTicketSortDirection(value: unknown): TicketSortDirection {
  const direction =
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    typeof (value as { ticketSortDirection?: unknown }).ticketSortDirection === 'string'
      ? (value as { ticketSortDirection: TicketSortDirection }).ticketSortDirection
      : ''

  return direction === 'asc' || direction === 'desc' ? direction : DEFAULT_TICKET_SORT_DIRECTION
}

/** Validates an optional logo data URL; `''`/`null`/`undefined` means "remove". */
function validateLogo(logo: unknown): string | { code: string; params: Record<string, unknown> } {
  if (logo === undefined || logo === null || logo === '') {
    return ''
  }
  if (typeof logo !== 'string' || !LOGO_DATA_URL.test(logo)) {
    return { code: 'invalid_request', params: { fields: ['logo'] } }
  }
  const claimed = (logo.split('/')[2] ?? '').split(';')[0] // image/jpeg | image/png
  const payload = logo.split(',')[1] ?? ''
  const buffer = Buffer.from(payload, 'base64')
  if (buffer.byteLength > MAX_LOGO_BYTES) {
    return { code: 'invalid_request', params: { fields: ['logo'] } }
  }
  // SEC-019: the bytes win over the claim, like the ticket photos do (WP-M2-04c).
  const detected = detectImageType(buffer)
  if (detected === null || detected.mime !== claimed) {
    return { code: 'invalid_request', params: { fields: ['logo'] } }
  }
  return logo
}

export const settingsBrandingRoutes = fp<{ database: Database['database'] }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/branding',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, BRANDING_KEY))
          .limit(1)

        return brandingResponseSchema.parse({
          companyName: storedCompanyName(rows[0]?.value),
          titleEnabled: storedTitleEnabled(rows[0]?.value),
          logo: storedLogo(rows[0]?.value),
          internalCommentColor: storedInternalCommentColor(rows[0]?.value),
          accentColor: storedAccentColor(rows[0]?.value),
          ticketSortDirection: storedTicketSortDirection(rows[0]?.value),
        })
      },
    )

    /**
     * The display values of the ticket view (ADR-0034): the colour of the
     * internal comment. Every colleague who may read a ticket may read a colour
     * of the presentation, so the route needs no `settings.read` — a colour is
     * no secret.
     */
    app.get(
      '/api/v1/settings/display',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async () => {
        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, BRANDING_KEY))
          .limit(1)

        return displaySettingsResponseSchema.parse({
          internalCommentColor: storedInternalCommentColor(rows[0]?.value),
          accentColor: storedAccentColor(rows[0]?.value),
          ticketSortDirection: storedTicketSortDirection(rows[0]?.value),
        })
      },
    )

    // Whether the installation captures a ticket title at all. The internal
    // creation form needs this before it renders its title field; `ticket.create`
    // is exactly the permission of everyone who may use that form (`reporter_internal`
    // holds it but not `settings.read`), and the flag is already public through
    // the QR resolve, so this route discloses nothing new.
    app.get(
      '/api/v1/settings/title-switch',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.create) },
      async () => {
        const rows = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, BRANDING_KEY))
          .limit(1)

        return titleSwitchResponseSchema.parse({ titleEnabled: storedTitleEnabled(rows[0]?.value) })
      },
    )

    app.put(
      '/api/v1/settings/branding',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateBrandingRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['companyName'] } })
        }

        const logo = validateLogo(parsed.data.logo)
        if (typeof logo === 'object') {
          return reply.code(400).send(logo)
        }

        // A body without the colour keeps the stored one — the page of the
        // Darstellung sends the colour, an older client does not.
        const current = await database
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, BRANDING_KEY))
          .limit(1)

        const internalCommentColor =
          parsed.data.internalCommentColor ?? storedInternalCommentColor(current[0]?.value)

        // A body without the accent colour keeps the stored one — the page of the
        // Darstellung sends the colour, an older client does not (ADR-0036).
        const accentColor = parsed.data.accentColor ?? storedAccentColor(current[0]?.value)

        // A body without the sort direction keeps the stored one — the page of the
        // Darstellung sends the direction, an older client does not.
        const ticketSortDirection =
          parsed.data.ticketSortDirection ?? storedTicketSortDirection(current[0]?.value)

        const row = {
          companyName: parsed.data.companyName,
          titleEnabled: parsed.data.titleEnabled,
          logo,
          internalCommentColor,
          accentColor,
          ticketSortDirection,
        }

        await database
          .insert(settings)
          .values({
            key: BRANDING_KEY,
            value: row,
          })
          .onConflictDoUpdate({
            target: settings.key,
            set: {
              value: row,
              updatedAt: new Date(),
            },
          })

        return brandingResponseSchema.parse(row)
      },
    )
  },
  { name: 'stoerdesk-settings-branding' },
)
