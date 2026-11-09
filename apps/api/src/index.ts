import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import { adminGroupsRoutes } from './admin/groups'
import { adminRolesRoutes } from './admin/roles'
import { adminUsersRoutes } from './admin/users'
import { authRoutes } from './auth/routes'
import { permissionProbeRoutes } from './auth/requirePermission'
import { sessionPlugin } from './auth/sessionPlugin'
import { bmaSyncRoutes } from './integrations/bmacloud/routes'
import { settingsBrandingRoutes } from './settings/branding'
import { settingsDeadlineRoutes } from './settings/deadlines'
import { settingsTextTemplateRoutes } from './settings/text-templates'
import { corsOrigins, databaseConnectionUrl, loadDotEnvFile, loadEnv } from './config/env'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { objectRoutes } from './objects/service'
import { oncallPoolsRoutes } from './oncall/pools'
import { oncallRoutes } from './oncall/routes'
import { seedBaseUser } from './db/seed-base'
import { seedRbac } from './db/seed-rbac'
import { seedStandardTexts } from './db/seed-standard-texts'
import { startBmaAnlageSync } from './jobs/bma-sync'
import { startTicketEscalation } from './jobs/escalation'
import { startNotificationOutboxJob } from './notifications/outbox'
import { startQrTokenCleanup } from './jobs/qr-cleanup'
import { publicAltchaRoutes } from './tickets/altcha'
import { deleteRoutes } from './tickets/delete-routes'
import { publicDuplicateRoutes } from './tickets/duplicates'
import { internalTicketRoutes } from './tickets/internal'
import { ticketListRoutes } from './tickets/list'
import { ticketDetailRoutes } from './tickets/detail'
import { photoServeRoutes } from './tickets/photos'
import { workflowRoutes } from './tickets/workflow-routes'
import { pauseRoutes } from './tickets/pauses'
import { publicReportRoutes } from './tickets/report'
import { publicStatusRoutes } from './tickets/status'
import { updateRoutes } from './update/routes'

loadDotEnvFile()

/** Error shape the routes of this API answer with: `{ code, params }`, never text. */
type EnvelopeError = Error & {
  statusCode?: number
  code?: string
  params?: Record<string, unknown>
}

export async function buildServer() {
  const env = loadEnv()

  const app = Fastify({
    logger: {
      level: env.API_LOG_LEVEL,
    },
    trustProxy: env.TRUST_PROXY,
  })

  // The pool belongs to the server, so `app.close()` always releases it.
  const { client, database } = createDatabase()

  // Apply pending database migrations before the server accepts requests, so
  // the schema is always up to date (e.g. ticket_purges from migration 0012,
  // audit-trigger bypass from migration 0017). Runs on every start; drizzle
  // skips already-applied migrations.
  await runMigrations()

  app.addHook('onClose', async () => {
    await client.end({ timeout: 5 })
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: corsOrigins(env),
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // The plugin throws whatever the builder returns, so it has to be an Error —
    // the envelope itself is produced by the error handler below.
    errorResponseBuilder: (_request, context) => {
      const error = new Error('rate limit exceeded') as EnvelopeError
      error.statusCode = context.statusCode
      error.code = 'rate_limited'
      error.params = { window: env.RATE_LIMIT_WINDOW }

      return error
    },
  })

  // Same error envelope as every route: code plus params, never translated text.
  app.setErrorHandler((error, request, reply) => {
    const envelope = error as EnvelopeError

    if (envelope.code === undefined) {
      request.log.error({ err: error }, 'request failed')

      return reply.code(500).send({ code: 'internal_error', params: {} })
    }

    request.log.warn({ code: envelope.code, statusCode: envelope.statusCode ?? 500 })

    return reply
      .code(envelope.statusCode ?? 500)
      .send({ code: envelope.code, params: envelope.params ?? {} })
  })

  // The session hook has to run before the routes that read `request.user`.
  await app.register(sessionPlugin, { database, env })
  await app.register(authRoutes, { database, env })
  await app.register(adminUsersRoutes, { database })
  await app.register(adminRolesRoutes, { database })
  await app.register(adminGroupsRoutes, { database })
  await app.register(settingsBrandingRoutes, { database })
  await app.register(settingsDeadlineRoutes, { database })
  await app.register(settingsTextTemplateRoutes, { database })
  await app.register(objectRoutes, { database })
  await app.register(oncallPoolsRoutes, { database })
  await app.register(oncallRoutes, { database })
  await app.register(bmaSyncRoutes, { database, env })
  await app.register(updateRoutes, { database, env })
  await app.register(publicReportRoutes, {
    database,
    uploadDir: env.UPLOAD_DIR,
    maxPhotoBytes: env.UPLOAD_MAX_BYTES,
  })
  await app.register(publicAltchaRoutes, {
    secret: env.ALTCHA_SECRET,
    maxNumber: env.ALTCHA_MAX_NUMBER,
  })
  await app.register(publicStatusRoutes, { database })
  await app.register(publicDuplicateRoutes, { database })
  await app.register(internalTicketRoutes, { database })
  await app.register(ticketListRoutes, { database })
  await app.register(ticketDetailRoutes, { database })
  await app.register(photoServeRoutes, { database, uploadDir: env.UPLOAD_DIR })
  await app.register(deleteRoutes, { database, uploadDir: env.UPLOAD_DIR })
  await app.register(workflowRoutes, { database })
  await app.register(pauseRoutes, { database })

  // Guard probe of WP-M1-08: only in the test environment, never in development
  // or production (`specs/01-rbac.md` §3.7).
  if (env.NODE_ENV === 'test') {
    await app.register(permissionProbeRoutes, { database })
  }

  app.get('/api/v1/health', async () => ({ status: 'ok' }))

  return app
}

const invokedDirectly =
  process.argv[1]?.endsWith('index.ts') === true || process.argv[1]?.endsWith('index.js') === true

if (invokedDirectly) {
  const env = loadEnv()
  const { client, database } = createDatabase()

  // Bootstrap RBAC and the initial administrator on direct start, so a fresh
  // deployment has a working admin account without a manual seed step.
  await seedRbac(database)
  await seedBaseUser(database, {
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
  })
  await seedStandardTexts(database)
  await client.end({ timeout: 5 })

  const app = await buildServer()

  // Scheduled jobs belong to the process that serves requests, not to the
  // server object: `buildServer` stays job-free, so integration tests never
  // create the pg-boss schema (WP-M2-02b).
  const cleanup = await startQrTokenCleanup(databaseConnectionUrl(env), app.log)
  const escalation = await startTicketEscalation(databaseConnectionUrl(env), app.log)

  // The BMAcloud pull is scheduled only when the tenant credentials exist
  // (WP-M2-36); the manual trigger of the admin API needs no scheduler.
  const bmaSync = await startBmaAnlageSync(databaseConnectionUrl(env), env, app.log)
  const notificationOutbox = await startNotificationOutboxJob(
    databaseConnectionUrl(env),
    env,
    app.log,
  )

  app.addHook('onClose', async () => {
    await cleanup.stop({ timeout: 5000 })
    await escalation.stop({ timeout: 5000 })
    await notificationOutbox.stop({ timeout: 5000 })

    if (bmaSync !== undefined) {
      await bmaSync.stop({ timeout: 5000 })
    }
  })

  await app.listen({ host: env.API_HOST, port: env.API_PORT })
}
