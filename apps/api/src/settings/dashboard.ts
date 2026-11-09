import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
  dashboardSettingsSchema,
  PERMISSIONS,
  updateDashboardSettingsRequestSchema,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

/** Setting keys stored as separate jsonb rows in the `settings` table. */
const TV_TOKEN_KEY = 'dashboard.tv_token'
const TV_ANONYMIZE_KEY = 'dashboard.tv_anonymize'
const CONSPICUOUS_THRESHOLD_KEY = 'stats.conspicuous_threshold'

/** 32 bytes of randomness, base64url encoded (43 characters). */
const TV_TOKEN_BYTES = 32

/** Defaults when no row is configured (`specs/12-stats.md` §12.6). */
const DEFAULT_TV_ANONYMIZE = false
const DEFAULT_CONSPICUOUS_THRESHOLD = 3

type Db = Database['database']

function generateTvToken(): string {
  return randomBytes(TV_TOKEN_BYTES).toString('base64url')
}

async function readSetting(database: Db, key: string): Promise<unknown> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)

  return rows[0]?.value
}

/**
 * Reads the three dashboard settings keys from `settings`, falling back to the
 * defaults of `specs/12-stats.md` §12.6. When `dashboard.tv_token` is missing a
 * random 32-byte `base64url` token is generated and persisted once.
 */
export async function readDashboardSettings(database: Db): Promise<{
  tvToken: string
  tvAnonymize: boolean
  conspicuousThreshold: number
}> {
  const [tvTokenRow, tvAnonymizeRow, thresholdRow] = await Promise.all([
    readSetting(database, TV_TOKEN_KEY),
    readSetting(database, TV_ANONYMIZE_KEY),
    readSetting(database, CONSPICUOUS_THRESHOLD_KEY),
  ])

  let tvToken = typeof tvTokenRow === 'string' ? tvTokenRow : null

  if (tvToken === null) {
    tvToken = generateTvToken()

    await database.insert(settings).values({ key: TV_TOKEN_KEY, value: tvToken })
  }

  const tvAnonymize =
    typeof tvAnonymizeRow === 'boolean' ? tvAnonymizeRow : DEFAULT_TV_ANONYMIZE
  const conspicuousThreshold =
    typeof thresholdRow === 'number' && Number.isFinite(thresholdRow)
      ? thresholdRow
      : DEFAULT_CONSPICUOUS_THRESHOLD

  return dashboardSettingsSchema.parse({
    tvToken,
    tvAnonymize,
    conspicuousThreshold,
  })
}

/**
 * Compares `token` against the stored `dashboard.tv_token` with a timing-safe
 * comparison. Returns `false` for a missing row, a length mismatch or any
 * differing byte. Never logs the token.
 */
export async function verifyTvToken(database: Db, token: string): Promise<boolean> {
  const row = await readSetting(database, TV_TOKEN_KEY)
  const stored = typeof row === 'string' ? row : null

  if (stored === null || stored.length !== token.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(stored), Buffer.from(token))
}

/**
 * `GET/PUT /api/v1/settings/dashboard` (`specs/11-dashboard.md` §11.8,
 * `specs/12-stats.md` §12.6).
 *
 * `GET` — `settings.read`, answers `{ tvToken, tvAnonymize, conspicuousThreshold }`.
 * `PUT` — `settings.write`, upserts `dashboard.tv_anonymize` and
 * `stats.conspicuous_threshold`; `{ rotateTvToken: true }` replaces
 * `dashboard.tv_token` with a fresh random value.
 */
export const settingsDashboardRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/settings/dashboard',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => readDashboardSettings(database),
    )

    app.put(
      '/api/v1/settings/dashboard',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateDashboardSettingsRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [
            ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
          ]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const { tvAnonymize, conspicuousThreshold, rotateTvToken } = parsed.data

        const rows: { key: string; value: string | boolean | number }[] = []

        if (tvAnonymize !== undefined) {
          rows.push({ key: TV_ANONYMIZE_KEY, value: tvAnonymize })
        }

        if (conspicuousThreshold !== undefined) {
          rows.push({ key: CONSPICUOUS_THRESHOLD_KEY, value: conspicuousThreshold })
        }

        if (rotateTvToken === true) {
          rows.push({ key: TV_TOKEN_KEY, value: generateTvToken() })
        }

        if (rows.length > 0) {
          await database.transaction(async (tx) => {
            for (const row of rows) {
              await tx
                .insert(settings)
                .values({ key: row.key, value: row.value })
                .onConflictDoUpdate({
                  target: settings.key,
                  set: { value: row.value, updatedAt: new Date() },
                })
            }
          })
        }

        return readDashboardSettings(database)
      },
    )
  },
  { name: 'stoerdesk-settings-dashboard' },
)
