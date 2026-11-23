import { z } from 'zod'

import { notificationChannelKindSchema } from './notification.js'

/**
 * Public branding of the GUI (`PLAN.md` §14, WP-M2-29). One jsonb row under the
 * key `branding` of the existing `settings` table: `{ companyName }`.
 *
 * `companyName` is what an admin configures in the administration
 * (WP-M2-30). The empty string means "no company name configured — show the
 * product name alone" (WP-M2-31).
 *
 * `logo` (WP-M4-09) is an optional base64 data URL of the company logo. The
 * empty string means "no logo — show only the product name / company name".
 */

export const brandingResponseSchema = z.object({
  companyName: z.string().max(80),
  titleEnabled: z.boolean(),
  logo: z.string(),
  /**
   * The colour of the internal comment (ADR-0034): the background of the field
   * and of the entry in the history. A hex value of the form `#rrggbb`.
   */
  internalCommentColor: z.string(),
  /**
   * The accent colour of the interface (ADR-0036): the active menu entry, the
   * links of the settings menu, the focus ring and the unread badge. A value of
   * the instance, configured under „Darstellung“ and defaulting to the blue of
   * the shell (`DEFAULT_ACCENT_COLOR`).
   */
  accentColor: z.string(),
  /**
   * The sort direction of the history of a ticket under „Darstellung“: `'desc'`
   * puts the newest event of the history on top, `'asc'` the oldest one.
   * Defaults to `'desc'`.
   */
  historySortDirection: z.enum(['asc', 'desc']),
})

/** The default sort direction of the history of a ticket: the newest event on top. */
export const DEFAULT_HISTORY_SORT_DIRECTION: 'asc' | 'desc' = 'desc'

/** The sort direction of the history of a ticket under „Darstellung“. */
export type HistorySortDirection = 'asc' | 'desc'

/** The default colour of the internal comment: a dark red (ADR-0034). */
export const DEFAULT_INTERNAL_COMMENT_COLOR = '#7f1d1d'

/** A colour of the form `#rrggbb`. */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/** The default accent colour of the interface: the blue of the shell (ADR-0036). */
export const DEFAULT_ACCENT_COLOR = '#0ea5e9'

/**
 * The display values of the ticket view: every colleague who may read a ticket
 * may read a colour of the presentation, so the route needs no `settings.read`.
 * The accent colour of the interface (ADR-0036) travels here as well, because a
 * colour of the presentation is no secret and the shell needs both colours.
 */
export const displaySettingsResponseSchema = z.object({
  internalCommentColor: z.string(),
  accentColor: z.string(),
  /** The sort direction of the history of a ticket under „Darstellung“. */
  historySortDirection: z.enum(['asc', 'desc']),
})

/** Whether the installation captures a ticket title at all (`PLAN.md` §14, WP-M9-24). */
export const titleSwitchResponseSchema = z.object({
  titleEnabled: z.boolean(),
})

export type TitleSwitchResponse = z.infer<typeof titleSwitchResponseSchema>

export const updateBrandingRequestSchema = z.object({
  companyName: z.string().trim().max(80),
  titleEnabled: z.boolean().default(false),
  logo: z.string().optional(),
  /** The colour of the internal comment; a body without it keeps the stored one. */
  internalCommentColor: hexColorSchema.optional(),
  /** The accent colour of the interface (ADR-0036); a body without it keeps it. */
  accentColor: hexColorSchema.optional(),
  /** The sort direction of the history of a ticket; a body without it keeps the stored one. */
  historySortDirection: z.enum(['asc', 'desc']).optional(),
})

export type BrandingResponse = z.infer<typeof brandingResponseSchema>
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequestSchema>
export type DisplaySettingsResponse = z.infer<typeof displaySettingsResponseSchema>

/** The mandatory minimum channels of critical tickets (`WP-M14-18`). */
export const minimumChannelsResponseSchema = z.object({
  channels: z.array(notificationChannelKindSchema),
})

export type MinimumChannelsResponse = z.infer<typeof minimumChannelsResponseSchema>
