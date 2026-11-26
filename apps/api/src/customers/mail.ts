import { eq } from 'drizzle-orm'

import { sendEmailNotification, type EmailConfig } from '../notifications/channels/email'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { notificationChannels } from '../db/schema'

/**
 * The mails of the customer portal (`specs/19-customer-portal.md` §19.3,
 * ADR-0054, ADR-0046): the confirmation of the registration and the link of
 * the forgotten password.
 *
 * The mailbox of the instance is the row of the channel — the row wins over
 * the environment (ADR-0046). The registration exists only when the mailbox
 * has a host and a sender: without them there is no way to reach the
 * customer, and an account nobody can confirm is an account nobody can use.
 */

type Db = Database['database']

/** The effective mailbox of the instance — the row wins over the environment. */
export interface Mailbox {
  config: EmailConfig
  /** `true` when the mailbox can send a mail at all. */
  available: boolean
  /**
   * `true` when the mailbox is **cleanly set up** (`specs/19-customer-portal.md`
   * §19.13, ADR-0062): the channel exists, it is enabled, the host is set, the
   * sender is an address and the login is complete. The registration of a
   * customer needs it — a mailbox that cannot deliver cannot confirm an
   * account.
   */
  ready: boolean
  /** The reasons why the mailbox is not ready — the administration names them. */
  reasons: string[]
}

function stringSettings(value: unknown): Record<string, string> {
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

/** Reads the mailbox of the instance and answers whether it can send. */
export async function readMailbox(database: Db, env: Env): Promise<Mailbox> {
  const rows = await database
    .select({
      config: notificationChannels.config,
      secret: notificationChannels.secret,
      enabled: notificationChannels.enabled,
    })
    .from(notificationChannels)
    .where(eq(notificationChannels.kind, 'email'))
    .limit(1)

  const [row] = rows
  const settings = row === undefined ? {} : stringSettings(row.config)

  const host = settings.host ?? env.SMTP_HOST
  const from = settings.from ?? env.SMTP_FROM

  const config: EmailConfig = {
    to: [],
    host,
    port: Number(settings.port ?? env.SMTP_PORT),
    secure: (settings.secure ?? String(env.SMTP_SECURE)) === 'true',
    user: settings.user ?? env.SMTP_USER,
    password: row === undefined || row.secret === '' ? env.SMTP_PASSWORD : row.secret,
    from,
    displayName: settings.displayName ?? '',
    templates: {
      ticket: settings.templateTicket ?? '',
      readiness: settings.templateReadiness ?? '',
      test: settings.templateTest ?? '',
      registration: settings.templateRegistration ?? '',
      passwordReset: settings.templatePasswordReset ?? '',
      customerTicket: settings.templateCustomerTicket ?? '',
    },
  }

  // §19.13 (ADR-0062): the reasons why the mailbox is not cleanly set up.
  const reasons: string[] = []

  if (row === undefined) {
    reasons.push('channel_missing')
  } else if (!row.enabled) {
    reasons.push('channel_disabled')
  }

  if (host === '') {
    reasons.push('host_missing')
  }

  if (from === '') {
    reasons.push('sender_missing')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    reasons.push('sender_invalid')
  }

  const password = row === undefined || row.secret === '' ? env.SMTP_PASSWORD : row.secret

  if (config.user !== '' && password === '') {
    reasons.push('password_missing')
  }

  return {
    config,
    available: host !== '' && from !== '',
    ready: reasons.length === 0,
    reasons,
  }
}

/**
 * Sends the confirmation of a registration. The body names the account and
 * carries the link — the link is the only secret of the registration.
 */
export async function sendRegistrationMail(
  mailbox: Mailbox,
  address: string,
  link: string,
  locale: 'de' | 'en',
): Promise<void> {
  const body =
    locale === 'en'
      ? `Welcome to the customer portal of the installation.\n\nYour account is ready. Please set your password over this link:\n${link}\n\nThe link is valid for 24 hours.`
      : `Willkommen im Kundenportal der Installation.\n\nIhr Konto ist angelegt. Bitte setzen Sie Ihr Passwort über diesen Link:\n${link}\n\nDer Link ist 24 Stunden gültig.`

  await sendEmailNotification(
    { ...mailbox.config, to: [address] },
    {
      title: locale === 'en' ? 'Your account of the customer portal' : 'Ihr Konto im Kundenportal',
      body,
      kind: 'registration',
      params: { link, email: address },
    },
    '',
  )
}

/** Sends the link of the forgotten password. */
export async function sendPasswordResetMail(
  mailbox: Mailbox,
  address: string,
  link: string,
  locale: 'de' | 'en',
): Promise<void> {
  const body =
    locale === 'en'
      ? `A new password was requested for your account.\n\nPlease set a new password over this link:\n${link}\n\nThe link is valid for 24 hours. If you did not ask for it, you can ignore this mail.`
      : `Für Ihr Konto wurde ein neues Passwort angefordert.\n\nBitte setzen Sie ein neues Passwort über diesen Link:\n${link}\n\nDer Link ist 24 Stunden gültig. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail.`

  await sendEmailNotification(
    { ...mailbox.config, to: [address] },
    {
      title:
        locale === 'en'
          ? 'Your new password of the customer portal'
          : 'Ihr neues Passwort im Kundenportal',
      body,
      kind: 'password_reset',
      params: { link, email: address },
    },
    '',
  )
}
