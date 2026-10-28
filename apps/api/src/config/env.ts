import { z } from 'zod'

const developmentSecret = 'development-only-secret-change-me'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://stoerdesk:stoerdesk@localhost:5432/stoerdesk'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().default(developmentSecret),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  API_LOG_LEVEL: z.string().default('info'),
  UPLOAD_DIR: z.string().default('/data/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid environment configuration: ${issues}`)
  }

  const env = parsed.data

  if (env.NODE_ENV === 'production' && env.SESSION_SECRET === developmentSecret) {
    throw new Error('SESSION_SECRET must be set in production')
  }

  return env
}
