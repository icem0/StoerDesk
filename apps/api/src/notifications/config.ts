import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import type { Env } from '../config/env'
import {
  notificationChannels,
  notificationChannelVerifications,
  NOTIFICATION_CHANNEL_KINDS,
} from '../db/schema'

type Db = Database['database']

/** The seven channel kinds of `specs/10-notifications.md` §11.1 (§11.10). */
const kinds = NOTIFICATION_CHANNEL_KINDS

/** The machine key of a channel kind. */
export type ChannelKind = typeof kinds[number]

/** What a channel needs to be configured: §11.1/§11.6 and the phase-7 rules. */
interface KindRule {
  requiredConfig: readonly string[]
  secretRequired: boolean
}

const kindRules: Record<ChannelKind, KindRule> = {
  signal: { requiredConfig: ['cliUrl', 'sourceNumber'], secretRequired: false },
  matrix: { requiredConfig: ['homeserver', 'roomId'], secretRequired: true },
  ntfy: { requiredConfig: ['url', 'topic'], secretRequired: false },
  email: { requiredConfig: ['host', 'from'], secretRequired: false },
  telegram: { requiredConfig: ['chatId'], secretRequired: true },
  webpush: { requiredConfig: ['publicKey', 'subject'], secretRequired: true },
  whatsapp: { requiredConfig: ['baseUrl'], secretRequired: true },
}

/**
 * The effective configuration of one channel kind. `secretSet` says whether a
 * secret is present — the secret itself is never part of the answer
 * (ADR-0005 rule, §11.2/§11.13).
 */
export interface ChannelConfiguration {
  kind: ChannelKind
  enabled: boolean
  label: string
  config: Record<string, string>
  secretSet: boolean
  /** True once the target was reached with a one-time code and the code was entered back (§11.2, WP-M14-47). Until then the channel is not "configured", even if all settings are present. */
  verified: boolean
  /**
   * Optional Bearer token for ntfy servers that require authentication
   * (WP-M14-51, ADR-0022): the write-only `secret` of the `ntfy` row with the
   * `NTFY_TOKEN` environment fallback. Sent as the `Authorization` header only,
   * never answered by the API and never part of a public `config`.
   */
  token?: string
}

/**
 * The target a verification belongs to: the required public settings of the
 * kind, in a stable order. A later configuration change produces a different
 * fingerprint, so an old proof no longer counts.
 */
export function channelFingerprint(
  kind: ChannelKind,
  config: Record<string, string>,
): string {
  const keys = [...kindRules[kind].requiredConfig].sort()

  return `${kind}:${keys.map((key) => `${key}=${config[key] ?? ''}`).join('\n')}`
}

/** Public settings and the environment secret of one channel kind. */
interface EnvironmentSettings {
  config: Record<string, string>
  secret: string
}

/**
 * The environment fallback of every kind (§11.2): the same keys the phase-7
 * adapters read. For ntfy the access token of the server is the environment key
 * `NTFY_TOKEN` and plays the role of the secret (ADR-0022, WP-M14-51). WhatsApp
 * Web has no environment keys at all — ADR-0020 keeps the bridge of the operator
 * out of the deployment, so the channel only exists through its row.
 */
function environmentSettings(env: Env): Record<ChannelKind, EnvironmentSettings> {
  return {
    signal: {
      config: {
        cliUrl: env.SIGNAL_CLI_URL,
        sourceNumber: env.SIGNAL_SOURCE_NUMBER,
        recipients: env.SIGNAL_RECIPIENTS,
      },
      secret: '',
    },
    matrix: {
      config: { homeserver: env.MATRIX_HOMESERVER, roomId: env.MATRIX_ROOM_ID },
      secret: env.MATRIX_ACCESS_TOKEN,
    },
    ntfy: {
      config: { url: env.NTFY_URL, topic: env.NTFY_TOPIC },
      secret: env.NTFY_TOKEN,
    },
    email: {
      config: {
        host: env.SMTP_HOST,
        port: String(env.SMTP_PORT),
        secure: env.SMTP_SECURE ? 'true' : 'false',
        user: env.SMTP_USER,
        from: env.SMTP_FROM,
      },
      secret: env.SMTP_PASSWORD,
    },
    telegram: {
      config: { chatId: env.TELEGRAM_CHAT_ID },
      secret: env.TELEGRAM_BOT_TOKEN,
    },
    webpush: {
      config: { publicKey: env.VAPID_PUBLIC_KEY, subject: env.VAPID_SUBJECT },
      secret: env.VAPID_PRIVATE_KEY,
    },
    whatsapp: { config: {}, secret: '' },
  }
}

