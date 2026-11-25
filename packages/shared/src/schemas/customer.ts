import { z } from 'zod'

/**
 * Contracts of the customer portal (`specs/19-customer-portal.md` §19.3, §19.5,
 * §19.6, ADR-0053, ADR-0054).
 *
 * The customer is a user with the role `customer` (ADR-0053). The registration
 * is confirmed over a link in the mail and exists only when the e-mail channel
 * of the instance is configured (ADR-0054). The API answers codes, never
 * translated text.
 */

const trimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value))

/**
 * The token of a link (`specs/19-customer-portal.md` §19.3): 32 random bytes
 * as base64url. The server stores only the SHA-256 hash of the token; the plain
 * text exists once, in the mail.
 */
export const customerTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export type CustomerToken = z.infer<typeof customerTokenSchema>

/** The purposes of a token (`account_tokens.purpose`). */
export const CUSTOMER_TOKEN_PURPOSES = ['registration', 'password_reset'] as const

export type CustomerTokenPurpose = (typeof CUSTOMER_TOKEN_PURPOSES)[number]

/**
 * `GET /api/v1/public/auth/registration` — the answer that tells the pages
 * whether the registration exists at all: it needs a configured e-mail channel
 * (ADR-0054). The answer never names an address.
 */
export const customerRegistrationAvailabilitySchema = z.object({
  available: z.boolean(),
})

export type CustomerRegistrationAvailability = z.infer<
  typeof customerRegistrationAvailabilitySchema
>

/**
 * `POST /api/v1/public/auth/register` — the request of the registration. The
 * address is the way to the account; the name is what the office sees next to
 * the tickets of the customer.
 */
export const customerRegisterRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  givenName: trimmedText(80),
  familyName: trimmedText(80),
})

export type CustomerRegisterRequest = z.infer<typeof customerRegisterRequestSchema>

/**
 * `POST /api/v1/public/auth/password-reset` — the request of a new password.
 * The answer is the same for every address (ADR-0054).
 */
export const customerPasswordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
})

export type CustomerPasswordResetRequest = z.infer<typeof customerPasswordResetRequestSchema>

/**
 * `GET /api/v1/public/auth/token/:token` — the answer that names the purpose
 * of the link and the address it belongs to. The address is shown to nobody
 * but the visitor of the link; it is the address the mail was sent to.
 */
export const customerTokenAnswerSchema = z.object({
  purpose: z.enum(CUSTOMER_TOKEN_PURPOSES),
  email: z.email(),
  expiresAt: z.iso.datetime(),
})

export type CustomerTokenAnswer = z.infer<typeof customerTokenAnswerSchema>

/**
 * `POST /api/v1/public/auth/token/:token/password` — the new password of the
 * account. The rule of the password is the rule of the office
 * (`specs/01-rbac.md` §3.9): at least 12 characters.
 */
export const customerSetPasswordRequestSchema = z.object({
  password: z.string().min(12).max(256),
})

export type CustomerSetPasswordRequest = z.infer<typeof customerSetPasswordRequestSchema>

/**
 * `PATCH /api/v1/customer/tickets/:ticketNo/notifications` — the decision of the
 * customer about the messages about his ticket (§19.6, ADR-0056): the opt-in
 * belongs to the reporter, so he may change it himself.
 */
export const customerNotificationsRequestSchema = z.object({
  emailNotifications: z.boolean(),
})

export type CustomerNotificationsRequest = z.infer<typeof customerNotificationsRequestSchema>

/**
 * `POST /api/v1/objects/:objectNo/assignments` — the trained person of the
 * object (`specs/19-customer-portal.md` §19.2). The customer is a user of the
 * role `customer`.
 */
export const objectAssignmentRequestSchema = z.object({
  userId: z.uuid(),
})

export type ObjectAssignmentRequest = z.infer<typeof objectAssignmentRequestSchema>

/**
 * The answer of the assignments of an object: the id of the user, his name and
 * the time of the assignment — never his address and never his permissions.
 */
export const objectAssignmentSchema = z.object({
  userId: z.uuid(),
  givenName: z.string(),
  familyName: z.string(),
  createdAt: z.iso.datetime(),
})

export type ObjectAssignment = z.infer<typeof objectAssignmentSchema>

/**
 * A ticket of the portal of the customer (`specs/19-customer-portal.md` §19.5):
 * the number, the title, the object, the priority, the state and the times.
 */
export const customerTicketSummarySchema = z.object({
  ticketNo: z.string(),
  title: z.string().nullable(),
  objectName: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  status: z.string(),
  reportedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /**
   * The decision of the customer about the messages about his ticket
   * (§19.6): the opt-in belongs to the reporter.
   */
  emailNotifications: z.boolean(),
})

export type CustomerTicketSummary = z.infer<typeof customerTicketSummarySchema>

/**
 * The detail of a ticket of the portal: the summary of the ticket and the
 * customer visible history (`specs/19-customer-portal.md` §19.5). The internal
 * entries of the history and the internal comments never reach the portal
 * (ADR-0034, ADR-0038).
 */
export const customerTicketDetailSchema = customerTicketSummarySchema.extend({
  description: z.string().nullable(),
  events: z.array(
    z.object({
      kind: z.enum(['event', 'comment']),
      at: z.iso.datetime(),
      text: z.string(),
    }),
  ),
})

export type CustomerTicketDetail = z.infer<typeof customerTicketDetailSchema>

/**
 * An object of the customer (`specs/19-customer-portal.md` §19.5): the objects
 * of his assignments.
 */
export const customerObjectSchema = z.object({
  objectNo: z.string(),
  name: z.string(),
  street: z.string().nullable(),
  city: z.string().nullable(),
})

export type CustomerObject = z.infer<typeof customerObjectSchema>
