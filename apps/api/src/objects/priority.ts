import { eq } from 'drizzle-orm'

import { ticketPrioritySchema, type TicketPriority } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { objectPriorityOverrides, objects, settings } from '../db/schema'

/**
 * The priority of an object (ADR-0029, `specs/02-data-model.md` §4.3.2,
 * WP-M14-134c).
 *
 * The standard is the setting `ticket.default_priority`; the deviations live in
 * the table `object_priority_overrides` and hold only what differs from the
 * standard. A value that equals the standard is never stored.
 */

/** The key of the standard priority in the `settings` table. */
export const STANDARD_PRIORITY_KEY = 'ticket.default_priority'

/** The standard of an instance without a configured row. */
export const DEFAULT_STANDARD_PRIORITY: TicketPriority = 'normal'

type Db = Database['database']
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** The standard priority of the instance. */
export async function readStandardPriority(database: Executor): Promise<TicketPriority> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, STANDARD_PRIORITY_KEY))
    .limit(1)

  const parsed = ticketPrioritySchema.safeParse(row?.value)

  return parsed.success ? parsed.data : DEFAULT_STANDARD_PRIORITY
}

/** The stored deviations of the instance, keyed by the uuid of the object. */
export async function readPriorityOverrides(
  database: Executor,
): Promise<Map<string, TicketPriority>> {
  const rows = await database
    .select({
      objectId: objectPriorityOverrides.objectId,
      priority: objectPriorityOverrides.priority,
    })
    .from(objectPriorityOverrides)

  const overrides = new Map<string, TicketPriority>()

  for (const row of rows) {
    const parsed = ticketPrioritySchema.safeParse(row.priority)

    if (parsed.success) overrides.set(row.objectId, parsed.data)
  }

  return overrides
}

/** The effective priority of one object: its deviation, else the standard. */
export async function readObjectPriority(
  database: Executor,
  objectId: string,
): Promise<TicketPriority> {
  const standard = await readStandardPriority(database)
  const overrides = await readPriorityOverrides(database)

  return overrides.get(objectId) ?? standard
}

/**
 * The deviations of the instance with the number and the name of the object,
 * as the administration shows them.
 */
export async function readPriorityOverrideList(
  database: Executor,
): Promise<
  { objectId: string; objectNo: string; objectName: string; priority: TicketPriority }[]
> {
  const rows = await database
    .select({
      objectId: objectPriorityOverrides.objectId,
      priority: objectPriorityOverrides.priority,
      objectNo: objects.objectNo,
      objectName: objects.name,
    })
    .from(objectPriorityOverrides)
    .innerJoin(objects, eq(objects.id, objectPriorityOverrides.objectId))
    .orderBy(objects.objectNo)

  const list: { objectId: string; objectNo: string; objectName: string; priority: TicketPriority }[] =
    []

  for (const row of rows) {
    const parsed = ticketPrioritySchema.safeParse(row.priority)

    if (parsed.success) {
      list.push({
        objectId: row.objectId,
        objectNo: row.objectNo,
        objectName: row.objectName,
        priority: parsed.data,
      })
    }
  }

  return list
}

/**
 * Stores the deviation of an object. `null` removes the row, and a value that
 * equals the standard removes it as well: the table holds only deviations.
 */
export async function writeObjectPriority(
  database: Executor,
  objectId: string,
  priority: TicketPriority | null,
): Promise<void> {
  if (priority === null) {
    await database
      .delete(objectPriorityOverrides)
      .where(eq(objectPriorityOverrides.objectId, objectId))

    return
  }

  const standard = await readStandardPriority(database)

  if (priority === standard) {
    await database
      .delete(objectPriorityOverrides)
      .where(eq(objectPriorityOverrides.objectId, objectId))

    return
  }

  await database
    .insert(objectPriorityOverrides)
    .values({ objectId, priority })
    .onConflictDoUpdate({
      target: objectPriorityOverrides.objectId,
      set: { priority, updatedAt: new Date() },
    })
}

/** Deletes the rows that no longer deviate from the standard. */
export async function prunePriorityOverrides(
  database: Executor,
  standard: TicketPriority,
): Promise<number> {
  const rows = await database
    .delete(objectPriorityOverrides)
    .where(eq(objectPriorityOverrides.priority, standard))
    .returning({ objectId: objectPriorityOverrides.objectId })

  return rows.length
}
