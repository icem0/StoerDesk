import { randomInt } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { t } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationChannelVerifications } from '../db/schema'
import {
  channelFingerprint,
  readChannelConfiguration,
  type ChannelConfiguration,
} from './config'
import { sendNtfyNotification, type NtfyConfig } from './channels/ntfy'

type Db = Database['database']

/** A code is valid for ten minutes, like the Telegram linking code (§11.3). */
export const NTFY_VERIFICATION_TTL_MS = 10 * 60 * 1000

/** Six unambiguous characters: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export type ChannelVerificationErrorCode =
  | 'channel_not_configured'
  | 'verification_code_invalid'
  | 'verification_code_expired'
  | 'verification_send_failed'

/** A verification step failed in a way the admin UI can explain (§11.2). */
export class ChannelVerificationError extends Error {
  readonly code: ChannelVerificationErrorCode

  constructor(code: ChannelVerificationErrorCode, message: string) {
    super(message)
    this.name = 'ChannelVerificationError'
    this.code = code
  }
}

/** A fresh six-character code, upper-case. */
export function generateVerificationCode(): string {
  let code = ''

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }

  return code
}

const ntfyOf = (
  configurations: ChannelConfiguration[],
): ChannelConfiguration | undefined =>
  configurations.find((configuration) => configuration.kind === 'ntfy')

/**
 * The ntfy target StörDesk actually uses. Without `requireVerified` this is
 * the effective target of §11.2 (row wins over the environment) and is used to
 * send the verification code; the outbox asks for a verified target so an
 * unconfirmed channel never receives ticket notifications.
 */
export async function effectiveNtfyConfig(
  database: Db,
  env: Env,
  options: { requireVerified: boolean },
): Promise<NtfyConfig | null> {
  const ntfy = ntfyOf(await readChannelConfiguration(database, env))

  if (ntfy === undefined || !ntfy.enabled) {
    return null
  }

  const url = ntfy.config.url ?? ''
  const topic = ntfy.config.topic ?? ''

  if (url === '' || topic === '') {
    return null
  }

  if (options.requireVerified && !ntfy.verified) {
    return null
  }

  return { url, topic }
}

/**
 * Sends a fresh one-time code to the effective ntfy target and stores it for
 * the confirmation step. The code never appears in the answer — only the
 * deadline does. A previous proof is cleared, because the admin has to confirm
 * the target again.
 */
export async function requestNtfyVerification(
  database: Db,
  env: Env,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ expiresAt: string }> {
  const target = await effectiveNtfyConfig(database, env, { requireVerified: false })

  if (target === null) {
    throw new ChannelVerificationError(
      'channel_not_configured',
      'ntfy has no usable configuration',
    )
  }

  const code = generateVerificationCode()
  const expiresAt = new Date(Date.now() + NTFY_VERIFICATION_TTL_MS)
  const fingerprint = channelFingerprint('ntfy', { url: target.url, topic: target.topic })

  await database
    .insert(notificationChannelVerifications)
    .values({
      kind: 'ntfy',
      fingerprint,
      code,
      expiresAt,
      verifiedAt: null,
    })
    .onConflictDoUpdate({
      target: notificationChannelVerifications.kind,
      set: {
        fingerprint,
        code,
        expiresAt,
        verifiedAt: null,
        updatedAt: new Date(),
      },
    })

  try {
    await sendNtfyNotification(
      target,
      { title: 'StörDesk', body: t('de', 'notification.verification_code', { code }) },
      env.PWA_URL,
      options.fetchImpl,
    )
  } catch (error) {
    await database
      .insert(notificationChannelVerifications)
      .values({ kind: 'ntfy', code: '', expiresAt: null, verifiedAt: null })
      .onConflictDoUpdate({
        target: notificationChannelVerifications.kind,
        set: { code: '', expiresAt: null, verifiedAt: null, updatedAt: new Date() },
      })

    const message = error instanceof Error ? error.message : 'ntfy is unreachable'

    throw new ChannelVerificationError('verification_send_failed', message)
  }

  return { expiresAt: expiresAt.toISOString() }
}

/**
 * Checks a code that arrived on the ntfy topic and records the proof for the
 * current target. A code of an older target, an expired code and a wrong code
 * all fail; the proof only ever applies to the fingerprint that produced it.
 */
export async function confirmNtfyVerification(
  database: Db,
  env: Env,
  input: string,
): Promise<void> {
  const target = await effectiveNtfyConfig(database, env, { requireVerified: false })

  if (target === null) {
    throw new ChannelVerificationError(
      'channel_not_configured',
      'ntfy has no usable configuration',
    )
  }

  const [row] = await database
    .select({
      fingerprint: notificationChannelVerifications.fingerprint,
      code: notificationChannelVerifications.code,
      expiresAt: notificationChannelVerifications.expiresAt,
    })
    .from(notificationChannelVerifications)
    .where(eq(notificationChannelVerifications.kind, 'ntfy'))
    .limit(1)

  if (row === undefined || row.code === '') {
    throw new ChannelVerificationError(
      'verification_code_invalid',
      'No pending ntfy verification code',
    )
  }

  const fingerprint = channelFingerprint('ntfy', { url: target.url, topic: target.topic })

  if (row.fingerprint !== fingerprint) {
    throw new ChannelVerificationError(
      'verification_code_invalid',
      'The ntfy configuration changed after the code was sent',
    )
  }

  if (row.expiresAt === null || row.expiresAt.getTime() < Date.now()) {
    throw new ChannelVerificationError(
      'verification_code_expired',
      'The ntfy verification code has expired',
    )
  }

  if (row.code !== input.trim().toUpperCase()) {
    throw new ChannelVerificationError(
      'verification_code_invalid',
      'The ntfy verification code is wrong',
    )
  }

  await database
    .insert(notificationChannelVerifications)
    .values({
      kind: 'ntfy',
      fingerprint,
      code: '',
      expiresAt: null,
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: notificationChannelVerifications.kind,
      set: {
        fingerprint,
        code: '',
        expiresAt: null,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      },
    })
}
