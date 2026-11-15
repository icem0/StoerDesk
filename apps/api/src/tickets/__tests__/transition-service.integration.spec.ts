import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { readTicketTransitions, resolveTransition } from '../transition-service'

/**
 * The transition service of WP-M14-38b (`specs/07-escalation.md` §7.13, ADR-0025):
 * `readTicketTransitions` answers the rows of `ticket_transitions` — active and
 * inactive — in a stable order, and the pure `resolveTransition` finds the step
 * of a `(status, event)` pair or nothing when no **active** row performs it. The
 * rows are the 22 seeded steps of `PLAN.md` §7, so the workflow of a migrated
 * instance is the documented one.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped transition service integration: ${testDatabase.reason}\n`)
}

const { ticketTransitions } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'ticket transition service (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('reads the 22 steps of the seeded workflow ordered by status and event', async () => {
      const transitions = await readTicketTransitions(db)

      expect(transitions).toHaveLength(22)

      const ordered = [...transitions].sort((a, b) =>
        a.fromStatus === b.fromStatus
          ? a.eventKey.localeCompare(b.eventKey)
          : a.fromStatus.localeCompare(b.fromStatus),
      )

      expect(transitions.map((row) => `${row.fromStatus}/${row.eventKey}`)).toEqual(
        ordered.map((row) => `${row.fromStatus}/${row.eventKey}`),
      )
    })

    it('carries one cancelled step per status, the expanded wildcard of §7.13', async () => {
      const transitions = await readTicketTransitions(db)

      expect(transitions.filter((row) => row.eventKey === 'cancelled')).toHaveLength(9)
    })

    it('resolves the step a status performs through an event', async () => {
      const transitions = await readTicketTransitions(db)
      const step = resolveTransition(transitions, 'NEW', 'review_started')

      expect(step?.fromStatus).toBe('NEW')
      expect(step?.toStatus).toBe('IN_REVIEW')
      expect(step?.eventKey).toBe('review_started')
      expect(step?.active).toBe(true)
      expect(step?.condition).toBeNull()
    })

    it('resolves nothing for an event that has no row', async () => {
      const transitions = await readTicketTransitions(db)

      expect(resolveTransition(transitions, 'NEW', 'closed')).toBeUndefined()
    })

    it('resolves nothing for a deactivated row', async () => {
      await db
        .update(ticketTransitions)
        .set({ active: false })
        .where(
          and(
            eq(ticketTransitions.fromStatus, 'NEW'),
            eq(ticketTransitions.eventKey, 'review_started'),
          ),
        )

      const transitions = await readTicketTransitions(db)

      expect(transitions).toHaveLength(22)
      expect(resolveTransition(transitions, 'NEW', 'review_started')).toBeUndefined()
    })
  },
)
