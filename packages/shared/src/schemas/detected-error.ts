import { z } from 'zod'

/**
 * Detected-error catalog (`specs/13-detected-errors.md` §13.3, WP-M11-03).
 *
 * A detected error is a fault found during ticket handling, independent of the
 * reported fault type (`faultTemplateKeys`). The catalog is maintained by the
 * administration (`settings.read`/`settings.write`). Keys are machine keys,
 * never translated text; `label_de`/`label_en` are the user-facing labels.
 */

const trimmedText = (max: number) =>
  z.string().trim().min(1).max(max)

export const detectedErrorSchema = z.object({
  key: trimmedText(100),
  labelDe: trimmedText(200),
  labelEn: trimmedText(200),
  archivedAt: z.iso.datetime().nullable().optional(),
})

export type DetectedError = z.infer<typeof detectedErrorSchema>

export const detectedErrorCreateRequestSchema = z.object({
  key: trimmedText(100),
  labelDe: trimmedText(200),
  labelEn: trimmedText(200),
})

export type DetectedErrorCreateRequest = z.infer<
  typeof detectedErrorCreateRequestSchema
>

export const detectedErrorUpdateRequestSchema = z.object({
  key: trimmedText(100).optional(),
  labelDe: trimmedText(200).optional(),
  labelEn: trimmedText(200).optional(),
  archivedAt: z.iso.datetime().nullable().optional(),
})

export type DetectedErrorUpdateRequest = z.infer<
  typeof detectedErrorUpdateRequestSchema
>

export const detectedErrorResponseSchema = z.object({
  key: z.string(),
  labelDe: z.string(),
  labelEn: z.string(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type DetectedErrorResponse = z.infer<
  typeof detectedErrorResponseSchema
>

export const detectedErrorListResponseSchema = z.object({
  detectedErrors: z.array(detectedErrorResponseSchema),
})

export type DetectedErrorListResponse = z.infer<
  typeof detectedErrorListResponseSchema
>

export const detectedErrorInUseCode = 'detected_error_in_use'
export const detectedErrorKeyTakenCode = 'detected_error_key_taken'
export const detectedErrorNotFoundCode = 'detected_error_not_found'
