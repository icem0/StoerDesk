import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { answerAssignment, assignTicket } from '../assignment'
import { transitionTicket } from '../workflow'

/**
 * The target of the assignment (`specs/07-escalation.md` §7.14, ADR-0057,
 * WP-M32-02): the assignment names a readiness pool, a user group or one
 * technician; the members of that target are the list the refusal walks.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assignment target integration: ${testDatabase.reason}\n`)
}

const { groups, objects, oncallPools, tickets, userGroups, users } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the target of the assignment (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let officeUserId = ''
    let alphaId = ''
    let betaId = ''
    let gammaId = ''
    let groupId = ''
    let poolId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const inserted = await db
        .insert(users)
        .values([
          {
            email: `target-office-${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            givenName: 'Office',
            familyName: 'Target',
          },
          {
            email: `target-alpha-${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            givenName: 'Alpha',
            familyName: 'Technician',
          },
          {
            email: `target-beta-${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            givenName: 'Beta',
            familyName: 'Technician',
          },
          {
            email: `target-gamma-${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            givenName: 'Gamma',
            familyName: 'Technician',
          },
        ])
        .returning({ id: users.id })

      officeUserId = onlyRow(inserted.slice(0, 1), 'office user').id
      alphaId = onlyRow(inserted.slice(1, 2), 'alpha').id
      betaId = onlyRow(inserted.slice(2, 3), 'beta').id
      gammaId = onlyRow(inserted.slice(3, 4), 'gamma').id

      const [group] = await db
        .insert(groups)
        .values({ name: `Target group ${randomUUID().slice(0, 6)}` })
        .returning({ id: groups.id })

      groupId = group?.id ?? ''

      await db.insert(userGroups).values([
        { userId: alphaId, groupId },
        { userId: betaId, groupId },
      ])

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Target pool ${randomUUID().slice(0, 6)}`, groupId })
        .returning({ id: oncallPools.id })

      poolId = pool?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function openWorkOrderTicket(): Promise<string> {
      const [object] = await db
        .insert(objects)
        .values({ objectNo: `A-${randomUUID().slice(0, 6)}`, name: 'Target probe' })
        .returning({ id: objects.id })
      const now = new Date()
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'NEW',
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        })
        .returning({ id: tickets.id })

      const id = ticket?.id ?? ''
      await transitionTicket({
        database: db,
        ticketId: id,
        event: 'review_started',
        actorUserId: officeUserId,
      })
      await transitionTicket({
        database: db,
        ticketId: id,
        event: 'work_order_set',
        actorUserId: officeUserId,
        payload: { text: 'AA 4711' },
      })

      return id
    }

    async function stateOf(ticketId: string) {
      const [row] = await db
        .select({
          assignedUserId: tickets.assignedUserId,
          assignmentStatus: tickets.assignmentStatus,
          assignmentTargetKind: tickets.assignmentTargetKind,
          assignmentTargetId: tickets.assignmentTargetId,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1)

      return row
    }

    it('hands the ticket to the first member of the group and stores the target', async () => {
      const ticketId = await openWorkOrderTicket()

      const result = await assignTicket(db, {
        ticketId,
        target: { kind: 'group', id: groupId },
        acceptance: true,
        assignedBy: officeUserId,
      })

      // The members are ordered by name — Alpha before Beta.
      expect(result.assignedUserId).toBe(alphaId)
      expect(result.assignmentStatus).toBe('offered')

      const state = await stateOf(ticketId)
      expect(state?.assignmentTargetKind).toBe('group')
      expect(state?.assignmentTargetId).toBe(groupId)
    })

    it('hands the ticket to the first member of the readiness pool', async () => {
      const ticketId = await openWorkOrderTicket()

      const result = await assignTicket(db, {
        ticketId,
        target: { kind: 'pool', id: poolId },
        acceptance: true,
        assignedBy: officeUserId,
      })

      expect(result.assignedUserId).toBe(alphaId)
    })

    it('passes a refusal to the next member of the target', async () => {
      const ticketId = await openWorkOrderTicket()
      await assignTicket(db, {
        ticketId,
        target: { kind: 'group', id: groupId },
        acceptance: true,
        assignedBy: officeUserId,
      })

      const result = await answerAssignment(db, {
        ticketId,
        actorUserId: alphaId,
        answer: 'declined',
      })

      expect(result.assignmentStatus).toBe('offered')
      expect(result.assignedUserId).toBe(betaId)

      const state = await stateOf(ticketId)
      expect(state?.assignmentTargetKind).toBe('group')
    })

    it('keeps the refusal when the target has no further member', async () => {
      const ticketId = await openWorkOrderTicket()
      await assignTicket(db, {
        ticketId,
        target: { kind: 'group', id: groupId },
        acceptance: true,
        assignedBy: officeUserId,
      })

      await answerAssignment(db, { ticketId, actorUserId: alphaId, answer: 'declined' })

      const result = await answerAssignment(db, {
        ticketId,
        actorUserId: betaId,
        answer: 'declined',
      })

      expect(result.assignmentStatus).toBe('declined')
      expect(result.assignedUserId).toBe(betaId)
    })

    it('gives a target of the kind user no successor', async () => {
      const ticketId = await openWorkOrderTicket()
      await assignTicket(db, {
        ticketId,
        target: { kind: 'user', id: gammaId },
        acceptance: true,
        assignedBy: officeUserId,
      })

      const result = await answerAssignment(db, {
        ticketId,
        actorUserId: gammaId,
        answer: 'declined',
      })

      expect(result.assignmentStatus).toBe('declined')
      expect(result.assignedUserId).toBe(gammaId)
    })

    it('refuses a target without a member', async () => {
      const ticketId = await openWorkOrderTicket()

      await expect(
        assignTicket(db, {
          ticketId,
          target: { kind: 'group', id: randomUUID() },
          acceptance: true,
          assignedBy: officeUserId,
        }),
      ).rejects.toMatchObject({ code: 'assign_target_empty' })
    })
  },
)
