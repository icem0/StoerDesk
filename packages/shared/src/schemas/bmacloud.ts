import { z } from 'zod'

/**
 * Schemas of the BMAcloud object sync (`specs/17-bmacloud-sync.md` §17.3–§17.4,
 * ADR-0003). The API validates every Anlage of a pull with `bmaAnlageSchema`
 * before the mapping runs, so a malformed row becomes a recorded conflict
 * instead of a broken object.
 */

/** One Anlage as far as StörDesk reads it (§17.3). */
export const bmaAnlageSchema = z.object({
  aid: z.string().trim().min(1),
  nr: z.string().min(1),
  firma: z.string().default(''),
  anlagenort: z.string().nullish(),
  str: z.string().nullish(),
  plz: z.string().nullish(),
  ort: z.string().nullish(),
  status: z.string().nullish(),
})

export type BmaAnlagePayload = z.infer<typeof bmaAnlageSchema>

/** Why the sync could not apply one Anlage; never a translated text (§3). */
export const BMA_SYNC_CONFLICT_CODES = ['invalid_object_no', 'object_no_taken'] as const

export const bmaSyncConflictSchema = z.object({
  code: z.enum(BMA_SYNC_CONFLICT_CODES),
  objectNo: z.string(),
  aid: z.string(),
  detail: z.string().nullable(),
})

export type BmaSyncConflict = z.infer<typeof bmaSyncConflictSchema>

export const bmaSyncRunStatusSchema = z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'])

/** Counters and conflicts of one finished run (§17.4). */
export const bmaSyncRunSummarySchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: bmaSyncRunStatusSchema,
  total: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  deactivated: z.number().int(),
  conflicts: z.array(bmaSyncConflictSchema),
  errorCode: z.string().nullable(),
})

export type BmaSyncRunSummary = z.infer<typeof bmaSyncRunSummarySchema>
