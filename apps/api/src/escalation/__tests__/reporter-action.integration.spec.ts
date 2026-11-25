import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_ESCALATION_RULES } from '@stoerdesk/shared'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { evaluateTicketEscalations } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped reporter action integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, outbox } = schema
const MINUTE = 60 * 1000
const now = new Date('2026-11-05T12:00:00.000Z')

function seededRuleKey(stageKey: string): string {
  const rule = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.stageKey === stageKey)

  if (rule === undefined) {
    throw new Error(`expected the seeded rule of the stage ${stageKey}`)
  }

  return rule.key
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the action that informs the reporter (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let objectId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `REP-${randomUUID().slice(0, 6)}`, name: 'Melder EG' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      await db.insert(schema.escalationActions).values({
        key: 'reporter_mail',
        ruleKey: seededRuleKey('review'),
        type: 'notify_reporter',
        config: {},
        condition: { all: [] },
        position: 0,
        active: true,
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function createTicket(values: {
      reporterEmail?: string
      optIn: boolean
    }): Promise<string> {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          priority: 'critical',
          reporterEmail: values.reporterEmail ?? null,
          customerEmailNotifications: values.optIn,
          reportedAt: new Date(now.getTime() - 30 * MINUTE),
          receivedAt: new Date(now.getTime() - 30 * MINUTE),
          deadlineAt: new Date(now.getTime() + 42 * MINUTE),
        })
        .returning({ id: tickets.id })

      return ticket!.id
    }

    it('writes the mail to the reporter when he agreed to it', async () => {
      const ticketId = await createTicket({
        reporterEmail: 'reporter@example.org',
        optIn: true,
      })

      await evaluateTicketEscalations(db, ticketId, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticketId))

      const reporterRows = rows.filter((row) => row.eventType === 'ticket.reporter')

      expect(reporterRows).toHaveLength(1)
      expect(reporterRows[0]?.channel).toBe('email')
      const target = reporterRows[0]?.target as { recipientTarget?: string }

      expect(target?.recipientTarget).toBe('reporter@example.org')
    })

    it('writes nothing when the reporter did not agree to it', async () => {
      const ticketId = await createTicket({
        reporterEmail: 'reporter@example.org',
        optIn: false,
      })

      await evaluateTicketEscalations(db, ticketId, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticketId))

      expect(rows.filter((row) => row.eventType === 'ticket.reporter')).toHaveLength(0)
    })

    it('writes nothing when the reporter left no address', async () => {
      const ticketId = await createTicket({ optIn: true })

      await evaluateTicketEscalations(db, ticketId, now)

      const rows = await db.select().from(outbox).where(eq(outbox.ticketId, ticketId))

      expect(rows.filter((row) => row.eventType === 'ticket.reporter')).toHaveLength(0)
    })
  },
)
