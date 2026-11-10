import { randomUUID } from 'node:crypto'

import { and, arrayContains, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createTextTemplateRequestSchema,
  PERMISSIONS,
  publicTextTemplateListResponseSchema,
  publicTextTemplateQuerySchema,
  textTemplateListResponseSchema,
  textTemplateSummarySchema,
  updateTextTemplateRequestSchema,
  type TextTemplateSummary,
  type TextTemplateTranslations,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  textTemplates,
  textTemplateTranslations,
  tickets,
  type TextTemplate,
} from '../db/schema'

/**
 * Fault template administration and public catalog
 * (`specs/02-data-model.md` §4.5, `specs/06-report-form.md` §7.9, WP-M2-40b).
 *
 * `GET/POST/PATCH/DELETE /api/v1/text-templates` maintain the catalog under
 * `settings.read`/`settings.write`. `GET /api/v1/public/text-templates` is the
 * unauthenticated catalog of the report form and carries only active templates.
 * A template that a ticket carries is archive-only; deletion answers
 * `409 text_template_in_use`.
 */

type Db = Database['database']
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Transaction

class TextTemplateRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TextTemplateRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new TextTemplateRouteError(400, 'invalid_request', { fields })
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  )
}

function translationsOf(rows: { templateId: string; locale: string; text: string }[]) {
  const byTemplate = new Map<string, TextTemplateTranslations>()

  for (const row of rows) {
    const current = byTemplate.get(row.templateId) ?? { de: '', en: '' }

    if (row.locale === 'de' || row.locale === 'en') {
      current[row.locale] = row.text
    }

    byTemplate.set(row.templateId, current)
  }

  return byTemplate
}

async function usageCount(database: Db, key: string): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(tickets)
    .where(arrayContains(tickets.faultTemplateKeys, [key]))

  return Number(row?.total ?? 0)
}

/**
 * Selection UIs (public report form + internal office form, WP-M10-20) order the
 * fault catalog by how often a fault was reported in the last 30 days - most frequent
 * first, ties by key - so the top-left checkbox in reading order is the fault the
 * installation saw most often. The window matches the dashboard evaluation window
 * (ADR-0015); test and suspected-spam tickets stay out. The management screen keeps
 * an alphabetical list and re-sorts itself (text-templates-page.tsx, WP-M10-20b).
 */
const FAULT_CATALOG_WINDOW_DAYS = 30

function recentCatalogWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - FAULT_CATALOG_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

async function recentFaultCounts(database: Db, windowStart: Date): Promise<Map<string, number>> {
  const rows = (await database.execute(sql`
    SELECT COALESCE("fault_template_key", '') AS key, COUNT(*)::text AS count
    FROM "stats_ticket_faults"
    WHERE "reported_at" >= ${sql.raw(`'${windowStart.toISOString()}'`)}::timestamptz
      AND "is_test" = false
      AND "suspected_spam" = false
    GROUP BY "fault_template_key"
  `)) as { key: string; count: string }[]

  const counts = new Map<string, number>()

  for (const row of rows) {
    counts.set(row.key, Number(row.count))
  }

  return counts
}

/** Most frequent first, ties by key ascending - reading order for the checkbox grid. */
function byRecentUsage(counts: Map<string, number>) {
  return (a: { key: string }, b: { key: string }) => {
    const difference = (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0)

    return difference !== 0 ? difference : a.key.localeCompare(b.key)
  }
}

async function summaryOf(database: Db, row: TextTemplate): Promise<TextTemplateSummary> {
  const translationRows = await database
    .select({
      templateId: textTemplateTranslations.templateId,
      locale: textTemplateTranslations.locale,
      text: textTemplateTranslations.text,
    })
    .from(textTemplateTranslations)
    .where(eq(textTemplateTranslations.templateId, row.id))

  const translations = translationsOf(translationRows).get(row.id) ?? { de: '', en: '' }

  return textTemplateSummarySchema.parse({
    id: row.id,
    key: row.key,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    translations,
    usageCount: await usageCount(database, row.key),
  })
}

async function templateById(database: Db, id: string): Promise<TextTemplate> {
  const [row] = await database
    .select()
    .from(textTemplates)
    .where(eq(textTemplates.id, id))
    .limit(1)

  if (row === undefined) {
    throw new TextTemplateRouteError(404, 'text_template_not_found', { fields: ['id'] })
  }

  return row
}

async function writeTranslations(
  database: Executor,
  templateId: string,
  translations: TextTemplateTranslations,
): Promise<void> {
  for (const locale of ['de', 'en'] as const) {
    await database
      .insert(textTemplateTranslations)
      .values({ templateId, locale, text: translations[locale] })
      .onConflictDoUpdate({
        target: [textTemplateTranslations.templateId, textTemplateTranslations.locale],
        set: { text: translations[locale], updatedAt: new Date() },
      })
  }
}

