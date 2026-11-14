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
type ChannelKind = typeof kinds[number]

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
  /** True once the channel target was reached and confirmed (§11.2). */
  verified: boolean
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
 * adapters read. WhatsApp Web has no environment keys at all — ADR-0020 keeps
 * the bridge of the operator out of the deployment, so the channel only
 * exists through its row.
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
      secret: '',
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
function publicSettings(value: unknown): Record<string, string> {
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
 * verification flow yet and count as verified.
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
  const secret =
    row === undefined || row.secret === '' ? fallback.secret : row.secret

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
    })
  }

  return configurations
}
