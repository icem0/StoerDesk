import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  customerPortalSettingsSchema,
  PERMISSIONS,
  updateCustomerPortalSettingsRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Env } from '../config/env'
import { readMailbox } from '../customers/mail'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

/**
 * The switch of the customer portal (`specs/19-customer-portal.md` §19.13,
 * ADR-0062): the administration decides whether the instance has a customer
 * portal at all and whether a customer may register himself.
 *
 * Both switches are **off by default** — an installation that does not want a
 * customer portal keeps none. The registration needs a **cleanly set up
 * mailbox**: without a working mailbox nobody can confirm an account, and an
 * account nobody can confirm is an account nobody can use. The write of the
 * registration is therefore refused while the mailbox is not ready
 * (`422 mail_not_ready`).
 */

const PORTAL_ENABLED_KEY = 'customer.portal_enabled'
const REGISTRATION_ENABLED_KEY = 'customer.registration_enabled'

type Db = Database['database']

async function readSetting(database: Db, key: string): Promise<unknown> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)

  return rows[0]?.value
}

async function writeSetting(database: Db, key: string, value: boolean): Promise<void> {
  await database
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}

/** The state of the portal of the instance (`specs/19-customer-portal.md` §19.13). */
export async function readCustomerPortalSettings(
  database: Db,
  env: Env,
): Promise<{
  portalEnabled: boolean
  registrationEnabled: boolean
  mailReady: boolean
  mailReasons: string[]
}> {
  const [portal, registration, mailbox] = await Promise.all([
    readSetting(database, PORTAL_ENABLED_KEY),
    readSetting(database, REGISTRATION_ENABLED_KEY),
    readMailbox(database, env),
  ])

  return customerPortalSettingsSchema.parse({
    portalEnabled: portal === true,
    registrationEnabled: registration === true,
    mailReady: mailbox.ready,
    mailReasons: mailbox.reasons,
  })
}

/**
 * The two switches alone — the guards of the portal need no mailbox
 * (`specs/19-customer-portal.md` §19.13).
 */
export async function readCustomerPortalSwitches(
  database: Db,
): Promise<{ portalEnabled: boolean; registrationEnabled: boolean }> {
  const [portal, registration] = await Promise.all([
    readSetting(database, PORTAL_ENABLED_KEY),
    readSetting(database, REGISTRATION_ENABLED_KEY),
  ])

  return { portalEnabled: portal === true, registrationEnabled: registration === true }
}

export type CustomerPortalRouteOptions = {
  database: Db
  env: Env
}

export const settingsCustomerRoutes = fp<CustomerPortalRouteOptions>(
  async (app, { database, env }) => {
    app.get(
      '/api/v1/settings/customers',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => readCustomerPortalSettings(database, env),
    )

    app.put(
      '/api/v1/settings/customers',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateCustomerPortalSettingsRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const { portalEnabled, registrationEnabled } = parsed.data

        // §19.13: the registration needs a cleanly set up mailbox — the switch
        // may not be turned on while the mailbox is broken.
        if (registrationEnabled === true) {
          const mailbox = await readMailbox(database, env)

          if (!mailbox.ready) {
            return reply.code(422).send({ code: 'mail_not_ready', params: {} })
          }
        }

        if (portalEnabled !== undefined) {
          await writeSetting(database, PORTAL_ENABLED_KEY, portalEnabled)
        }

        if (registrationEnabled !== undefined) {
          await writeSetting(database, REGISTRATION_ENABLED_KEY, registrationEnabled)
        }

        return readCustomerPortalSettings(database, env)
      },
    )
  },
  { name: 'stoerdesk-settings-customers' },
)
