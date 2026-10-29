import { z } from 'zod'

/**
 * Payload of `POST /api/v1/auth/login` (WP-M1-07b).
 *
 * The e-mail is normalized exactly the way `seed-base.ts` stores it, so a mixed
 * case or padded entry cannot miss the account. The password length cap is an
 * input limit only — Argon2 itself has no length limit.
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>

/**
 * Response shape of `GET /api/v1/me`. Roles are role keys, never translated text;
 * the effective `permissions` array is added with WP-M1-08.
 */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    locale: z.enum(['de', 'en']),
    roles: z.array(z.string().min(1)),
  }),
})

export type MeResponse = z.infer<typeof meResponseSchema>
export type AuthUser = MeResponse['user']
