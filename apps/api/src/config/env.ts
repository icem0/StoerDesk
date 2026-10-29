import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

import { findEnvFile } from './env-file'

const developmentSecret = 'development-only-secret-change-me'

/** `true`/`false` from the environment, defaulting to the given value. */
const booleanValue = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().default('postgres://stoerdesk:stoerdesk@localhost:5432/stoerdesk'),
    /** Database host. Together with the other DATABASE_* parts it replaces DATABASE_URL. */
    DATABASE_HOST: z.string().default(''),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_NAME: z.string().default('stoerdesk'),
    DATABASE_USER: z.string().default('stoerdesk'),
    DATABASE_PASSWORD: z.string().default(''),
    /** Postgres used by the integration tests, falls back to DATABASE_URL. */
    TEST_DATABASE_URL: z.string().default(''),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    /** Trust `X-Forwarded-*` headers — required behind the nginx reverse proxy. */
    TRUST_PROXY: booleanValue(false),
    SESSION_SECRET: z.string().default(developmentSecret),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
    COOKIE_SECURE: booleanValue(false),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    API_LOG_LEVEL: z.string().default('info'),
    UPLOAD_DIR: z.string().default('/data/uploads'),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),

    // --- Seed data (bootstrap administrator, WP-M1-06) ---
    /** Empty means "no bootstrap account"; otherwise both values are required. */
    SEED_ADMIN_EMAIL: z.string().default(''),
    SEED_ADMIN_PASSWORD: z.string().default(''),

    // --- Web push (VAPID) ---
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default(''),

    // --- E-mail (SMTP) ---
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanValue(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    SMTP_FROM: z.string().default(''),

    // --- Push channel ntfy ---
    NTFY_URL: z.string().default(''),
    NTFY_TOPIC: z.string().default(''),

    // --- Push channel Telegram ---
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TELEGRAM_CHAT_ID: z.string().default(''),

    // --- Push channel Signal (signal-cli JSON-RPC bridge) ---
    SIGNAL_CLI_URL: z.string().default(''),
    SIGNAL_SOURCE_NUMBER: z.string().default(''),
    SIGNAL_RECIPIENTS: z.string().default(''),

    // --- Push channel Matrix ---
    MATRIX_HOMESERVER: z.string().default(''),
    MATRIX_ROOM_ID: z.string().default(''),
    MATRIX_ACCESS_TOKEN: z.string().default(''),
  })
  .superRefine((value, context) => {
    const email = value.SEED_ADMIN_EMAIL.trim()
    const password = value.SEED_ADMIN_PASSWORD

    if (email === '' && password === '') {
      return
    }

    // The messages name the variable only — a seed credential never reaches a log.
    if (email === '') {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ADMIN_EMAIL'],
        message: 'SEED_ADMIN_EMAIL is required when SEED_ADMIN_PASSWORD is set',
      })
    } else if (!z.email().safeParse(email).success) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ADMIN_EMAIL'],
        message: 'SEED_ADMIN_EMAIL must be a valid e-mail address',
      })
    }

    if (password === '') {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ADMIN_PASSWORD'],
        message: 'SEED_ADMIN_PASSWORD is required when SEED_ADMIN_EMAIL is set',
      })
    } else if (password.length < 12) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ADMIN_PASSWORD'],
        message: 'SEED_ADMIN_PASSWORD must be at least 12 characters',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * Reads the `.env` file of the repository without overriding variables that are
 * already set in the process environment. Container environments (Docker
 * Compose) provide every variable explicitly, so the file is only a fallback.
 */
export function loadDotEnvFile(): void {
  const path = findEnvFile()

  if (path === undefined) {
    return
  }

  loadDotenv({ path, quiet: true })
}

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

/**
 * Encodes a credential for the userinfo part of a URL.
 *
 * `encodeURIComponent` leaves `!'()*` untouched; they are valid in a URL but
 * are escaped here so the result is unambiguous everywhere.
 */
function encodeCredential(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * Connection URL of the database.
 *
 * The parts win over `DATABASE_URL` as soon as `DATABASE_HOST` is set: the
 * container stack passes them and the credentials are URL-encoded here, so a
 * password with characters like `#`, `@` or `!` works.
 */
export function databaseConnectionUrl(env: Env): string {
  if (env.DATABASE_HOST === '') {
    return env.DATABASE_URL
  }

  const user = encodeCredential(env.DATABASE_USER)
  const password = env.DATABASE_PASSWORD === '' ? '' : `:${encodeCredential(env.DATABASE_PASSWORD)}`

  return `postgres://${user}${password}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME}`
}

/** Origins allowed by the CORS middleware (comma-separated list). */
export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

/** Recipients of the Signal channel (comma-separated list). */
export function signalRecipients(env: Env): string[] {
  return env.SIGNAL_RECIPIENTS.split(',')
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0)
}