/**
 * The VAPID trio of the web push: the public key, the private key and the
 * subject belong **together**. The row of the administration wins over the
 * environment as a whole (§11.2, WP-M14-158): a row that carries all three
 * values replaces the trio of the environment, a row that carries only a part
 * of it leaves the trio of the environment untouched. A public key of the row
 * beside a private key of the environment is a pair that does not belong
 * together — the browser would subscribe with a key the server cannot sign
 * for, and every send would fail at the push service.
 */
export interface WebPushTrio {
  /** The VAPID public key — the browser subscribes with it. */
  publicKey: string
  /** The VAPID private key — the server signs with it, it never leaves the server. */
  privateKey: string
  /** The VAPID subject — the `sub` claim of the push service. */
  subject: string
}

/** The effective VAPID trio: the row of the administration as a whole, else the environment. */
export function webPushTrio(
  row: { config: Record<string, string>; secret: string } | undefined,
  env: Env,
): WebPushTrio {
  const rowKey = row?.config.publicKey ?? ''
  const rowSubject = row?.config.subject ?? ''
  const rowSecret = row?.secret ?? ''

  if (rowKey !== '' && rowSubject !== '' && rowSecret !== '') {
    return { publicKey: rowKey, privateKey: rowSecret, subject: rowSubject }
  }

  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  }
}

/**
 * The effective configuration of the web push: the VAPID trio, whether the
 * administration switched the channel off and whether the trio is complete
 * enough to send. The browser reads the public key of it
 * (`apps/api/src/notifications/web-push-subscriptions.ts`), the channel sends
 * with the trio (`apps/api/src/notifications/channels/index.ts`) — both read
 * this one value, so the key the browser subscribes with and the key the
 * server signs with can never differ (WP-M14-158).
 */
export interface WebPushConfiguration extends WebPushTrio {
  /** False while the administration switched the channel off. */
  enabled: boolean
  /** True while the trio is complete — the channel can send. */
  usable: boolean
}

export async function readWebPushConfiguration(
  database: Db,
  env: Env,
): Promise<WebPushConfiguration> {
  const [row] = await database
    .select({
      enabled: notificationChannels.enabled,
      config: notificationChannels.config,
      secret: notificationChannels.secret,
    })
    .from(notificationChannels)
    .where(eq(notificationChannels.kind, 'webpush'))
    .limit(1)

  const trio = webPushTrio(
    row === undefined ? undefined : { config: publicSettings(row.config), secret: row.secret },
    env,
  )

  return {
    ...trio,
    enabled: row?.enabled ?? true,
    usable: trio.publicKey !== '' && trio.privateKey !== '' && trio.subject !== '',
  }
}

/**
 * The effective configuration of one kind with its secret: the row of the
 * administration wins over the environment (§11.2, ADR-0022) — the same rule
 * the effective VAPID trio and the ntfy token follow. The secret stays inside
 * the server: it never enters an answer, a log or an event (§11.13, ADR-0005).
 *
 * An **empty** value of the row does not override the environment: a field that
 * was cleared in the administration falls back to the environment instead of
 * becoming an empty address — a send to an empty host fails with an error the
 * user cannot explain.
 *
 * WhatsApp Web has no environment keys at all (ADR-0020): its bridge exists
 * only through its row.
 */
export interface EffectiveChannel {
  /** The public settings of the kind — the row wins over the environment. */
  config: Record<string, string>
  /** The write-only secret of the kind — the row wins over the environment. */
  secret: string
}

export async function readEffectiveChannel(
  database: Db,
  env: Env,
  kind: ChannelKind,
): Promise<EffectiveChannel> {
  const [row] = await database
    .select({
      config: notificationChannels.config,
      secret: notificationChannels.secret,
    })
    .from(notificationChannels)
    .where(eq(notificationChannels.kind, kind))
    .limit(1)

  const fallback = environmentSettings(env)[kind]
  const config: Record<string, string> = { ...fallback.config }

  for (const [key, value] of Object.entries(row === undefined ? {} : publicSettings(row.config))) {
    if (value !== '') {
      config[key] = value
    }
  }

  let secret = row === undefined || row.secret === '' ? fallback.secret : row.secret

  // The VAPID trio is one value: the row of the administration wins over the
  // environment as a whole (WP-M14-158) — the same rule as in
  // `readWebPushConfiguration`.
  if (kind === 'webpush') {
    const trio = webPushTrio(
      row === undefined
        ? undefined
        : { config: publicSettings(row.config), secret: row.secret },
      env,
    )

    config.publicKey = trio.publicKey
    config.subject = trio.subject
    secret = trio.privateKey
  }

  return { config, secret }
}