export const settingsTextTemplateRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/text-templates',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        const rows = await database
          .select()
          .from(textTemplates)
          .orderBy(asc(textTemplates.key))
        const ids = rows.map((row) => row.id)
        const translationRows =
          ids.length === 0
            ? []
            : await database
                .select({
                  templateId: textTemplateTranslations.templateId,
                  locale: textTemplateTranslations.locale,
                  text: textTemplateTranslations.text,
                })
                .from(textTemplateTranslations)
                .where(inArray(textTemplateTranslations.templateId, ids))
        const translations = translationsOf(translationRows)

        const summaries = await Promise.all(
          rows.map(async (row) =>
            textTemplateSummarySchema.parse({
              id: row.id,
              key: row.key,
              archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
              translations: translations.get(row.id) ?? { de: '', en: '' },
              usageCount: await usageCount(database, row.key),
            }),
          ),
        )

        const adminCounts = await recentFaultCounts(database, recentCatalogWindowStart())

        return textTemplateListResponseSchema.parse({
          templates: summaries.sort(byRecentUsage(adminCounts)),
        })
      },
    )

    app.post(
      '/api/v1/text-templates',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = createTextTemplateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw invalidRequest(fieldPaths(parsed.error))
        }

        const { key: providedKey, translations } = parsed.data

        const created = await database.transaction(async (tx) => {
          const key = providedKey ?? `custom.${randomUUID().replaceAll('-', '')}`

          const existing = await tx
            .select({ id: textTemplates.id })
            .from(textTemplates)
            .where(eq(textTemplates.key, key))
            .limit(1)

          if (existing.length > 0) {
            throw new TextTemplateRouteError(409, 'text_template_key_taken', { fields: ['key'] })
          }

          const [row] = await tx
            .insert(textTemplates)
            .values({ key })
            .returning()

          if (row === undefined) {
            throw new TextTemplateRouteError(500, 'text_template_create_failed')
          }

          await writeTranslations(tx, row.id, translations)

          return row
        })
        // A parallel create of the same key: the unique index decides, not the probe.
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new TextTemplateRouteError(409, 'text_template_key_taken', { fields: ['key'] })
          }
          throw error
        })

        return reply.code(201).send(await summaryOf(database, created))
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/text-templates/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          throw invalidRequest(['id'])
        }

        const parsed = updateTextTemplateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw invalidRequest(fieldPaths(parsed.error))
        }

        const current = await templateById(database, parsedId.data)
        const archivedAt =
          parsed.data.archived === undefined
            ? current.archivedAt
            : parsed.data.archived
              ? (current.archivedAt ?? new Date())
              : null

        await database.transaction(async (tx) => {
          await tx
            .update(textTemplates)
            .set({ archivedAt, updatedAt: new Date() })
            .where(eq(textTemplates.id, current.id))

          if (parsed.data.translations !== undefined) {
            await writeTranslations(tx, current.id, parsed.data.translations)
          }
        })

        const updated = await templateById(database, current.id)

        return summaryOf(database, updated)
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/text-templates/:id',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          throw invalidRequest(['id'])
        }

        const current = await templateById(database, parsedId.data)
        const used = await usageCount(database, current.key)

        if (used > 0) {
          throw new TextTemplateRouteError(409, 'text_template_in_use', {
            fields: ['id'],
            key: current.key,
            usageCount: used,
          })
        }

        await database.delete(textTemplates).where(eq(textTemplates.id, current.id))

        return reply.code(204).send()
      },
    )

    app.get('/api/v1/public/text-templates', async (request) => {
      const parsed = publicTextTemplateQuerySchema.safeParse(request.query)

      if (!parsed.success) {
        throw invalidRequest(fieldPaths(parsed.error))
      }

      const rows = await database
        .select({ key: textTemplates.key, text: textTemplateTranslations.text })
        .from(textTemplates)
        .innerJoin(
          textTemplateTranslations,
          and(
            eq(textTemplateTranslations.templateId, textTemplates.id),
            eq(textTemplateTranslations.locale, parsed.data.locale),
          ),
        )
        .where(isNull(textTemplates.archivedAt))

      const counts = await recentFaultCounts(database, recentCatalogWindowStart())

      return publicTextTemplateListResponseSchema.parse({
        templates: rows.sort(byRecentUsage(counts)),
      })
    })
  },
  { name: 'stoerdesk-settings-text-templates' },
)
