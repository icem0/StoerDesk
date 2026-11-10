import { asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import {
  DEFAULT_RETENTION_MONTHS,
  readPrivacyRetentionSettings,
  storePrivacyRetentionSettings,
} from '../../settings/privacy'
import {
  PRIVACY_RETENTION_CRON,
  PRIVACY_RETENTION_QUEUE,
  runPrivacyRetention,
} from '../privacy-retention'

const DAY_MS = 24 * 60 * 60 * 1000

/** Seeding offsets: the 24-month default window is about 730 days. */
const OLD_CLOSED_DAYS = 760
const RECENT_CLOSED_DAYS = 700
const EXPIRED_THROTTLE_DAYS = 31
const EXPIRED_SYNC_RUN_DAYS = 366

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped privacy retention integration: ${testDatabase.reason}\n`)
}

const { bmaSyncRuns, reportThrottle, ticketEvents, ticketPhotos, tickets } = schema

const uploadDir = join(tmpdir(), 'stoerdesk-privacy-retention-test')
const photoVolume = join(uploadDir, 'tickets')

let oldTicketId = ''
let recentTicketId = ''
let openTicketId = ''

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

function rowAt<T>(rows: T[], index: number, what: string): T {
  const row = rows[index]

  if (row === undefined) {
    throw new Error(`expected ${what} at index ${index}`)
  }

  return row
}

const listPhotoFiles = async (ticketId: string) =>
  await readdir(join(photoVolume, ticketId)).catch(() => [])

describe.skipIf(testDatabase.status === 'unavailable')(
  'privacy retention — runPrivacyRetention (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    const now = new Date()

    let objectId = ''

    async function insertTicket(label: string, closedDays: number | null) {
      const inserted = await db
        .insert(tickets)
        .values({
          objectId,
          title: `retention probe ${label}`,
          description: 'privacy retention probe',
          reportedAt: closedDays === null ? now : new Date(now.getTime() - closedDays * DAY_MS),
          deadlineAt: now,
          closedAt: closedDays === null ? null : new Date(now.getTime() - closedDays * DAY_MS),
          reporterName: `Reporter ${label}`,
          reporterPhone: `+49${closedDays ?? 0}`,
          reporterEmail: `${label}@example.org`,
        })
        .returning({ id: tickets.id })

      const row = onlyRow(inserted, 'ticket')

      await db
        .insert(ticketEvents)
        .values({ ticketId: row.id, type: 'created', actorKind: 'system', payload: { label } })

      return row.id
    }

    async function insertPhoto(ticketId: string, name: string, fileExists: boolean) {
      const filePath = join('tickets', ticketId, `${name}.jpg`)

      if (fileExists) {
        await mkdir(join(photoVolume, ticketId), { recursive: true })
        await writeFile(join(uploadDir, filePath), Buffer.from([0xff, 0xd8, 0xff]))
      }

      await db
        .insert(ticketPhotos)
        .values({ ticketId, filePath, mimeType: 'image/jpeg', sizeBytes: 3 })

      return filePath
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const insertedObject = await db
        .insert(schema.objects)
        .values({ objectNo: '9910_01', name: 'retention probe object' })
        .returning({ id: schema.objects.id })

      objectId = onlyRow(insertedObject, 'object').id

      oldTicketId = await insertTicket('old-closed', OLD_CLOSED_DAYS)
      recentTicketId = await insertTicket('recent-closed', RECENT_CLOSED_DAYS)
      openTicketId = await insertTicket('open', null)

      await insertPhoto(oldTicketId, 'kept', true)
      await insertPhoto(oldTicketId, 'missing-file', false)
      await insertPhoto(recentTicketId, 'recent', true)
      await insertPhoto(openTicketId, 'open', true)

      await db.insert(reportThrottle).values([
        {
          ip: '10.0.0.1',
          qrToken: 'expired_throttle_token',
          createdAt: new Date(now.getTime() - EXPIRED_THROTTLE_DAYS * DAY_MS),
        },
        {
          ip: '10.0.0.2',
          qrToken: 'recent_throttle_token',
          createdAt: new Date(now.getTime() - DAY_MS),
        },
      ])

      await db.insert(bmaSyncRuns).values([
        {
          startedAt: new Date(now.getTime() - EXPIRED_SYNC_RUN_DAYS * DAY_MS),
          status: 'SUCCESS',
        },
        { startedAt: new Date(now.getTime() - DAY_MS), status: 'SUCCESS' },
      ])
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      await rm(uploadDir, { recursive: true, force: true })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('anonymises the closed reporter outside the default window and keeps the rest', async () => {
      const run = await runPrivacyRetention(db, { uploadDir, now })

      expect(run).toEqual({
        anonymized: 1,
        photosDeleted: 2,
        throttleDeleted: 1,
        syncRunsDeleted: 1,
      })

      const closedRows = await db
        .select({
          title: tickets.title,
          closedAt: tickets.closedAt,
          reporterName: tickets.reporterName,
          reporterPhone: tickets.reporterPhone,
          reporterEmail: tickets.reporterEmail,
        })
        .from(tickets)
        .where(isNotNull(tickets.closedAt))
        .orderBy(asc(tickets.reportedAt))

      expect(closedRows).toHaveLength(2)

      const oldClosed = rowAt(closedRows, 0, 'old closed ticket')
      const recentClosed = rowAt(closedRows, 1, 'recent closed ticket')

      // The closed ticket outside the window: content and closing time stay, the
      // three contact fields become NULL.
      expect(oldClosed.title).toBe('retention probe old-closed')
      expect(oldClosed.closedAt).toEqual(new Date(now.getTime() - OLD_CLOSED_DAYS * DAY_MS))
      expect([oldClosed.reporterName, oldClosed.reporterPhone, oldClosed.reporterEmail]).toEqual([
        null,
        null,
        null,
      ])

      // The closed ticket inside the window keeps all three fields.
      expect(recentClosed.reporterName).toBe('Reporter recent-closed')
      expect([recentClosed.reporterPhone, recentClosed.reporterEmail]).toEqual([
        `+49${RECENT_CLOSED_DAYS}`,
        'recent-closed@example.org',
      ])

      const openRow = onlyRow(
        await db
          .select({ closedAt: tickets.closedAt, reporterName: tickets.reporterName })
          .from(tickets)
          .where(isNull(tickets.closedAt)),
        'open ticket',
      )

      expect(openRow.closedAt).toBeNull()
      expect(openRow.reporterName).toBe('Reporter open')

      const events = await db.select({ payload: ticketEvents.payload }).from(ticketEvents)

      // The append-only trail keeps its rows and its payloads untouched.
      expect(events).toHaveLength(3)
      expect(events.map((row) => JSON.stringify(row.payload)).sort()).toEqual([
        '{"label":"old-closed"}',
        '{"label":"open"}',
        '{"label":"recent-closed"}',
      ])
    })

    it('deletes the expired photo rows and tolerates the missing file', async () => {
      const remaining = await db.select({ filePath: ticketPhotos.filePath }).from(ticketPhotos)

      expect(remaining).toHaveLength(2)
      expect(remaining.map((row) => row.filePath).sort()).toEqual(
        [
          join('tickets', recentTicketId, 'recent.jpg'),
          join('tickets', openTicketId, 'open.jpg'),
        ].sort(),
      )

      expect(await listPhotoFiles(oldTicketId)).toEqual([])
      expect(await listPhotoFiles(recentTicketId)).toEqual(['recent.jpg'])
    })

    it('is idempotent: the same day again deletes nothing', async () => {
      const second = await runPrivacyRetention(db, { uploadDir, now })

      expect(second).toEqual({
        anonymized: 0,
        photosDeleted: 0,
        throttleDeleted: 0,
        syncRunsDeleted: 0,
      })

      const stillRecent = onlyRow(
        await db
          .select({ reporterEmail: tickets.reporterEmail })
          .from(tickets)
          .where(eq(tickets.id, recentTicketId)),
        'recent ticket',
      )

      expect(stillRecent.reporterEmail).toBe('recent-closed@example.org')
    })

    it('drops the throttle rows after 30 days and the sync runs after 365 days', async () => {
      const throttles = await db.select({ qrToken: reportThrottle.qrToken }).from(reportThrottle)

      expect(throttles.map((row) => row.qrToken)).toEqual(['recent_throttle_token'])

      const runs = await db.select({ startedAt: bmaSyncRuns.startedAt }).from(bmaSyncRuns)

      expect(runs).toHaveLength(1)
      expect(onlyRow(runs, 'sync run').startedAt).toEqual(new Date(now.getTime() - DAY_MS))
    })

    it('reads the 24-month defaults and the configured windows', async () => {
      const defaults = await readPrivacyRetentionSettings(db)

      expect(defaults).toEqual({
        contactRetentionMonths: DEFAULT_RETENTION_MONTHS,
        photoRetentionMonths: DEFAULT_RETENTION_MONTHS,
      })

      const configured = await storePrivacyRetentionSettings(db, {
        contactRetentionMonths: 2,
        photoRetentionMonths: 2,
      })

      expect(configured).toEqual({ contactRetentionMonths: 2, photoRetentionMonths: 2 })

      const run = await runPrivacyRetention(db, { uploadDir, now })

      // A two-month window reaches the ticket that closed 700 days ago.
      expect(run).toEqual({
        anonymized: 1,
        photosDeleted: 1,
        throttleDeleted: 0,
        syncRunsDeleted: 0,
      })

      const recent = onlyRow(
        await db
          .select({ reporterName: tickets.reporterName })
          .from(tickets)
          .where(eq(tickets.id, recentTicketId)),
        'recent ticket',
      )

      expect(recent.reporterName).toBeNull()

      // The open ticket is never reached, its photo row and file stay.
      const openPhotos = await db.select({ filePath: ticketPhotos.filePath }).from(ticketPhotos)

      expect(openPhotos).toHaveLength(1)
      expect(onlyRow(openPhotos, 'open photo').filePath).toBe(
        join('tickets', openTicketId, 'open.jpg'),
      )
      expect(await listPhotoFiles(openTicketId)).toEqual(['open.jpg'])
    })

    it('exposes the queue name and the daily 03:30 cron', () => {
      expect(PRIVACY_RETENTION_QUEUE).toBe('privacy-retention')
      expect(PRIVACY_RETENTION_CRON).toBe('30 3 * * *')
    })
  },
)
