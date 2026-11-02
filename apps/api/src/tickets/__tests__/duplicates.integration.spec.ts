import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { generateQrToken } from '../../objects/qr'

/**
 * The duplicate hint of the public report path (`specs/06-report-form.md` §7.8,
 * WP-M2-08): the open tickets of an object and the public comment on them.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped duplicate hint integration: ${testDatabase.reason}\n`)
}

const { objects, systems, ticketEvents, tickets } = schema

type ErrorBody = { code?: string; params?: Record<string, unknown> }
type OpenTicketsBody = {
  tickets?: { ticketId: string; ticketNo: string; status: string; reportedAt: string }[]
}
type CommentBody = { ticketNo?: string; at?: string }

/** The spam counter counts per IP inside a 10-minute window (WP-M2-07). */
let nextTestIpIndex = 0
const nextTestIp = () => {
  nextTestIpIndex += 1

  return `10.77.${Math.floor(nextTestIpIndex / 256) % 256}.${nextTestIpIndex % 256}`
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'duplicate hint of the public report path (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance

    function onlyRow<T>(rows: (T | undefined)[], what: string): T {
      const [row] = rows

      if (!row) {
        throw new Error(`expected one ${what}`)
      }

      return row
    }

    const openTickets = (query: Record<string, string>) =>
      app.inject({ method: 'GET', url: `/api/v1/public/tickets/open?${new URLSearchParams(query)}` })

    const comment = (ticketNo: string, payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/public/tickets/${ticketNo}/comments`,
        payload,
      })

    const report = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/public/tickets',
        payload,
        remoteAddress: nextTestIp(),
      })

    async function createObject(objectNo: string) {
      const inserted = await db
        .insert(objects)
        .values({
          objectNo,
          name: `Melde-Objekt ${objectNo}`,
          city: 'Musterstadt',
          qrToken: generateQrToken(),
          active: true,
        })
        .returning()

      return onlyRow(inserted, `object ${objectNo}`)
    }

    async function createSystem(objectId: string, label: string) {
      const inserted = await db
        .insert(systems)
        .values({ objectId, type: 'BMA', label })
        .returning()

      return onlyRow(inserted, `system ${label}`)
    }

    async function createTicket(
      objectId: string,
      overrides: Partial<typeof tickets.$inferInsert> = {},
    ) {
      const reportedAt = overrides.reportedAt ?? new Date()

      const inserted = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'NEW',
          reportedAt,
          receivedAt: reportedAt,
          deadlineAt: new Date(reportedAt.getTime() + 72 * 60 * 60 * 1000),
          ...overrides,
        })
        .returning()

      return onlyRow(inserted, 'ticket')
    }

    async function eventsOf(ticketId: string) {
      return db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId))
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('lists the open tickets of the object, oldest first', async () => {
      const object = await createObject('7201_01')
      const system = await createSystem(object.id, 'BMA Mitte')
      const other = await createObject('7202_01')

      const first = await createTicket(object.id, {
        systemId: system.id,
        status: 'NEW',
        reportedAt: new Date('2026-11-01T08:00:00.000Z'),
      })
      const second = await createTicket(object.id, {
        status: 'IN_REVIEW',
        reportedAt: new Date('2026-11-01T09:00:00.000Z'),
      })
      // A closed ticket and a suspected spam report never appear in the hint.
      await createTicket(object.id, {
        systemId: system.id,
        status: 'CLOSED',
        reportedAt: new Date('2026-11-01T10:00:00.000Z'),
      })
      await createTicket(object.id, {
        systemId: system.id,
        status: 'NEW',
        suspectedSpam: true,
        reportedAt: new Date('2026-11-01T11:00:00.000Z'),
      })
      // A ticket of another object never appears either.
      await createTicket(other.id, { status: 'NEW' })

      const response = await openTickets({ qrToken: object.qrToken ?? '' })
      const body = response.json<OpenTicketsBody>()

      expect(response.statusCode).toBe(200)
      expect(body.tickets?.map((ticket) => ticket.ticketNo)).toEqual([
        first.ticketNo,
        second.ticketNo,
      ])
      expect(body.tickets?.[0]?.status).toBe('NEW')
      // The hint never carries a description, a contact or a status token.
      expect(Object.keys(body.tickets?.[0] ?? {}).sort()).toEqual([
        'reportedAt',
        'status',
        'ticketId',
        'ticketNo',
      ])
    })

    it('narrows the answer to the chosen system and keeps the tickets without one', async () => {
      const object = await createObject('7203_01')
      const first = await createSystem(object.id, 'BMA Mitte')
      const second = await createSystem(object.id, 'BMA Keller')

      const withSystem = await createTicket(object.id, { systemId: first.id })
      const withoutSystem = await createTicket(object.id, {})
      const otherSystem = await createTicket(object.id, { systemId: second.id })

      const response = await openTickets({
        qrToken: object.qrToken ?? '',
        systemId: first.id,
      })
      const body = response.json<OpenTicketsBody>()

      expect(body.tickets?.map((ticket) => ticket.ticketNo)).toEqual([
        withSystem.ticketNo,
        withoutSystem.ticketNo,
      ])
      expect(body.tickets?.map((ticket) => ticket.ticketNo)).not.toContain(otherSystem.ticketNo)
    })

    it('answers 404 for an unknown token and 422 for a foreign system', async () => {
      const object = await createObject('7204_01')
      const foreign = await createObject('7205_01')
      const foreignSystem = await createSystem(foreign.id, 'BMA der anderen Anlage')

      const unknownToken = await openTickets({ qrToken: 'unknownTokenXXXXXXXXXX' })

      expect(unknownToken.statusCode).toBe(404)
      expect(unknownToken.json<ErrorBody>().code).toBe('qr_token_not_found')

      const foreignSystemResponse = await openTickets({
        qrToken: object.qrToken ?? '',
        systemId: foreignSystem.id,
      })

      expect(foreignSystemResponse.statusCode).toBe(422)
      expect(foreignSystemResponse.json<ErrorBody>().code).toBe('system_not_found')
    })

    it('writes one comment event on the open ticket', async () => {
      const object = await createObject('7206_01')
      const ticket = await createTicket(object.id, { status: 'ASSIGNED' })

      const response = await comment(ticket.ticketNo, {
        qrToken: object.qrToken ?? '',
        text: 'Die Störung besteht weiterhin.',
        locale: 'de',
        contact: { phone: '030 123456' },
      })
      const body = response.json<CommentBody>()

      expect(response.statusCode).toBe(201)
      expect(body.ticketNo).toBe(ticket.ticketNo)
      expect(body.at).toBeDefined()

      const events = await eventsOf(ticket.id)
      const comment_ = events.find((event) => event.type === 'comment')

      expect(events).toHaveLength(1)
      expect(comment_?.actorKind).toBe('public')
      expect(comment_?.actorUserId).toBeNull()
      expect(comment_?.payload).toEqual({
        source: 'duplicate_hint',
        locale: 'de',
        text: 'Die Störung besteht weiterhin.',
        faultTemplateKeys: [],
        contact: { phone: '030 123456' },
      })
    })

    it('rejects a comment on an unknown, a foreign and a closed ticket', async () => {
      const object = await createObject('7207_01')
      const other = await createObject('7208_01')
      const foreign = await createTicket(other.id, { status: 'NEW' })
      const closed = await createTicket(object.id, { status: 'CLOSED' })

      const unknown = await comment('ST-1970-0001', {
        qrToken: object.qrToken ?? '',
        text: 'Text',
      })
      const foreignResponse = await comment(foreign.ticketNo, {
        qrToken: object.qrToken ?? '',
        text: 'Text',
      })
      const closedResponse = await comment(closed.ticketNo, {
        qrToken: object.qrToken ?? '',
        text: 'Text',
      })
      const unknownToken = await comment(foreign.ticketNo, {
        qrToken: 'unknownTokenXXXXXXXXXX',
        text: 'Text',
      })

      expect(unknown.statusCode).toBe(404)
      expect(unknown.json<ErrorBody>().code).toBe('ticket_not_found')
      expect(foreignResponse.statusCode).toBe(422)
      expect(foreignResponse.json<ErrorBody>().code).toBe('ticket_object_mismatch')
      expect(closedResponse.statusCode).toBe(422)
      expect(closedResponse.json<ErrorBody>().code).toBe('ticket_closed')
      expect(unknownToken.statusCode).toBe(404)
      expect(unknownToken.json<ErrorBody>().code).toBe('qr_token_not_found')
    })

    it('requires a text or a fault key for a comment', async () => {
      const object = await createObject('7209_01')
      const ticket = await createTicket(object.id, { status: 'NEW' })

      const response = await comment(ticket.ticketNo, { qrToken: object.qrToken ?? '' })

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorBody>().code).toBe('comment_text_required')
      expect(await eventsOf(ticket.id)).toHaveLength(0)
    })

    it('stores the open ticket as the parent of a new report', async () => {
      const object = await createObject('7210_01')
      const parent = await createTicket(object.id, { status: 'NEW' })
      const clientUuid = crypto.randomUUID()

      const response = await report({
        qrToken: object.qrToken ?? '',
        clientUuid,
        text: 'Meldung trotzdem neu',
        contact: { phone: '030 123456' },
        parentTicketId: parent.id,
      })

      expect(response.statusCode).toBe(201)

      const [stored] = await db.select().from(tickets).where(eq(tickets.clientUuid, clientUuid))

      expect(stored?.parentTicketId).toBe(parent.id)
    })

    it('rejects a foreign parent and ignores a parent that was closed meanwhile', async () => {
      const object = await createObject('7211_01')
      const other = await createObject('7212_01')
      const foreign = await createTicket(other.id, { status: 'NEW' })
      const closed = await createTicket(object.id, { status: 'CLOSED' })

      const foreignResponse = await report({
        qrToken: object.qrToken ?? '',
        clientUuid: crypto.randomUUID(),
        text: 'Meldung mit fremdem Bezug',
        contact: { phone: '030 123456' },
        parentTicketId: foreign.id,
      })

      expect(foreignResponse.statusCode).toBe(422)
      expect(foreignResponse.json<ErrorBody>().code).toBe('duplicate_parent_invalid')

      const clientUuid = crypto.randomUUID()
      const closedResponse = await report({
        qrToken: object.qrToken ?? '',
        clientUuid,
        text: 'Meldung mit geschlossenem Bezug',
        contact: { phone: '030 123456' },
        parentTicketId: closed.id,
      })

      expect(closedResponse.statusCode).toBe(201)

      const [stored] = await db.select().from(tickets).where(eq(tickets.clientUuid, clientUuid))

      expect(stored?.parentTicketId).toBeNull()
    })
  },
)
