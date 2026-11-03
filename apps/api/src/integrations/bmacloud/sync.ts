import { and, eq, inArray } from 'drizzle-orm'

import {
  bmaSyncRunSummarySchema,
  type BmaSyncConflict,
  type BmaSyncRunSummary,
  type BmaAnlagePayload,
  bmaAnlageSchema,
} from '@stoerdesk/shared'

import type { Database } from '../../db/client'
import { bmaSyncRuns, objects } from '../../db/schema'
import { generateQrToken } from '../../objects/qr'

/**
 * Mapping and application of a BMAcloud Anlagen pull
 * (`specs/17-bmacloud-sync.md` §17.3–§17.4, ADR-0003, WP-M2-35).
 *
 * One Anlage becomes exactly one object. BMAcloud wins for name, address and
 * the active flag on objects it owns (`external_id` set); `notes`, the contact
 * fields and `qr_token` stay local. A local object without `external_id` that
 * holds the same `object_no` is a conflict and is never overwritten, and an
 * Anlage that disappears from the pull is soft-deactivated, never deleted
 * (`tickets.object_id` is `ON DELETE RESTRICT`).
 */

type Db = Database['database']

/** The object fields the sync writes; everything else stays local. */
export interface MappedAnlage {
  objectNo: string
  name: string
  street: string | null
  postalCode: string | null
  city: string | null
  active: boolean
  externalId: string
}

export type MapResult =
  | { ok: true; value: MappedAnlage }
  | { ok: false; conflict: BmaSyncConflict }

/** §17.3 mapping of one Anlage; a `nr` with whitespace is a conflict. */
export function mapAnlage(anlage: BmaAnlagePayload): MapResult {
  const objectNo = anlage.nr
  const aid = anlage.aid

  if (objectNo.trim() === '' || /\s/.test(objectNo)) {
    return {
      ok: false,
      conflict: { code: 'invalid_object_no', objectNo, aid, detail: 'whitespace' },
    }
  }

  const firma = anlage.firma.trim()
  const anlagenort = (anlage.anlagenort ?? '').trim()
  const name =
    anlagenort !== '' && anlagenort !== firma ? `${firma} – ${anlagenort}`.trim() : firma

  return {
    ok: true,
    value: {
      objectNo,
      name: name === '' ? objectNo : name,
      street: (anlage.str ?? '').trim() || null,
      postalCode: (anlage.plz ?? '').trim() || null,
      city: (anlage.ort ?? '').trim() || null,
      active: anlage.status === 'active',
      externalId: aid,
    },
  }
}

export type BmaSyncRunResult = BmaSyncRunSummary

const toIso = (value: Date | null): string | null => (value === null ? null : value.toISOString())

function sameField(left: string | null, right: string | null): boolean {
  return (left ?? '') === (right ?? '')
}

/** Ids of a rejected raw row: the live payload carries `aid` as an integer. */
function rawId(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/**
 * Applies one pull and writes its run row. All object writes are one
 * transaction; a failure rolls them back and records a `FAILED` run with a fixed
 * error code (never the raw message, which could carry tenant data).
 */
export async function syncBmaAnlagen(
  database: Db,
  anlagen: readonly unknown[],
  now: Date = new Date(),
): Promise<BmaSyncRunResult> {
  const conflicts: BmaSyncConflict[] = []
  const mapped: MappedAnlage[] = []

  for (const anlage of anlagen) {
    const parsed = bmaAnlageSchema.safeParse(anlage)

    if (!parsed.success) {
      const record = (anlage ?? {}) as Record<string, unknown>
      conflicts.push({
        code: 'invalid_object_no',
        objectNo: rawId(record.nr),
        aid: rawId(record.aid),
        detail: 'invalid_payload',
      })
      continue
    }

    const result = mapAnlage(parsed.data)

    if (result.ok) {
      mapped.push(result.value)
    } else {
      conflicts.push(result.conflict)
    }
  }

  try {
    return await database.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: objects.id,
          objectNo: objects.objectNo,
          name: objects.name,
          street: objects.street,
          postalCode: objects.postalCode,
          city: objects.city,
          active: objects.active,
          externalId: objects.externalId,
        })
        .from(objects)

      const byExternalId = new Map(
        existing.filter((row) => row.externalId !== null).map((row) => [row.externalId, row]),
      )
      const byObjectNo = new Map(existing.map((row) => [row.objectNo.toLowerCase(), row]))

      let created = 0
      let updated = 0
      let unchanged = 0
      const seen = new Set<string>()

      for (const anlage of mapped) {
        seen.add(anlage.externalId)

        const owned = byExternalId.get(anlage.externalId)

        if (owned !== undefined) {
          const differs =
            owned.name !== anlage.name ||
            !sameField(owned.street, anlage.street) ||
            !sameField(owned.postalCode, anlage.postalCode) ||
            !sameField(owned.city, anlage.city) ||
            owned.active !== anlage.active

          if (!differs) {
            unchanged += 1
            continue
          }

          await tx
            .update(objects)
            .set({
              name: anlage.name,
              street: anlage.street,
              postalCode: anlage.postalCode,
              city: anlage.city,
              active: anlage.active,
              updatedAt: now,
            })
            .where(eq(objects.id, owned.id))

          updated += 1
          continue
        }

        const taken = byObjectNo.get(anlage.objectNo.toLowerCase())

        if (taken !== undefined) {
          conflicts.push({
            code: 'object_no_taken',
            objectNo: anlage.objectNo,
            aid: anlage.externalId,
            detail: taken.externalId === null ? 'local_object' : 'other_external_id',
          })
          continue
        }

        await tx.insert(objects).values({
          objectNo: anlage.objectNo,
          name: anlage.name,
          street: anlage.street,
          postalCode: anlage.postalCode,
          city: anlage.city,
          active: anlage.active,
          externalId: anlage.externalId,
          qrToken: generateQrToken(),
        })

        created += 1
      }

      const disappeared = existing
        .filter((row) => row.externalId !== null && !seen.has(row.externalId))
        .map((row) => row.id)

      let deactivated = 0

      if (disappeared.length > 0) {
        const rows = await tx
          .update(objects)
          .set({ active: false, updatedAt: now })
          .where(and(inArray(objects.id, disappeared), eq(objects.active, true)))
          .returning({ id: objects.id })

        deactivated = rows.length
      }

      const status = conflicts.length > 0 ? 'PARTIAL' : 'SUCCESS'

      const [run] = await tx
        .insert(bmaSyncRuns)
        .values({
          startedAt: now,
          finishedAt: now,
          status,
          total: anlagen.length,
          created,
          updated,
          unchanged,
          deactivated,
          conflicts,
        })
        .returning()

      if (run === undefined) {
        throw new Error('the run row was not written')
      }

      return bmaSyncRunSummarySchema.parse({
        startedAt: run.startedAt.toISOString(),
        finishedAt: toIso(run.finishedAt),
        status: run.status,
        total: run.total,
        created: run.created,
        updated: run.updated,
        unchanged: run.unchanged,
        deactivated: run.deactivated,
        conflicts: run.conflicts,
        errorCode: run.errorCode,
      })
    })
  } catch (error) {
    await database.insert(bmaSyncRuns).values({
      startedAt: now,
      finishedAt: new Date(),
      status: 'FAILED',
      total: anlagen.length,
      conflicts,
      errorCode: 'bma_sync_failed',
    })

    throw error
  }
}
