import fp from 'fastify-plugin'
import {
  customerPasswordResetRequestSchema,
  customerRegisterRequestSchema,
  customerSetPasswordRequestSchema,
  customerTokenAnswerSchema,
  customerTokenSchema,
} from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { readMailbox, sendPasswordResetMail, sendRegistrationMail } from './mail'
import {
  consumeAccountToken,
  createPasswordResetToken,
  createPendingCustomer,
  CustomerServiceError,
  readAccountToken,
  userIdByEmail,
} from './registration'

/**
 * The public routes of the customer portal (`specs/19-customer-portal.md`
 * §19.3, §19.4, ADR-0054): the availability of the registration, the request
 * of the registration, the request of a new password and the use of a link.
 *
 * The answers never name an address: an unknown address, an address that is
 * already in use and the address of a colleague of the office are answered the
 * same way — a difference would tell a stranger which addresses exist in the
 * installation.
 */

type Db = Database['database']

export type CustomerPublicRouteOptions = {
  database: Db
  env: Env
}

/** The attempts of the public routes per minute and IP. */
function publicRateLimit() {
  return { max: 5, timeWindow: '1 minute' } as const
}

/**
 * The public address of the installation: `PWA_URL` when it is set, otherwise
 * the origin of the request. The link of the registration points to it.
 */
function baseUrlOf(request: { protocol: string; hostname: string }, env: Env): string {
  if (env.PWA_URL !== '') {
    return env.PWA_URL.replace(/\/$/, '')
  }

  return `${request.protocol}://${request.hostname}`
}

export const customerPublicRoutes = fp<CustomerPublicRouteOptions>(
  async (app, { database, env }) => {
    app.get('/api/v1/public/auth/registration', async () => {
      const mailbox = await readMailbox(database, env)

      return { available: mailbox.available }
    })

    app.post(
      '/api/v1/public/auth/register',
      { config: { rateLimit: publicRateLimit() } },
      async (request, reply) => {
        const parsed = customerRegisterRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['email'] } })
        }

        const mailbox = await readMailbox(database, env)

        if (!mailbox.available) {
          return reply.code(409).send({ code: 'registration_unavailable', params: {} })
        }

        const locale = request.headers['accept-language']?.toLowerCase().startsWith('en')
          ? 'en'
          : 'de'

        try {
          const customer = await createPendingCustomer(database, {
            email: parsed.data.email,
            givenName: parsed.data.givenName,
            familyName: parsed.data.familyName,
            createdVia: 'registration',
          })

          const link = `${baseUrlOf(request, env)}/portal/activate/${customer.token}`

          try {
            await sendRegistrationMail(mailbox, parsed.data.email, link, locale)
          } catch (error) {
            // A mail that fails does not undo the registration: the customer can
            // ask for a new link. The mail server is never named in the log.
            request.log.warn({ code: 'registration_mail_failed' }, 'registration mail failed')
          }
        } catch (error) {
          // An address that is already in use is not an error for the caller —
          // the answer stays the same, so the route does not name the addresses
          // of the installation.
          if (!(error instanceof CustomerServiceError) || error.code !== 'email_taken') {
            throw error
          }
        }

        return reply.code(202).send({ status: 'accepted' })
      },
    )

    app.post(
      '/api/v1/public/auth/password-reset',
      { config: { rateLimit: publicRateLimit() } },
      async (request, reply) => {
        const parsed = customerPasswordResetRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['email'] } })
        }

        const mailbox = await readMailbox(database, env)

        if (!mailbox.available) {
          return reply.code(409).send({ code: 'registration_unavailable', params: {} })
        }

        const userId = await userIdByEmail(database, parsed.data.email)

        if (userId !== null) {
          const token = await createPasswordResetToken(database, userId)
          const link = `${baseUrlOf(request, env)}/portal/activate/${token}`

          try {
            await sendPasswordResetMail(mailbox, parsed.data.email, link, 'de')
          } catch (error) {
            request.log.warn({ code: 'password_reset_mail_failed' }, 'password reset mail failed')
          }
        }

        return reply.code(202).send({ status: 'accepted' })
      },
    )

    app.get<{ Params: { token: string } }>(
      '/api/v1/public/auth/token/:token',
      async (request, reply) => {
        const parsed = customerTokenSchema.safeParse(request.params.token)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['token'] } })
        }

        const token = await readAccountToken(database, parsed.data)

        return customerTokenAnswerSchema.parse({
          purpose: token.purpose,
          email: token.email,
          expiresAt: token.expiresAt.toISOString(),
        })
      },
    )

    app.post<{ Params: { token: string } }>(
      '/api/v1/public/auth/token/:token/password',
      { config: { rateLimit: publicRateLimit() } },
      async (request, reply) => {
        const parsedToken = customerTokenSchema.safeParse(request.params.token)

        if (!parsedToken.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['token'] } })
        }

        const parsed = customerSetPasswordRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['password'] } })
        }

        await consumeAccountToken(database, parsedToken.data, parsed.data.password)

        return reply.code(204).send()
      },
    )
  },
)
