import { t, type ServerLocale } from '@stoerdesk/shared'
import { createTransport } from 'nodemailer'

export interface EmailConfig {
  /**
   * The recipients of the mail: the address of the user for a personal message,
   * the mail addresses of the instance for a broadcast (ADR-0046). A mail
   * without a recipient is refused — a mail nobody receives is not a delivery.
   */
  to: string[]
  /** The display name of the sender — the name beside the address. */
  displayName?: string
  /**
   * The templates of the messages per kind (§11.5a): a plain text with the
   * placeholders of §11.5a. A kind without a template uses the built-in text.
   */
  templates?: {
    ticket?: string
    readiness?: string
    test?: string
    /** The mails of the customer portal (`specs/19-customer-portal.md` §19.3). */
    registration?: string
    passwordReset?: string
    /** The report of the reporter (§19.8, ADR-0056). */
    customerTicket?: string
  }
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
  /**
   * The kind of the message — `ticket`, `readiness` or `test` — it names
   * the template of §11.5a.
   */
  kind?: string
  /**
   * The machine-readable values of the message (§11.5): the placeholders of
   * the template are filled with them. The values are escaped before they
   * enter the HTML.
   */
  params?: Record<string, unknown>
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
/**
 * The placeholders of the templates of §11.5a and the values that fill them.
 * The values come from the machine-readable params of the message (§11.5) and
 * are escaped before they enter the HTML — a report of a customer can never
 * carry markup into the mail of the office.
 */
const placeholderValues = (
  message: NotificationMessage,
  pwaUrl: string,
): Record<string, string> => {
  const params = message.params ?? {}

  return {
    ticket_no: String(params.ticketNo ?? ''),
    priority: String(params.priority ?? ''),
    object: String(params.objectName ?? ''),
    location: String(params.objectLocation ?? ''),
    system_type: String(params.systemType ?? ''),
    text: String(params.shortText ?? ''),
    aa_sa: String(params.workOrderNo ?? ''),
    pool: String(params.poolName ?? ''),
    starts_at: String(params.startsAt ?? ''),
    ends_at: String(params.endsAt ?? ''),
    state: String(params.state ?? ''),
    url: pwaUrl,
    /** The link of the customer portal — the link of the registration. */
    link: String(params.link ?? pwaUrl),
    email: String(params.email ?? ''),
  }
}

/** Escapes the characters that carry meaning in HTML. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Replaces the placeholders of a template with the escaped values. */
const fillTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{([a-z_]+)\}/g, (match, name: string) => {
    const value = values[name]

    return value === undefined ? match : escapeHtml(value)
  })

/**
 * The template of a kind of the message. The kinds of the customer portal —
 * `registration` and `password_reset` — carry their own template
 * (`specs/19-customer-portal.md` §19.3); every other kind uses the template of
 * the ticket.
 */
const templateFor = (config: EmailConfig, kind: string | undefined): string => {
  switch (kind) {
    case 'readiness':
      return config.templates?.readiness ?? ''
    case 'test':
      return config.templates?.test ?? ''
    case 'registration':
      return config.templates?.registration ?? ''
    case 'password_reset':
      return config.templates?.passwordReset ?? ''
    case 'customer_ticket':
      return config.templates?.customerTicket ?? ''
    default:
      return config.templates?.ticket ?? ''
  }
}

/**
 * The body of the mail as HTML (§11.5, ADR-0046): the template of the kind of
 * the message, or the built-in text. The empty lines become paragraphs, the
 * deep link becomes a link and the text of the message is escaped.
 */
export const renderHtmlBody = (
  config: EmailConfig,
  message: NotificationMessage,
  pwaUrl: string,
): string => {
  const values = placeholderValues(message, pwaUrl)
  const template = templateFor(config, message.kind)

  // The values of a template are escaped while they are filled in; the built-in
  // text is escaped here — every value is escaped exactly once.
  const text = template === '' ? escapeHtml(message.body) : fillTemplate(template, values)
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('')

  const link =
    pwaUrl === ''
      ? ''
      : `<p><a href="${escapeHtml(pwaUrl)}">${escapeHtml(actionLabel(config))}</a></p>`

  return `<html><body>${paragraphs}${link}</body></html>`
}

export async function sendEmailNotification(
  config: EmailConfig,
  message: NotificationMessage,
  pwaUrl: string,
  createTransportImpl: typeof createTransport = createTransport,
): Promise<void> {
  if (config.from === '') {
    throw new EmailError('no_sender', 'No sender address configured')
  }

  const recipients = (config.to ?? []).map((address) => address.trim()).filter((address) => address !== '')

  if (recipients.length === 0) {
    throw new EmailError('no_recipients', 'No recipient address configured')
  }

  const transporter = createTransportImpl({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user === '' ? {} : { auth: { user: config.user, pass: config.password } }),
  })

  const text = pwaUrl === '' ? message.body : `${message.body}\n\n${actionLabel(config)}: ${pwaUrl}`
  const html = renderHtmlBody(config, message, pwaUrl)
  const from =
    config.displayName === undefined || config.displayName === ''
      ? config.from
      : `${config.displayName} <${config.from}>`

  try {
    await transporter.sendMail({
      from,
      to: recipients,
      subject: message.title,
      text,
      html,
    })
  } catch (error) {
    // Message and code only: a nodemailer connection error carries the address of
    // the mail server, never the password.
    throw new EmailError('send_failed', error instanceof Error ? error.message : String(error))
  }
}
