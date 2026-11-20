import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { createInternalTicket } from '../internal'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal photos integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'internal ticket creation photos (WP-M2-100)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    // Small enough to build an oversized photo, large enough for the fixtures.
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

    const dataUrl = (mime: string, bytes: Buffer) =>
      `data:${mime};base64,${bytes.toString('base64')}`

    // The uploads volume of this test run — never `/data`, only the temp directory.
    let uploadDir = ''

    let actorUserId = ''
    let objectId = ''

    beforeAll(async () => {
      uploadDir = await mkdtemp(join(tmpdir(), 'stoerdesk-internal-photos-test-'))
      await migrate(db, { migrationsFolder })

      const [actor] = await db
        .insert(schema.users)
        .values({
          email: `photo-actor-${crypto.randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: schema.users.id })
      actorUserId = actor?.id ?? ''

      const [object] = await db
        .insert(schema.objects)
        .values({
          objectNo: `IP-${crypto.randomUUID().slice(0, 6)}`,
          name: 'Internal photos probe',
        })
        .returning({ id: schema.objects.id })
      objectId = object?.id ?? ''
    })

    afterAll(async () => {
      await rm(uploadDir, { recursive: true, force: true })
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function createTicket(
      photos: string[],
      input: Partial<Parameters<typeof createInternalTicket>[1]> = {},
    ) {
      return createInternalTicket(
        db,
        {
          objectId,
          title: undefined,
          description: undefined,
          priority: 'normal',
          faultTemplateKeys: [],
          photos,
          ...input,
        },
        actorUserId,
        { uploadDir, maxPhotoBytes: TEST_MAX_PHOTO_BYTES },
      )
    }

    async function photoRowsOf(ticketId: string) {
      return db
        .select()
        .from(schema.ticketPhotos)
        .where(eq(schema.ticketPhotos.ticketId, ticketId))
    }

    it('stores the photos of an internal ticket on the uploads volume', async () => {
      const created = await createTicket([
        dataUrl('image/png', PNG_1X1),
        dataUrl('image/jpeg', JPEG_1X1),
      ])

      const rows = await photoRowsOf(created.ticketId)
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.mimeType).sort()).toEqual([
        'image/jpeg',
        'image/png',
      ])
      expect(rows.every((row) => row.sizeBytes > 0)).toBe(true)
      expect(rows.every((row) => row.filePath.startsWith(`tickets/${created.ticketId}/`))).toBe(
        true,
      )
    })

    it('rejects a photo whose bytes disagree with the claim and stores nothing', async () => {
      const before = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      await expect(
        createTicket([dataUrl('image/jpeg', PNG_1X1)]),
      ).rejects.toMatchObject({ statusCode: 422, code: 'photo_type_unsupported' })
      const after = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      expect(after).toHaveLength(before.length)
    })

    it('answers 422 photo_limit_exceeded for a seventh photo', async () => {
      const before = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      const photos = Array.from({ length: 7 }, () => dataUrl('image/jpeg', JPEG_1X1))

      await expect(createTicket(photos)).rejects.toMatchObject({
        statusCode: 422,
        code: 'photo_limit_exceeded',
      })
      const after = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      expect(after).toHaveLength(before.length)
    })

    it('answers 422 photo_too_large for a photo above UPLOAD_MAX_BYTES', async () => {
      const before = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      const oversized = Buffer.alloc(TEST_MAX_PHOTO_BYTES + 1)

      await expect(
        createTicket([dataUrl('image/png', oversized)]),
      ).rejects.toMatchObject({ statusCode: 422, code: 'photo_too_large' })
      const after = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.objectId, objectId))
      expect(after).toHaveLength(before.length)
    })

    it('creates a ticket without photos when none are given', async () => {
      const created = await createTicket([])
      const rows = await photoRowsOf(created.ticketId)
      expect(rows).toHaveLength(0)
    })
  },
)
