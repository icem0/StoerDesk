import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { applyInternalAction } from '../internal-actions'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal actions: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets, users, internalActionReceipts } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'applyInternalAction (idempotent internal action helper)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let actorId: string
    let foreignActorId: string
    let objectId: string
    let ackTicketNo: string
    let ackReplayTicketNo: string
    let foreignTicketNo: string
    let commentTicketNo: string
    let newTicketNo: string

    const now = new Date('2026-10-31T09:00:00.000Z')
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000)

    const insertTicket = async (status: string) => {
      const ticket = onlyRow(
        await db
          .insert(tickets)
          .values({
            objectId,
            status,
            priority: 'normal',
            source: 'INTERNAL',
            reportedAt: now,
            receivedAt: now,
            deadlineAt: deadline,
          })
          .returning({ ticketNo: tickets.ticketNo }),
        'ticket',
      )

      return ticket.ticketNo
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const actor = onlyRow(
        await db
          .insert(users)
          .values({ email: 'actor@example.de', passwordHash: 'x', locale: 'de' })
          .returning({ id: users.id }),
        'user',
      )
      actorId = actor.id

      const foreign = onlyRow(
        await db
          .insert(users)
          .values({ email: 'foreign@example.de', passwordHash: 'x', locale: 'de' })
          .returning({ id: users.id }),
        'user',
      )
      foreignActorId = foreign.id

      const object = onlyRow(
        await db
          .insert(objects)
          .values({ objectNo: '7201_01', name: 'Rathaus', city: 'Musterstadt' })
          .returning({ id: objects.id }),
        'object',
      )
      objectId = object.id

      ackTicketNo = await insertTicket('ACCEPTED')
      ackReplayTicketNo = await insertTicket('ACCEPTED')
      foreignTicketNo = await insertTicket('ACCEPTED')
      commentTicketNo = await insertTicket('ACCEPTED')
      newTicketNo = await insertTicket('NEW')
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('writes the acknowledged event and a receipt on first execution', async () => {
      const clientUuid = 'client-ack-1'

      const result = await applyInternalAction({
        database: db,
        ticketNo: ackTicketNo,
        clientUuid,
        action: 'acknowledge',
        actorUserId: actorId,
        payload: { result: 'fixed', note: 'Erledigt' },
      })

      expect(result.replayed).toBe(false)
      expect(result.event.type).toBe('acknowledged')
      expect(result.event.actorKind).toBe('user')
      expect(result.event.actorUserId).toBe(actorId)
      expect(result.event.payload).toEqual({ result: 'fixed', note: 'Erledigt' })

      const receipts = await db
        .select()
        .from(internalActionReceipts)
        .where(eq(internalActionReceipts.clientUuid, clientUuid))

      expect(receipts).toHaveLength(1)
      const receipt = onlyRow(receipts, 'receipt')
      expect(receipt.action).toBe('acknowledge')
      expect(receipt.ticketId).toBe(result.ticket.id)
      expect(receipt.eventId).toBe(result.event.id)
      expect(receipt.actorUserId).toBe(actorId)
      expect(receipt.createdAt).toBeInstanceOf(Date)
    })

    it('short-circuits a replay with the same client_uuid and writes no second event', async () => {
      const clientUuid = 'client-replay-1'

      const first = await applyInternalAction({
        database: db,
        ticketNo: ackReplayTicketNo,
        clientUuid,
        action: 'acknowledge',
        actorUserId: actorId,
        payload: {},
      })

      const eventsBefore = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, first.ticket.id))

      const second = await applyInternalAction({
        database: db,
        ticketNo: ackReplayTicketNo,
        clientUuid,
        action: 'acknowledge',
        actorUserId: actorId,
        payload: {},
      })

      expect(second.replayed).toBe(true)
      expect(second.event.id).toBe(first.event.id)
      expect(second.event.type).toBe('acknowledged')

      const eventsAfter = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, second.ticket.id))

      expect(eventsAfter).toHaveLength(eventsBefore.length)
    })

    it('rejects a replay by a different actor with 403', async () => {
      const clientUuid = 'client-foreign-1'

      await applyInternalAction({
        database: db,
        ticketNo: foreignTicketNo,
        clientUuid,
        action: 'acknowledge',
        actorUserId: actorId,
        payload: {},
      })

      await expect(
        applyInternalAction({
          database: db,
          ticketNo: foreignTicketNo,
          clientUuid,
          action: 'comment',
          actorUserId: foreignActorId,
          payload: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'action_actor_mismatch',
        params: { clientUuid, ticketNo: foreignTicketNo },
      })
    })

    it('rejects an invalid transition with 409, `from` in params and no receipt', async () => {
      const clientUuid = 'client-invalid-1'

      // newTicketNo is NEW; acknowledge from NEW is not a valid transition.
      await expect(
        applyInternalAction({
          database: db,
          ticketNo: newTicketNo,
          clientUuid,
          action: 'acknowledge',
          actorUserId: actorId,
          payload: {},
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'invalid_transition',
        params: { ticketNo: newTicketNo, from: 'NEW', event: 'acknowledged' },
      })

      const receipts = await db
        .select()
        .from(internalActionReceipts)
        .where(eq(internalActionReceipts.clientUuid, clientUuid))

      expect(receipts).toHaveLength(0)
    })

    it('leaves tickets.status untouched for a comment', async () => {
      const clientUuid = 'client-comment-1'

      const before = onlyRow(
        await db
          .select({ status: tickets.status })
          .from(tickets)
          .where(eq(tickets.ticketNo, commentTicketNo)),
        'ticket',
      )

      const result = await applyInternalAction({
        database: db,
        ticketNo: commentTicketNo,
        clientUuid,
        action: 'comment',
        actorUserId: actorId,
        payload: { text: 'Notiz' },
      })

      expect(result.replayed).toBe(false)
      expect(result.event.type).toBe('comment')
      expect(result.event.actorKind).toBe('user')
      expect(result.event.actorUserId).toBe(actorId)

      const after = onlyRow(
        await db
          .select({ status: tickets.status })
          .from(tickets)
          .where(eq(tickets.ticketNo, commentTicketNo)),
        'ticket',
      )

      expect(after.status).toBe(before.status)

      const receipts = await db
        .select()
        .from(internalActionReceipts)
        .where(eq(internalActionReceipts.clientUuid, clientUuid))

      expect(receipts).toHaveLength(1)
      const commentReceipt = onlyRow(receipts, 'receipt')
      expect(commentReceipt.action).toBe('comment')
      expect(commentReceipt.eventId).toBe(result.event.id)
    })
  },
)
