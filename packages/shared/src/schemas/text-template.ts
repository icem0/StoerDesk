import { z } from 'zod'

/**
 * Fault template catalog (`specs/02-data-model.md` §4.5,
 * `specs/06-report-form.md` §7.9, WP-M2-40).
 *
 * A template has a stable machine `key` that tickets store in
 * `fault_template_keys`; the localized text lives in
 * `text_template_translations`. The administration maintains one complete
 * `de`/`en` pair per template, the report form only sees active templates.
 */

export const textTemplateKeySchema = z.string().regex(/^[a-z0-9_.]{1,64}$/)

export const textTemplateTranslationsSchema = z.object({
  de: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
})

export const textTemplateSummarySchema = z.object({
  id: z.uuid(),
  key: textTemplateKeySchema,
  archivedAt: z.iso.datetime().nullable(),
  translations: textTemplateTranslationsSchema,
  usageCount: z.number().int().nonnegative(),
})

export const textTemplateListResponseSchema = z.object({
  templates: z.array(textTemplateSummarySchema),
})

export const createTextTemplateRequestSchema = z.object({
  key: textTemplateKeySchema.optional(),
  translations: textTemplateTranslationsSchema,
})

export const updateTextTemplateRequestSchema = z
  .object({
    translations: textTemplateTranslationsSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (value) => value.translations !== undefined || value.archived !== undefined,
    { message: 'translations or archived is required' },
  )

export const publicTextTemplateSummarySchema = z.object({
  key: textTemplateKeySchema,
  text: z.string(),
})

export const publicTextTemplateListResponseSchema = z.object({
  templates: z.array(publicTextTemplateSummarySchema),
})

export const publicTextTemplateQuerySchema = z.object({
  locale: z.enum(['de', 'en']).default('de'),
})

export type TextTemplateTranslations = z.infer<typeof textTemplateTranslationsSchema>
export type TextTemplateSummary = z.infer<typeof textTemplateSummarySchema>
export type TextTemplateListResponse = z.infer<typeof textTemplateListResponseSchema>
export type CreateTextTemplateRequest = z.infer<typeof createTextTemplateRequestSchema>
export type UpdateTextTemplateRequest = z.infer<typeof updateTextTemplateRequestSchema>
export type PublicTextTemplateSummary = z.infer<typeof publicTextTemplateSummarySchema>
export type PublicTextTemplateListResponse = z.infer<typeof publicTextTemplateListResponseSchema>
export type PublicTextTemplateQuery = z.infer<typeof publicTextTemplateQuerySchema>
