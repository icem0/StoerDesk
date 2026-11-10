import { z } from 'zod'

/**
 * CSV import of the object list (`specs/08-objects-api.md` §9.4, WP-M10-12).
 *
 * The browser reads the spreadsheet file and posts its text as JSON, so the
 * request, the preview answer and the commit answer share one contract. Only
 * the ten importable object fields exist here; `qrToken`, `externalId`,
 * `externalType` and `active` are never import fields.
 */

export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const CSV_IMPORT_MAX_ROWS = 5000

/** The importable object fields; the mapping may never target anything else. */
export const OBJECT_IMPORT_TARGETS = [
  'objectNo',
  'name',
  'street',
  'houseNumber',
  'postalCode',
  'city',
  'contactName',
  'contactPhone',
  'contactEmail',
  'notes',
] as const

/** German header aliases of §9.4, matched case-insensitively. */
export const objectImportTargetSchema = z.enum(OBJECT_IMPORT_TARGETS)

export type ObjectImportTarget = z.infer<typeof objectImportTargetSchema>

export const OBJECT_IMPORT_HEADER_TARGETS: Record<string, ObjectImportTarget> = {
  objectno: 'objectNo',
  objektnummer: 'objectNo',
  name: 'name',
  bezeichnung: 'name',
  street: 'street',
  strasse: 'street',
  housenumber: 'houseNumber',
  hausnummer: 'houseNumber',
  postalcode: 'postalCode',
  plz: 'postalCode',
  city: 'city',
  ort: 'city',
  contactname: 'contactName',
  ansprechpartner: 'contactName',
  contactphone: 'contactPhone',
  telefon: 'contactPhone',
  contactemail: 'contactEmail',
  email: 'contactEmail',
  notes: 'notes',
  notiz: 'notes',
}

/** Column-to-field mapping submitted by the client; unknown targets are rejected. */
export const objectImportMappingSchema = z.record(
  z.string().trim().min(1).max(120),
  objectImportTargetSchema,
)

export const objectImportRequestSchema = z.object({
  /** UTF-8 file text; the exact byte and row limits are enforced while parsing. */
  csv: z.string().min(1).max(CSV_IMPORT_MAX_BYTES),
  mapping: objectImportMappingSchema.optional(),
  commit: z.boolean().optional(),
})

export const objectImportActionSchema = z.enum(['new', 'changed', 'unchanged', 'error'])

export const objectImportRowErrorSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
})

/** One preview row; `line` is the 1-based file line of the first row line. */
export const objectImportRowSchema = z.object({
  line: z.number().int().positive(),
  objectNo: z.string(),
  action: objectImportActionSchema,
  errors: z.array(objectImportRowErrorSchema),
  changed: z.array(objectImportTargetSchema),
})

export const objectImportSummarySchema = z.object({
  new: z.number().int().default(0),
  changed: z.number().int().default(0),
  unchanged: z.number().int().default(0),
  error: z.number().int().default(0),
})

export const objectImportPreviewSchema = z.object({
  rows: z.array(objectImportRowSchema),
  summary: objectImportSummarySchema,
})

/** The commit answer repeats the preview shape and adds what was written. */
export const objectImportAppliedSchema = z.object({
  created: z.number().int().default(0),
  updated: z.number().int().default(0),
  unchanged: z.number().int().default(0),
  failed: z.number().int().default(0),
})

export const objectImportResultSchema = z.object({
  rows: z.array(objectImportRowSchema),
  summary: objectImportSummarySchema,
  applied: objectImportAppliedSchema,
})

export type ObjectImportRequest = z.infer<typeof objectImportRequestSchema>
export type ObjectImportMapping = z.infer<typeof objectImportMappingSchema>
export type ObjectImportAction = z.infer<typeof objectImportActionSchema>
export type ObjectImportRowError = z.infer<typeof objectImportRowErrorSchema>
export type ObjectImportRow = z.infer<typeof objectImportRowSchema>
export type ObjectImportSummary = z.infer<typeof objectImportSummarySchema>
export type ObjectImportPreview = z.infer<typeof objectImportPreviewSchema>
export type ObjectImportApplied = z.infer<typeof objectImportAppliedSchema>
export type ObjectImportResult = z.infer<typeof objectImportResultSchema>
