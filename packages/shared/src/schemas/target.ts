import { z } from 'zod'

/**
 * The target of an `offer` or an `assign` action (`specs/07-escalation.md`
 * §7.14, ADR-0026, ADR-0033, ADR-0057): a readiness pool of the on-call
 * calendar (`pool`), a user group of the administration (`group`) or one
 * technician of the installation (`user`).
 *
 * The jsonb of the action carries no foreign key, so the configuration service
 * checks the id against those rows.
 *
 * The schema lives in its own module: the contract of the ticket and the
 * contract of the escalation both name the target, and the two modules would
 * import each other otherwise.
 */
export const escalationTargetSchema = z.object({
  kind: z.enum(['pool', 'group', 'user']),
  id: z.uuid(),
})

export type EscalationTarget = z.infer<typeof escalationTargetSchema>
