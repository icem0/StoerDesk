import { z } from 'zod'

/**
 * Schemas of the update control (`specs/18-self-update.md` §18.3–§18.4,
 * ADR-0007). The API validates its own answers with them and the web app reads
 * them, so a change of the contract breaks the typecheck of both sides.
 */

/** One commit between the installed version and the newest one. */
export const updateCommitSchema = z.object({
  sha: z.string().min(1),
  /** The subject of the commit — the first line of its message. */
  message: z.string(),
  /** The commit date in UTC, ISO 8601. */
  date: z.string(),
})

export type UpdateCommit = z.infer<typeof updateCommitSchema>

/**
 * The answer of `GET /api/v1/admin/update/check` (§18.3).
 *
 * `current` is the installed version (`null` when the build does not know it),
 * `latest` the short sha of the newest commit of the branch and
 * `commitsBehind` the number of commits between them (`null` when the two
 * cannot be compared).
 */
export const updateCheckResponseSchema = z.object({
  current: z.string().nullable(),
  latest: z.string().nullable(),
  updateAvailable: z.boolean(),
  commitsBehind: z.number().int().nonnegative().nullable(),
  commits: z.array(updateCommitSchema),
  checkedAt: z.string(),
})

export type UpdateCheckResponse = z.infer<typeof updateCheckResponseSchema>

/** The answer of `POST /api/v1/admin/update/start` (§18.4). */
export const updateStartResponseSchema = z.object({
  started: z.boolean(),
})

export type UpdateStartResponse = z.infer<typeof updateStartResponseSchema>
