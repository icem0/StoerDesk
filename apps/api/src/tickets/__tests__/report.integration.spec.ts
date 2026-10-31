import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
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

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped report integration: ${testDatabase.reason}\n`)
}

const { objects, oldQrTokens, systems, ticketEvents, ticketPhotos, tickets } = schema

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/
const PHOTO_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg)$/

// Small enough to build an oversized photo in the test, large enough for the fixtures.
const TEST_MAX_PHOTO_BYTES = 2048

// Real 1×1 fixtures: the magic bytes are what the server verifies (§7.4).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
)

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`

/** The uploads volume of this test run — never `/data`, only the temp directory. */
const uploadDir = await mkdtemp(join(tmpdir(), 'stoerdesk-upload-test-'))

type ReportBody = {
  ticketId?: string
  ticketNo?: string
  status?: string
  statusToken?: string
  reportedAt?: string
  receivedAt?: string
  deadlineAt?: string
  clockSkewed?: boolean
  photoCount?: number
}
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: (T | undefined)[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'public report endpoint (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance

    const submit = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v1/public/tickets', payload })

    async function createObject(objectNo: string, active = true) {
      const inserted = await db
        .insert(objects)
        .values({
          objectNo,
          name: `Melde-Objekt ${objectNo}`,
          city: 'Musterstadt',
          qrToken: generateQrToken(),
          active,
        })
        .returning()

      return onlyRow(inserted, `object ${objectNo}`)
    }

    async function eventCountOf(ticketId: string): Promise<number> {
      return (await db.select({ id: ticketEvents.id }).from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId)))
        .length
    }

    async function ticketOfClient(clientUuid: string) {
      return onlyRow(await db.select().from(tickets).where(eq(tickets.clientUuid, clientUuid)), 'ticket')
    }

    function photoRowsOf(ticketId: string) {
      return db.select().from(ticketPhotos).where(eq(ticketPhotos.ticketId, ticketId))
    }

    function uploadedFilesOf(ticketId: string): Promise<string[]> {
      return readdir(join(uploadDir, 'tickets', ticketId)).catch(() => [])
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'
      process.env.UPLOAD_DIR = uploadDir
      process.env.UPLOAD_MAX_BYTES = String(TEST_MAX_PHOTO_BYTES)

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })
      await rm(uploadDir, { recursive: true, force: true })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('writes one NEW ticket and one created event', async () => {
      const object = await createObject('7101_01')
      const clientUuid = crypto.randomUUID()

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: '  Die RWA springt nicht an.  ',
        faultTemplateKeys: ['akustik', 'strom'],
        contact: { name: 'Technik', phone: '+49 170 1234567' },
        locale: 'de',
      })
      const body = response.json<ReportBody>()

      expect(response.statusCode).toBe(201)
      expect(body.status).toBe('NEW')
      expect(body.ticketNo).toMatch(
        new RegExp(`^ST-${new Date().getFullYear()}-\\d{4}$`),
      )
      expect(body.statusToken).toMatch(QR_TOKEN_PATTERN)
      expect(body.clockSkewed).toBe(false)
      expect(body.photoCount).toBe(0)

      const deadline = new Date(body.deadlineAt ?? '').getTime()
      const reported = new Date(body.reportedAt ?? '').getTime()

      expect(deadline - reported).toBe(72 * 60 * 60 * 1000)

      const stored = await ticketOfClient(clientUuid)

      expect(stored.status).toBe('NEW')
      expect(stored.source).toBe('QR')
      expect(stored.priority).toBe('normal')
      expect(stored.description).toBe('Die RWA springt nicht an.')
      expect(stored.faultTemplateKeys).toEqual(['akustik', 'strom'])
      expect(stored.objectId).toBe(object.id)
      expect(stored.reporterPhone).toBe('+49 170 1234567')

      const events = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, stored.id))

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe('created')
      expect(events[0]?.actorKind).toBe('public')
      expect(events[0]?.actorUserId).toBeNull()
      expect(events[0]?.payload).toEqual({
        locale: 'de',
        source: 'QR',
        faultTemplateKeys: ['akustik', 'strom'],
        textLength: 25,
      })
    })

    it('answers an idempotent repeat with 200 and the same ticket', async () => {
      const object = await createObject('7102_01')
      const clientUuid = crypto.randomUUID()
      const payload = {
        qrToken: object.qrToken,
        clientUuid,
        text: 'Sprachalarm bleibt stumm',
        contact: { email: 'haus@example.org' },
      }

      const first = await submit(payload)
      const second = await submit({ ...payload, text: 'anderer Text' })

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(200)
      expect(second.json<ReportBody>().ticketNo).toBe(first.json<ReportBody>().ticketNo)

      const stored = await ticketOfClient(clientUuid)

      expect(stored.description).toBe('Sprachalarm bleibt stumm')
      await expect(eventCountOf(stored.id)).resolves.toBe(1)
    })

    it('rejects an unknown, an inactive and a retired token with 404', async () => {
      const inactive = await createObject('7103_01', false)
      const rotated = await createObject('7104_01')
      const retiredToken = rotated.qrToken ?? ''

      await db
        .update(objects)
        .set({ qrToken: generateQrToken() })
        .where(eq(objects.id, rotated.id))
      await db.insert(oldQrTokens).values({
        objectId: rotated.id,
        token: retiredToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })

      for (const qrToken of ['unknownTokenXXXXXXXXXX', retiredToken, inactive.qrToken ?? '']) {
        const response = await submit({
          qrToken,
          clientUuid: crypto.randomUUID(),
          text: 'Test',
          contact: { phone: '112' },
        })
        const body = response.json<ErrorBody>()

        expect(response.statusCode).toBe(404)
        expect(body.code).toBe('qr_token_not_found')
      }
    })

    it('answers the 422 rules of the form', async () => {
      const object = await createObject('7105_01')
      const foreign = await createObject('7106_01')

      const withoutText = await submit({
        qrToken: object.qrToken,
        clientUuid: crypto.randomUUID(),
        contact: { phone: '+49 170 0000000' },
      })
      const withoutContact = await submit({
        qrToken: object.qrToken,
        clientUuid: crypto.randomUUID(),
        text: 'Melder defekt',
        contact: { name: 'Niemand' },
      })
      const foreignSystem = onlyRow(
        await db
          .insert(systems)
          .values({ objectId: foreign.id, type: 'BMA', label: 'BMA der anderen Anlage' })
          .returning({ id: systems.id }),
        'system',
      )
      const wrongSystem = await submit({
        qrToken: object.qrToken,
        clientUuid: crypto.randomUUID(),
        text: 'Melder defekt',
        systemId: foreignSystem.id,
        contact: { phone: '+49 170 0000000' },
      })

      expect(withoutText.json<ErrorBody>().code).toBe('report_text_required')
      expect(withoutContact.json<ErrorBody>().code).toBe('contact_required')
      expect(wrongSystem.json<ErrorBody>().code).toBe('system_not_found')
      expect([
        withoutText.statusCode,
        withoutContact.statusCode,
        wrongSystem.statusCode,
      ]).toEqual([422, 422, 422])
    })

    it('accepts a system of the same object and template keys without free text', async () => {
      const object = await createObject('7107_01')
      const system = onlyRow(
        await db
          .insert(systems)
          .values({ objectId: object.id, type: 'RWA', label: 'RWA Treppenhaus' })
          .returning({ id: systems.id }),
        'system',
      )

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid: crypto.randomUUID(),
        faultTemplateKeys: ['beleuchtung'],
        systemId: system.id,
        contact: { phone: '+49 170 0000000' },
      })

      expect(response.statusCode).toBe(201)
    })

    it('answers 400 for a body outside the schema', async () => {
      const object = await createObject('7108_01')

      const cases = [
        { qrToken: 'short', clientUuid: crypto.randomUUID(), text: 'x', contact: { phone: '1' } },
        { qrToken: object.qrToken, clientUuid: 'no-uuid', text: 'x', contact: { phone: '1' } },
        { qrToken: object.qrToken, text: 'x', contact: { phone: '1' } },
        {
          qrToken: object.qrToken,
          clientUuid: crypto.randomUUID(),
          faultTemplateKeys: ['ok_key', 'ok_key'],
          contact: { phone: '1' },
        },
        {
          qrToken: object.qrToken,
          clientUuid: crypto.randomUUID(),
          text: 'x',
          contact: { email: 'not-an-mail' },
        },
        {
          qrToken: object.qrToken,
          clientUuid: crypto.randomUUID(),
          text: 'x',
          contact: { phone: '1' },
          photos: ['http://example.org/foto.jpg'],
        },
        {
          qrToken: object.qrToken,
          clientUuid: crypto.randomUUID(),
          text: 'x',
          contact: { phone: '1' },
          photos: ['data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='],
        },
      ]

      for (const payload of cases) {
        const response = await submit(payload)

        expect(response.statusCode).toBe(400)
        expect(response.json<ErrorBody>().code).toBe('invalid_request')
      }
    })

    it('keeps the server clock when the device clock is more than 10 minutes off', async () => {
      const object = await createObject('7109_01')
      const clientUuid = crypto.randomUUID()

      const skewed = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: 'Meldepforte schaltet nicht',
        reportedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        contact: { phone: '+49 170 0000000' },
      })
      const body = skewed.json<ReportBody>()

      expect(skewed.statusCode).toBe(201)
      expect(body.clockSkewed).toBe(true)
      expect(body.reportedAt).toBe(body.receivedAt)

      const stored = await ticketOfClient(clientUuid)

      expect(stored.clockSkewed).toBe(true)
      expect(stored.receivedAt.getTime()).toBe(stored.reportedAt.getTime())
      expect(stored.deadlineAt.getTime() - stored.receivedAt.getTime()).toBe(72 * 60 * 60 * 1000)
    })

    it('stores the photos of a report on the uploads volume', async () => {
      const object = await createObject('7110_01')
      const clientUuid = crypto.randomUUID()

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: 'BMA-Melder verschmutzt',
        contact: { phone: '+49 170 0000000' },
        photos: [dataUrl('image/png', PNG_1X1), dataUrl('image/jpeg', JPEG_1X1)],
      })
      const body = response.json<ReportBody>()
      const ticket = await ticketOfClient(clientUuid)
      const rows = await photoRowsOf(ticket.id)
      const mimeTypes = new Map(rows.map((row) => [row.mimeType, row]))
      const png = mimeTypes.get('image/png')
      const jpeg = mimeTypes.get('image/jpeg')

      expect(response.statusCode).toBe(201)
      expect(body.photoCount).toBe(2)
      expect(rows).toHaveLength(2)

      // §4.10: the stored path is relative to UPLOAD_DIR and the name is a UUID.
      expect(png?.filePath).toMatch(new RegExp(`^tickets/${ticket.id}/[0-9a-f-]+\\.png$`))
      expect(png?.sizeBytes).toBe(PNG_1X1.byteLength)
      expect(jpeg?.filePath).toMatch(new RegExp(`^tickets/${ticket.id}/[0-9a-f-]+\\.jpg$`))
      expect(jpeg?.sizeBytes).toBe(JPEG_1X1.byteLength)

      if (!png || !jpeg) {
        throw new Error('expected one PNG and one JPEG row')
      }

      const expected = [basename(png.filePath), basename(jpeg.filePath)].sort()

      expect(await uploadedFilesOf(ticket.id)).toEqual(expected)

      const written = await readFile(join(uploadDir, png.filePath))

      expect([...written]).toEqual([...PNG_1X1])
      expect(written.byteLength).toBe(png.sizeBytes)
    })

    it('rejects a photo whose bytes disagree with the claim and stores nothing', async () => {
      const object = await createObject('7111_01')
      const clientUuid = crypto.randomUUID()

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: 'Lichtruf-Ausfall',
        contact: { phone: '+49 170 0000000' },
        // The first pair is valid, so it may not survive the broken second one.
        photos: [dataUrl('image/jpeg', JPEG_1X1), dataUrl('image/png', JPEG_1X1)],
      })
      const ticket = await ticketOfClient(clientUuid)

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorBody>().code).toBe('photo_type_unsupported')
      expect(await photoRowsOf(ticket.id)).toHaveLength(0)
      expect(await uploadedFilesOf(ticket.id)).toEqual([])
    })

    it('answers 422 photo_limit_exceeded for a seventh photo', async () => {
      const object = await createObject('7112_01')
      const clientUuid = crypto.randomUUID()
      const photos = Array.from({ length: 7 }, () => dataUrl('image/jpeg', JPEG_1X1))

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: 'Sprachalarm sendet nicht',
        contact: { phone: '+49 170 0000000' },
        photos,
      })
      const ticket = await ticketOfClient(clientUuid)

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorBody>().code).toBe('photo_limit_exceeded')
      expect(await photoRowsOf(ticket.id)).toHaveLength(0)
      expect(await uploadedFilesOf(ticket.id)).toEqual([])
    })

    it('answers 422 photo_too_large for a photo above UPLOAD_MAX_BYTES', async () => {
      const object = await createObject('7113_01')
      const clientUuid = crypto.randomUUID()
      const oversized = Buffer.concat([PNG_1X1, Buffer.alloc(TEST_MAX_PHOTO_BYTES)])

      const response = await submit({
        qrToken: object.qrToken,
        clientUuid,
        text: 'RWA Ausfall',
        contact: { phone: '+49 170 0000000' },
        photos: [dataUrl('image/png', oversized)],
      })
      const ticket = await ticketOfClient(clientUuid)

      expect(response.statusCode).toBe(422)
      expect(response.json<ErrorBody>().code).toBe('photo_too_large')
      expect(await photoRowsOf(ticket.id)).toHaveLength(0)
      expect(await uploadedFilesOf(ticket.id)).toEqual([])
    })

    it('ignores the photos of an idempotent repeat', async () => {
      const object = await createObject('7114_01')
      const clientUuid = crypto.randomUUID()
      const payload = {
        qrToken: object.qrToken,
        clientUuid,
        text: 'EMA Störung',
        contact: { phone: '+49 170 0000000' },
        photos: [dataUrl('image/jpeg', JPEG_1X1)],
      }

      const first = await submit(payload)
      const second = await submit({
        ...payload,
        photos: [dataUrl('image/png', PNG_1X1), dataUrl('image/png', PNG_1X1)],
      })
      const ticket = await ticketOfClient(clientUuid)
      const files = await uploadedFilesOf(ticket.id)

      expect(first.statusCode).toBe(201)
      expect(first.json<ReportBody>().photoCount).toBe(1)
      expect(second.statusCode).toBe(200)
      expect(second.json<ReportBody>().photoCount).toBe(1)
      expect(await photoRowsOf(ticket.id)).toHaveLength(1)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(PHOTO_FILE_PATTERN)
    })
  },
)
