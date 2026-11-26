import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { notificationItems, permissions, userPermissions, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { DELIVERY_FAILURE_EVENT } from '../alarm'
import { drainOutbox, enqueuePersonalDeliveries } from '../outbox'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped delivery failure alarm integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the alarm of a failed delivery (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let adminId = ''
    let otherId = ''
    let ticketId = ''
    let ticketNo = ''

    /** The environment of the drain: no channel is configured — every send fails. */
    const envOf = () => loadEnv({})

    async function userIdFor(email: string): Promise<string> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-alarm-user' })
        .returning({ id: users.id })

      return row!.id
    }

    const tasksOf = async () =>
      db
        .select()
        .from(notificationItems)
        .where(eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT))

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: '9800_04', name: 'alarm probe object' })
        .returning({ id: schema.objects.id })

      const [ticket] = await db
        .insert(schema.tickets)
        .values({
          objectId: object!.id,
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        })
        .returning({ id: schema.tickets.id, ticketNo: schema.tickets.ticketNo })

      ticketId = ticket!.id
      ticketNo = ticket!.ticketNo

      adminId = await userIdFor('alarm-admin@example.org')
      otherId = await userIdFor('alarm-other@example.org')

      // The admin holds `notification.read_all` over one explicit allow — the
      // key belongs to no default role (§11.16).
      const [permission] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.key, 'notification.read_all'))

      await db
        .insert(userPermissions)
        .values({ userId: adminId, permissionId: permission!.id, effect: 'allow' })

    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('writes a task in the mailbox of the administration without a confirmed channel', async () => {
      await enqueuePersonalDeliveries(db, [
        {
          userId: otherId,
          channel: 'ntfy',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
      ])

      // No channel is configured — the delivery ends `FAILED` and the alarm
      // writes the task into the mailbox of the administration (ADR-0062).
      await drainOutbox(db, envOf())

      const tasks = await tasksOf()

      expect(tasks.length).toBe(1)
      expect(tasks[0]?.userId).toBe(adminId)
      expect(tasks[0]?.params).toMatchObject({ channel: 'ntfy' })
      expect(tasks[0]?.readAt).toBeNull()
    })

    it('throttles the alarm to one task per channel and machine code per hour', async () => {
      await enqueuePersonalDeliveries(db, [
        {
          userId: otherId,
          channel: 'ntfy',
          eventType: 'ticket.assigned',
          title: ticketNo,
          body: 'normal · Rathaus',
          ticketId,
          target: { ticketNo, priority: 'normal', objectName: 'Rathaus' },
        },
      ])

      await drainOutbox(db, envOf())

      const tasks = await tasksOf()

      // The second failure of the same channel with the same machine code
      // writes no second task — a broken channel must not flood the inbox.
      expect(tasks.length).toBe(1)
    })

    it('writes no outbox row of its own — the alarm never alarms itself', async () => {
      await drainOutbox(db, envOf())

      const rows = await db
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .where(eq(schema.outbox.eventType, DELIVERY_FAILURE_EVENT))

      // The task lives in the mailbox only (ADR-0062): the alarm enqueues no
      // delivery and can therefore never alarm itself.
      expect(rows.length).toBe(0)
    })
  },
)
