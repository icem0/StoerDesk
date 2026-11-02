import { z } from 'zod'

/**
 * Public branding of the GUI (`PLAN.md` §14, WP-M2-29). One jsonb row under the
 * key `branding` of the existing `settings` table: `{ companyName }`.
 *
 * `companyName` is what an admin configures in the administration
 * (WP-M2-30). The empty string means "no company name configured — show the
 * product name alone" (WP-M2-31).
 */

export const brandingResponseSchema = z.object({
  companyName: z.string().max(80),
})

export const updateBrandingRequestSchema = z.object({
  companyName: z.string().trim().max(80),
})

export type BrandingResponse = z.infer<typeof brandingResponseSchema>
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequestSchema>
