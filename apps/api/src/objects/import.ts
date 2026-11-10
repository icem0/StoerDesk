import { inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  OBJECT_IMPORT_HEADER_TARGETS,
  OBJECT_IMPORT_TARGETS,
  createObjectRequestSchema,
  objectImportPreviewSchema,
  objectImportResultSchema,
  objectImportRowSchema,
  objectImportSummarySchema,
  objectImportTargetSchema,
  type CreateObjectRequest,
  type ObjectImportApplied,
  type ObjectImportMapping,
  type ObjectImportPreview,
  type ObjectImportRequest,
  type ObjectImportResult,
  type ObjectImportRow,
  type ObjectImportRowError,
  type ObjectImportSummary,
  type ObjectImportTarget,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { objects } from '../db/schema'
import { generateQrToken } from './qr'

/**
 * CSV import of the object list (`specs/08-objects-api.md` §9.4, WP-M10-12).
 *
 * Parsing, header mapping, preview and commit live here; the routes come with
 * WP-M10-13. The file arrives as JSON text, so the parser is written from
 * scratch and no upload handling is needed. `qrToken`, `externalId`,
 * `externalType` and `active` are never import fields.
 */

type Db = Database['database']
type ObjectRow = typeof objects.$inferSelect

/** The object fields one row carries; `objectNo` selects the row, never changes it. */
type FieldMap = Record<string, string | null>

class ObjectImportError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ObjectImportError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidCsv() {
  return new ObjectImportError(400, 'invalid_request', { fields: ['csv'] })
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function rowError(fields: string[]): ObjectImportRowError {
  return { code: 'invalid_request', params: { fields } }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

const IMPORTABLE_FIELDS = OBJECT_IMPORT_TARGETS.filter((target) => target !== 'objectNo')

export type ObjectCsvDocument = {
  delimiter: string
  targets: ObjectImportTarget[]
  rows: Array<{ line: number; values: Record<string, string> }>
}

function detectDelimiter(headerLine: string): string {
  let commas = 0
  let semicolons = 0

  for (const char of headerLine) {
    if (char === ',') commas += 1
    if (char === ';') semicolons += 1
  }

  return semicolons > commas ? ';' : ','
}

/** Reads the records of a CSV document: quoted cells, doubled quotes, LF or CRLF. */
function readRecords(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = []
  let cells: string[] = []
  let cell = ''
  let line = 1
  let recordLine = 1
  let quoted = false
  let index = 0

  const endRecord = () => {
    records.push({ line: recordLine, cells: [...cells, cell] })
    cells = []
    cell = ''
  }

  while (index < text.length) {
    const char = text[index]

    if (char === '"' && (cell === '' || quoted)) {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 2
        continue
      }

      quoted = !quoted
      index += 1
      continue
    }

    if (quoted) {
      cell += char
      index += 1

      if (char === '\n') line += 1

      continue
    }

    if (char === delimiter) {
      cells.push(cell)
      cell = ''
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      endRecord()
      index += 1
      line += 1

      if (char === '\r' && text[index] === '\n') index += 1

      recordLine = line
      continue
    }

    cell += char
    index += 1
  }

  if (cell !== '' || cells.length > 0) endRecord()

  return records
}

/**
 * Maps the header case-insensitively onto the import targets, through the
 * submitted mapping or the German aliases of §9.4. An empty file, a duplicated
 * header, more bytes or rows than the limits allow or a mapping to an unknown
 * target answer `invalid_request` with the field `csv`.
 */
export function parseObjectCsv(csv: string, mapping?: ObjectImportMapping): ObjectCsvDocument {
  const text = csv.replace(/^\uFEFF/, '')

  if (text.trim() === '') {
    throw invalidCsv()
  }

  if (new TextEncoder().encode(text).length > CSV_IMPORT_MAX_BYTES) {
    throw invalidCsv()
  }

  const newline = text.search(/[\r\n]/)
  const headerLine = newline === -1 ? text : text.slice(0, newline)
  const delimiter = detectDelimiter(headerLine)
  const records = readRecords(text, delimiter)
  const last = records[records.length - 1]

  if (
    records.length > 1 &&
    last !== undefined &&
    last.cells.length === 1 &&
    last.cells[0] === '' &&
    (text.endsWith('\n') || text.endsWith('\r'))
  ) {
    records.pop()
  }

  const [header, ...data] = records

  if (header === undefined || header.cells.length === 0) {
    throw invalidCsv()
  }

  if (data.length > CSV_IMPORT_MAX_ROWS) {
    throw invalidCsv()
  }

  const labels = header.cells.map((label) => label.trim().toLowerCase())

  if (new Set(labels).size !== labels.length) {
    throw invalidCsv()
  }

  const submitted: Record<string, ObjectImportTarget> = {}

  for (const [label, target] of Object.entries(mapping ?? {})) {
    const validated = objectImportTargetSchema.safeParse(target)

    if (!validated.success) {
      throw invalidCsv()
    }

    submitted[label.trim().toLowerCase()] = validated.data
  }

  const targets: ObjectImportTarget[] = []
  const columns: Array<{ column: number; target: ObjectImportTarget | null }> = []

  for (const [column, label] of labels.entries()) {
    const candidate = submitted[label] ?? OBJECT_IMPORT_HEADER_TARGETS[label]
    const target = candidate !== undefined && !targets.includes(candidate) ? candidate : null

    if (target !== null) targets.push(target)

    columns.push({ column, target })
  }

  const rows = data.map(({ line, cells }) => {
    const values: Record<string, string> = {}

    for (const { column, target } of columns) {
      if (target !== null) values[target] = cells[column] ?? ''
    }

    return { line, values }
  })

  return { delimiter, targets, rows }
}

/** One file row with its validated values, its preview action and its errors. */
type RowPlan = {
  line: number
  objectNo: string
  values: CreateObjectRequest | null
  action: 'new' | 'changed' | 'unchanged' | 'error'
  changed: ObjectImportTarget[]
  errors: ObjectImportRowError[]
}

function toFieldMap(values: CreateObjectRequest): FieldMap {
  return {
    name: values.name,
    street: values.street ?? null,
    houseNumber: values.houseNumber ?? null,
    postalCode: values.postalCode ?? null,
    city: values.city ?? null,
    contactName: values.contactName ?? null,
    contactPhone: values.contactPhone ?? null,
    contactEmail: values.contactEmail ?? null,
    notes: values.notes ?? null,
  }
}

function storedFieldMap(row: ObjectRow): FieldMap {
  return {
    name: row.name,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    notes: row.notes,
  }
}

function changedFields(incoming: FieldMap, current: FieldMap, targets: ObjectImportTarget[]) {
  return IMPORTABLE_FIELDS.filter(
    (target) =>
      targets.includes(target) && (incoming[target] ?? null) !== (current[target] ?? null),
  )
}

/** Reads only the objects the file mentions; the rows are matched on `lower(object_no)`. */
async function storedRows(database: Db, objectNos: string[]): Promise<Map<string, FieldMap>> {
  const keys = [...new Set(objectNos.map((objectNo) => objectNo.toLowerCase()).filter(Boolean))]
  const stored = new Map<string, FieldMap>()

  if (keys.length === 0) {
    return stored
  }

  for (const row of await database
    .select()
    .from(objects)
    .where(inArray(sql`lower(${objects.objectNo})`, keys))) {
    stored.set(row.objectNo.toLowerCase(), storedFieldMap(row))
  }

  return stored
}

/** Validates every row and classifies it against the stored objects. */
async function planRows(database: Db, document: ObjectCsvDocument): Promise<RowPlan[]> {
  const plans = document.rows.map(({ line, values }): RowPlan => {
    const candidate = Object.fromEntries(
      document.targets.map((target): [ObjectImportTarget, string] => [
        target,
        values[target] ?? '',
      ]),
    )

    const parsed = createObjectRequestSchema.safeParse(candidate)

    if (!parsed.success) {
      return {
        line,
        objectNo: (values.objectNo ?? '').trim(),
        values: null,
        action: 'error',
        changed: [],
        errors: [rowError(fieldPaths(parsed.error))],
      }
    }

    return {
      line,
      objectNo: parsed.data.objectNo,
      values: parsed.data,
      action: 'new',
      changed: [],
      errors: [],
    }
  })

  const stored = await storedRows(
    database,
    plans.map((plan) => plan.objectNo),
  )

  for (const plan of plans) {
    if (plan.values === null || plan.objectNo === '') continue

    const current = stored.get(plan.objectNo.toLowerCase())

    if (current === undefined) {
      plan.action = 'new'
      continue
    }

    const changed = changedFields(toFieldMap(plan.values), current, document.targets)

    plan.action = changed.length === 0 ? 'unchanged' : 'changed'
    plan.changed = changed
  }

  return plans
}

function toPreviewRow(plan: RowPlan): ObjectImportRow {
  return objectImportRowSchema.parse({
    line: plan.line,
    objectNo: plan.objectNo,
    action: plan.action,
    errors: plan.errors,
    changed: plan.changed,
  })
}

function summarize(plans: RowPlan[]): ObjectImportSummary {
  const count = (action: 'new' | 'changed' | 'unchanged' | 'error') =>
    plans.filter((plan) => plan.action === action).length

  return objectImportSummarySchema.parse({
    new: count('new'),
    changed: count('changed'),
    unchanged: count('unchanged'),
    error: count('error'),
  })
}

/** The preview answers rows and action counts and writes nothing. */
export async function previewObjectImport(
  database: Db,
  request: ObjectImportRequest,
): Promise<ObjectImportPreview> {
  const plans = await planRows(database, parseObjectCsv(request.csv, request.mapping))

  return objectImportPreviewSchema.parse({
    rows: plans.map(toPreviewRow),
    summary: summarize(plans),
  })
}

/**
 * Repeats the preview and upserts every valid row by `object_no` inside one
 * transaction. New rows get a generated QR token, changed rows replace only the
 * mapped fields, unchanged rows stay untouched and a second identical import
 * reports `unchanged` and writes nothing. A row error never blocks the other
 * rows (quarantine, `PLAN.md` §6.1).
 */
export async function applyObjectImport(
  database: Db,
  request: ObjectImportRequest,
): Promise<ObjectImportResult> {
  const document = parseObjectCsv(request.csv, request.mapping)
  const plans = await planRows(database, document)
  const targets = document.targets
  const applied: ObjectImportApplied = { created: 0, updated: 0, unchanged: 0, failed: 0 }

  try {
    await database.transaction(async (tx) => {
      for (const plan of plans) {
        if (plan.values === null) {
          applied.failed += 1
          continue
        }

        const values = plan.values

        try {
          const [existing] = await tx
            .select()
            .from(objects)
            .where(sql`lower(${objects.objectNo}) = lower(${plan.objectNo})`)
            .limit(1)

          if (existing === undefined) {
            const [created] = await tx
              .insert(objects)
              .values({
                objectNo: plan.objectNo,
                name: values.name,
                street: values.street ?? null,
                houseNumber: values.houseNumber ?? null,
                postalCode: values.postalCode ?? null,
                city: values.city ?? null,
                contactName: values.contactName ?? null,
                contactPhone: values.contactPhone ?? null,
                contactEmail: values.contactEmail ?? null,
                notes: values.notes ?? null,
                qrToken: generateQrToken(),
              })
              .returning()

            if (created === undefined) {
              throw new ObjectImportError(500, 'object_create_failed')
            }

            applied.created += 1
            continue
          }

          if (plan.action === 'unchanged') {
            applied.unchanged += 1
            continue
          }

          const current = storedFieldMap(existing)
          const keep = (target: ObjectImportTarget, incoming: string | null) =>
            targets.includes(target) ? incoming : (current[target] ?? null)

          const [updated] = await tx
            .update(objects)
            .set({
              name: values.name,
              street: keep('street', values.street ?? null),
              houseNumber: keep('houseNumber', values.houseNumber ?? null),
              postalCode: keep('postalCode', values.postalCode ?? null),
              city: keep('city', values.city ?? null),
              contactName: keep('contactName', values.contactName ?? null),
              contactPhone: keep('contactPhone', values.contactPhone ?? null),
              contactEmail: keep('contactEmail', values.contactEmail ?? null),
              notes: keep('notes', values.notes ?? null),
              updatedAt: new Date(),
            })
            .where(sql`${objects.id} = ${existing.id}`)
            .returning()

          if (updated === undefined) {
            throw new ObjectImportError(500, 'object_update_failed')
          }

          applied.updated += 1
        } catch (error) {
          if (isUniqueViolation(error)) {
            plan.errors.push(rowError(['objectNo']))
          } else if (error instanceof ObjectImportError) {
            plan.errors.push({ code: error.code, params: error.params })
          } else {
            throw error
          }

          plan.action = 'error'
          applied.failed += 1
        }
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ObjectImportError(422, 'object_no_taken', { fields: ['csv'] })
    }

    throw error
  }

  return objectImportResultSchema.parse({
    rows: plans.map(toPreviewRow),
    summary: summarize(plans),
    applied,
  })
}
