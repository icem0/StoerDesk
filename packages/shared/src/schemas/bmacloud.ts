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

/** One stored run row of the admin run history (`specs/17-bmacloud-sync.md` §17.5). */
export const bmaSyncRunRowSchema = bmaSyncRunSummarySchema.extend({
  id: z.string().uuid(),
})

export type BmaSyncRunRow = z.infer<typeof bmaSyncRunRowSchema>

/** Query of the run history: newest runs first, capped so the page stays readable. */
export const bmaSyncRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type BmaSyncRunsQuery = z.infer<typeof bmaSyncRunsQuerySchema>

export const bmaSyncRunsResponseSchema = z.object({
  runs: z.array(bmaSyncRunRowSchema),
})

export type BmaSyncRunsResponse = z.infer<typeof bmaSyncRunsResponseSchema>

/**
 * Five whitespace-separated fields in the cron syntax pg-boss expects
 * (`BMA_SYNC_CRON`, `bma.sync.cron`). An invalid expression is refused before it
 * reaches the scheduler.
 */
export const BMA_SYNC_CRON_MAX_LENGTH = 64

export const bmaSyncCronSchema = z
  .string()
  .trim()
  .max(BMA_SYNC_CRON_MAX_LENGTH)
  .regex(/^\S+(\s+\S+){4}$/, 'cron must have five fields')

/**
 * Length cap of the bearer key. The live tenant key is a hex string, so 512 is a
 * generous ceiling that still keeps a stray paste out of the `settings` row
 * (ADR-0005).
 */
export const BMA_API_KEY_MAX_LENGTH = 512

/** Body of the credential write — the key travels one way only (ADR-0005). */
export const bmaApiKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(BMA_API_KEY_MAX_LENGTH),
})

export type BmaApiKeyRequest = z.infer<typeof bmaApiKeyRequestSchema>

/** Where the effective key comes from: stored row, environment or nowhere. */
export const BMA_API_KEY_SOURCES = ['db', 'env', 'none'] as const

/** Answer of the credential routes: never the key itself (ADR-0005). */
export const bmaCredentialsResponseSchema = z.object({
  configured: z.boolean(),
  source: z.enum(BMA_API_KEY_SOURCES),
})

export type BmaCredentialsResponse = z.infer<typeof bmaCredentialsResponseSchema>

/** The schedule pair of the sync (§17.5, ADR-0003). */
export const bmaSyncScheduleRequestSchema = z.object({
  enabled: z.boolean(),
  cron: bmaSyncCronSchema,
})

export type BmaSyncScheduleRequest = z.infer<typeof bmaSyncScheduleRequestSchema>

export const bmaSyncScheduleResponseSchema = z.object({
  enabled: z.boolean(),
  cron: bmaSyncCronSchema,
})

export type BmaSyncSchedule = z.infer<typeof bmaSyncScheduleResponseSchema>
