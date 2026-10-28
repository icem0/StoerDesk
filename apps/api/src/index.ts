import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import { loadEnv } from './config/env'

export async function buildServer() {
  const env = loadEnv()

  const app = Fastify({
    logger: {
      level: env.API_LOG_LEVEL,
    },
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  })

  app.get('/api/v1/health', async () => ({ status: 'ok' }))

  return app
}

const invokedDirectly =
  process.argv[1]?.endsWith('index.ts') === true || process.argv[1]?.endsWith('index.js') === true

if (invokedDirectly) {
  const env = loadEnv()
  const app = await buildServer()
  await app.listen({ host: env.API_HOST, port: env.API_PORT })
}