/** Narrows a stored kind to one of the seven kinds of §11.1. */
function asKind(value: string): ChannelKind | undefined {
  for (const kind of kinds) {
    if (kind === value) {
      return kind
    }
  }

  return undefined
}

/** Reads the public `config` jsonb as a flat map of string settings. */
export function publicSettings(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  const settings: Record<string, string> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      settings[key] = entry
    }
  }

  return settings
}

/**
 * Reads the effective configuration of the channels: the row of
 * `notification_channels` with that kind wins over the environment (§11.2),
 * a kind without a row keeps its values of the environment and a kind with a
 * row is only configured while its merged settings are usable and `enabled`
 * is on. WhatsApp Web never falls back to the environment (ADR-0020). The
 * answer carries `secretSet` instead of the secret (§11.2, ADR-0005). For
 * ntfy, `verified` is only true after the target was reached with a one-time
 * code and that code was entered back (WP-M14-47); the other kinds have no
 * verification flow yet and count as verified. For `ntfy` the secret is the
 * access token of the server: it is carried as `token` (ADR-0022, WP-M14-51)
 * so the test send, the verification code and the outbox can put it into the
 * `Authorization` header — it never joins the public `config` and never reaches
 * an answer (`channelConfigurationSchema` has no `token`).
 */
export async function readChannelConfiguration(
  database: Db,
  env: Env,
): Promise<ChannelConfiguration[]> {
  const rows = await database
    .select({
      kind: notificationChannels.kind,
      enabled: notificationChannels.enabled,
      label: notificationChannels.label,
      config: notificationChannels.config,
      secret: notificationChannels.secret,
    })
    .from(notificationChannels)

  const verifications = await database
    .select({
      kind: notificationChannelVerifications.kind,
      fingerprint: notificationChannelVerifications.fingerprint,
      verifiedAt: notificationChannelVerifications.verifiedAt,
    })
    .from(notificationChannelVerifications)

  const verificationsByKind = new Map(
    verifications.map((verification) => [verification.kind, verification]),
  )

  const rowsByKind = new Map<ChannelKind, {
    enabled: boolean
    label: string
    config: Record<string, string>
    secret: string
  }>()

  for (const row of rows) {
    const kind = asKind(row.kind)

    if (kind === undefined) {
      continue
    }

    rowsByKind.set(kind, {
      enabled: row.enabled,
      label: row.label,
      config: publicSettings(row.config),
      secret: row.secret,
    })
  }

  const fallbacks = environmentSettings(env)
  const configurations: ChannelConfiguration[] = []

  for (const kind of kinds) {
  const fallback = fallbacks[kind]
  const row = rowsByKind.get(kind)
  const rule = kindRules[kind]

  // Required keys start empty so the checks below only compare real values.
  const emptyRequired: Record<string, string> = {}
  for (const key of rule.requiredConfig) {
    emptyRequired[key] = ''
  }

  const config = { ...emptyRequired, ...fallback.config, ...(row?.config ?? {}) }
  let secret = row === undefined || row.secret === '' ? fallback.secret : row.secret

  // The VAPID trio is one value: the row of the administration wins over the
  // environment as a whole, so the public key of the administration never
  // travels beside the private key of the environment (WP-M14-158).
  if (kind === 'webpush') {
    const trio = webPushTrio(
      row === undefined ? undefined : { config: row.config, secret: row.secret },
      env,
    )

    config.publicKey = trio.publicKey
    config.subject = trio.subject
    secret = trio.privateKey
  }

  const usable =
    rule.requiredConfig.every((key) => config[key] !== '') &&
    (!rule.secretRequired || secret !== '')

    if (row === undefined && !usable) {
      continue
    }

    const verification = verificationsByKind.get(kind)
    const verified =
      kind !== 'ntfy' ||
      (verification?.verifiedAt != null &&
        verification.fingerprint === channelFingerprint(kind, config))

    configurations.push({
      kind,
      enabled: (row?.enabled ?? true) && usable,
      label: row === undefined || row.label === '' ? kind : row.label,
      config,
      secretSet: secret !== '',
      verified,
      ...(kind === 'ntfy' ? { token: secret } : {}),
    })
  }

  return configurations
}
