import { z } from 'zod'

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
})

export type BrandingResponse = z.infer<typeof brandingResponseSchema>
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequestSchema>
