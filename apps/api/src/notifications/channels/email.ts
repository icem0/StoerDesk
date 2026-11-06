import { t, type ServerLocale } from '@stoerdesk/shared'
import { createTransport } from 'nodemailer'

export interface EmailConfig {
  /** Host of an existing mail server, e.g. mail.example.org — the channel is off while it is empty */
  host: string
  /** Port of the mail server, e.g. 587 (STARTTLS) or 465 (TLS) */
  port: number
  /** `true` opens the connection already encrypted (465), `false` upgrades on the way (587) */
  secure: boolean
  /** Login user of the mail server; empty means "no authentication" */
  user: string
  /** Password of the login user; never logged, never in an error message */
  password: string
  /** Sender address the notification is signed with, e.g. stoerdesk@example.org */
  from: string
  /**
   * Locale of the deep-link label. `de` is the default and reference locale
   * (`PLAN.md` §3.1) and an unset locale resolves to it, so a caller that knows
   * no locale still gets a translated label (WP-M7-04b).
   */
  locale?: ServerLocale
}

export interface NotificationMessage {
  title: string
  body: string
}

export class EmailError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EmailError'
    this.code = code
  }
}

/**
 * The label of the deep link, resolved through the shared server `t()` over
 * `server.{de,en}.json` — the same `notification.action_label` the ntfy action
 * carries (`PLAN.md` §3.1, WP-M7-04b).
 */
const actionLabel = (config: EmailConfig): string =>
  t(config.locale ?? 'de', 'notification.action_label')

/**
 * Sends a notification over SMTP through nodemailer.
 *
 * The mail carries the ticket number as its subject, the message body and the
 * deep link to the PWA — never a photo, never contact data (`PLAN.md` §12
 * message content). An empty `from` cannot sign a mail and is reported instead
 * of reaching the server. `createTransportImpl` is the injectable transport
 * factory: a test hands it the JSON transport of nodemailer, the product path
 * hands it the SMTP transport of the environment.
 */
export async function sendEmailNotification(
  config: EmailConfig,
  message: NotificationMessage,
  pwaUrl: string,
  createTransportImpl: typeof createTransport = createTransport,
): Promise<void> {
  if (config.from === '') {
    throw new EmailError('no_sender', 'No sender address configured')
  }

  const transporter = createTransportImpl({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user === '' ? {} : { auth: { user: config.user, pass: config.password } }),
  })

  const text = pwaUrl === '' ? message.body : `${message.body}\n\n${actionLabel(config)}: ${pwaUrl}`

  try {
    await transporter.sendMail({
      from: config.from,
      subject: message.title,
      text,
    })
  } catch (error) {
    // Message and code only: a nodemailer connection error carries the address of
    // the mail server, never the password.
    throw new EmailError('send_failed', error instanceof Error ? error.message : String(error))
  }
}
