import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import { adminRolesRoutes } from './admin/roles'
import { adminUsersRoutes } from './admin/users'
import { authRoutes } from './auth/routes'
import { permissionProbeRoutes } from './auth/requirePermission'
import { sessionPlugin } from './auth/sessionPlugin'
import { corsOrigins, loadDotEnvFile, loadEnv } from './config/env'
import { createDatabase } from './db/client'
import { objectRoutes } from './objects/service'
import { seedBaseUser } from './db/seed-base'
import { seedRbac } from './db/seed-rbac'

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

      return reply.send(error)
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
  await app.register(objectRoutes, { database })

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
  await client.end({ timeout: 5 })

  const app = await buildServer()
  await app.listen({ host: env.API_HOST, port: env.API_PORT })
}
