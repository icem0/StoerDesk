import { z } from 'zod'

/**
 * Object list API schemas (WP-M2-01).
 *
 * `object_no` is the human- and system-readable key of the list
 * (`specs/02-data-model.md` §4.3.1): trimmed, upper-cased and restricted to
 * digits, upper-case letters, `_` and `-`. Internal links still use the UUID.
 */

export const OBJECT_SYSTEM_TYPES = [
  'BMA',
  'LICHTRUF',
  'RWA',
  'EMA',
  'SPRACHALARM',
  'SONSTIGE',
] as const

export const objectSystemTypeSchema = z.enum(OBJECT_SYSTEM_TYPES)

export const objectNoSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/)
  )

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value))

const optionalEmail = optionalText(320).pipe(z.email().nullable().optional())

export const objectSystemInputSchema = z.object({
  id: z.uuid().optional(),
  type: objectSystemTypeSchema,
  label: z.string().trim().min(1).max(120),
})

export const objectSystemSummarySchema = z.object({
  id: z.uuid(),
  type: objectSystemTypeSchema,
  label: z.string(),
})

export const objectSummarySchema = z.object({
  id: z.uuid(),
  objectNo: objectNoSchema,
  name: z.string(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  externalId: z.string().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  systems: z.array(objectSystemSummarySchema),
})

export const objectListResponseSchema = z.object({
  objects: z.array(objectSummarySchema),
})

export const objectListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  city: z.string().trim().max(120).optional(),
  systemType: objectSystemTypeSchema.optional(),
})

const objectFields = {
  name: z.string().trim().min(1).max(200),
  street: optionalText(200),
  houseNumber: optionalText(40),
  postalCode: optionalText(20),
  city: optionalText(120),
  contactName: optionalText(160),
  contactPhone: optionalText(60),
  contactEmail: optionalEmail,
  externalId: optionalText(120),
  notes: optionalText(2000),
}

export const createObjectRequestSchema = z.object({
  objectNo: objectNoSchema,
  ...objectFields,
  systems: z.array(objectSystemInputSchema).max(50).default([]),
})

export const updateObjectRequestSchema = z.object({
  objectNo: objectNoSchema.optional(),
  name: objectFields.name.optional(),
  street: objectFields.street,
  houseNumber: objectFields.houseNumber,
  postalCode: objectFields.postalCode,
  city: objectFields.city,
  contactName: objectFields.contactName,
  contactPhone: objectFields.contactPhone,
  contactEmail: objectFields.contactEmail,
  externalId: objectFields.externalId,
  notes: objectFields.notes,
  systems: z.array(objectSystemInputSchema).max(50).optional(),
})

export type ObjectSystemType = z.infer<typeof objectSystemTypeSchema>
export type ObjectSystemInput = z.infer<typeof objectSystemInputSchema>
export type ObjectSystemSummary = z.infer<typeof objectSystemSummarySchema>
export type ObjectSummary = z.infer<typeof objectSummarySchema>
export type ObjectListResponse = z.infer<typeof objectListResponseSchema>
export type ObjectListQuery = z.infer<typeof objectListQuerySchema>
export type CreateObjectRequest = z.infer<typeof createObjectRequestSchema>
export type UpdateObjectRequest = z.infer<typeof updateObjectRequestSchema>
