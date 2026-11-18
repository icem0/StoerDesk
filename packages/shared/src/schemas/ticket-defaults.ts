import { z } from 'zod'

import { TICKET_PRIORITIES } from '../timeline.js'

/**
 * The standard priority and the deviations of the objects (ADR-0029,
 * `specs/02-data-model.md` §4.3.2, WP-M14-134b).
 *
 * The standard is the setting `ticket.default_priority`; the deviations live in
 * the table `object_priority_overrides` and hold only what differs from the
 * standard. The priority of a new ticket is the deviation of its object, else
 * the standard.
 */

export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES)

/** The standard priority of a new ticket; the same shape is the body of the PUT. */
export const ticketDefaultsSchema = z.object({
  priority: ticketPrioritySchema,
})

/** One object whose priority deviates from the standard. */
export const objectPriorityOverrideSchema = z.object({
  objectId: z.uuid(),
  objectNo: z.string(),
  objectName: z.string(),
  priority: ticketPrioritySchema,
})

/** The list of the deviations, as the administration shows it. */
export const objectPriorityOverrideListSchema = z.object({
  overrides: z.array(objectPriorityOverrideSchema),
})

export type TicketDefaults = z.infer<typeof ticketDefaultsSchema>
export type ObjectPriorityOverride = z.infer<typeof objectPriorityOverrideSchema>
export type ObjectPriorityOverrideList = z.infer<typeof objectPriorityOverrideListSchema>
