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
 * The public view of an open ticket of an object and the comment of the object
 * (`specs/06-report-form.md` §7.10, ADR-0061).
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped object ticket integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets } = schema

type ErrorBody = { code?: string; params?: Record<string, unknown> }
type TicketBody = {
  ticketNo?: string
  status?: string
  reportedAt?: string
  deadlineAt?: string
  events?: { type: string; at: string }[]
  comments?: { at: string; text: string; faultTemplateKeys: string[] }[]
}
type CommentBody = { ticketNo?: string; at?: string }

let nextTestIpIndex = 0
const nextTestIp = () => {
  nextTestIpIndex += 1

  return `10.88.${Math.floor(nextTestIpIndex / 256) % 256}.${nextTestIpIndex % 256}`
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the public view of an open ticket of an object (integration)',
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

    const view = (token: string, ticketNo: string) =>
      app.inject({ method: 'GET', url: `/api/v1/public/objects/${token}/tickets/${ticketNo}` })

    const comment = (token: string, ticketNo: string, payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/public/objects/${token}/tickets/${ticketNo}/comments`,
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

    it('shows the number, the status, the times and the public events', async () => {
      const object = await createObject('7301_01')
      const ticket = await createTicket(object.id, {
        status: 'IN_REVIEW',
        description: 'Der Aufzug bleibt im zweiten Stock stehen.',
        reporterName: 'Max Mustermann',
        reporterPhone: '030 1234567',
      })

      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'created',
        actorKind: 'public',
        payload: { source: 'qr' },
      })
      await db.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'internal_comment',
        actorKind: 'user',
        payload: { text: 'Nur für das Haus.' },
      })

      const response = await view(object.qrToken ?? '', ticket.ticketNo)
      const body = response.json<TicketBody>()

      expect(response.statusCode).toBe(200)
      expect(body.ticketNo).toBe(ticket.ticketNo)
      expect(body.status).toBe('IN_REVIEW')
      expect(body.reportedAt).toBe(ticket.reportedAt.toISOString())
      expect(body.deadlineAt).toBe(ticket.deadlineAt.toISOString())
      expect(body.events?.map((event) => event.type)).toEqual(['created'])
      // The view never carries the description or the contact of the reporter.
      expect(JSON.stringify(body)).not.toContain('Aufzug')
      expect(JSON.stringify(body)).not.toContain('Mustermann')
      expect(JSON.stringify(body)).not.toContain('Nur für das Haus')
    })

    it('refuses a closed ticket, a foreign ticket and an unknown number', async () => {
      const object = await createObject('7302_01')
      const other = await createObject('7303_01')
      const closed = await createTicket(object.id, { status: 'CLOSED' })
      const foreign = await createTicket(other.id, { status: 'NEW' })

      for (const ticketNo of [closed.ticketNo, foreign.ticketNo, 'ST-9999']) {
        const response = await view(object.qrToken ?? '', ticketNo)

        expect(response.statusCode).toBe(404)
        expect(response.json<ErrorBody>().code).toBe('ticket_not_found')
      }
    })

    it('writes the comment of the object as an append-only event', async () => {
      const object = await createObject('7304_01')
      const ticket = await createTicket(object.id, { status: 'NEW' })

      const response = await comment(object.qrToken ?? '', ticket.ticketNo, {
        qrToken: object.qrToken ?? '',
        clientUuid: '11111111-1111-4111-8111-111111111111',
        text: 'Der Aufzug steht noch still.',
        contact: { name: 'Erika Beispiel', phone: '030 7654321' },
        locale: 'de',
      })
      const body = response.json<CommentBody>()

      expect(response.statusCode).toBe(201)
      expect(body.ticketNo).toBe(ticket.ticketNo)

      const events = await eventsOf(ticket.id)
      const written = events.filter((event) => event.type === 'comment')

      expect(written).toHaveLength(1)
      expect(written[0]?.actorKind).toBe('public')
      expect(written[0]?.payload).toMatchObject({ source: 'object_qr', text: 'Der Aufzug steht noch still.' })

      // The public view shows the text — but never the contact of the author.
      const viewResponse = await view(object.qrToken ?? '', ticket.ticketNo)
      const viewBody = viewResponse.json<TicketBody>()

      expect(viewBody.comments?.map((entry) => entry.text)).toEqual(['Der Aufzug steht noch still.'])
      expect(JSON.stringify(viewBody)).not.toContain('Erika Beispiel')
      expect(JSON.stringify(viewBody)).not.toContain('7654321')
    })

    it('keeps the comment idempotent over the client UUID', async () => {
      const object = await createObject('7305_01')
      const ticket = await createTicket(object.id, { status: 'NEW' })
      const payload = {
        qrToken: object.qrToken ?? '',
        clientUuid: '22222222-2222-4222-8222-222222222222',
        text: 'Noch immer kein Aufzug.',
      }

      const first = await comment(object.qrToken ?? '', ticket.ticketNo, payload)
      const second = await comment(object.qrToken ?? '', ticket.ticketNo, payload)

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(201)

      const events = await eventsOf(ticket.id)

      expect(events.filter((event) => event.type === 'comment')).toHaveLength(1)
    })

    it('refuses a comment without text and answers 404 for an unknown token', async () => {
      const object = await createObject('7306_01')
      const ticket = await createTicket(object.id, { status: 'NEW' })

      const empty = await comment(object.qrToken ?? '', ticket.ticketNo, {
        qrToken: object.qrToken ?? '',
        clientUuid: '33333333-3333-4333-8333-333333333333',
      })

      expect(empty.statusCode).toBe(422)
      expect(empty.json<ErrorBody>().code).toBe('comment_text_required')

      const unknownToken = await view('unknownTokenXXXXXXXXXX', ticket.ticketNo)

      expect(unknownToken.statusCode).toBe(404)
      expect(unknownToken.json<ErrorBody>().code).toBe('qr_token_not_found')
    })
  },
)
