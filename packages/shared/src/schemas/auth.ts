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
 * Response shape of `GET /api/v1/me` and of a successful login. Roles are role
 * keys, `permissions` the effective permission keys of `specs/01-rbac.md` §3.2
 * (role union, plus explicit allows, minus explicit denials) — keys only, never
 * translated text.
 *
 * `mustChangePassword` marks an account whose password is a one-time password
 * (`specs/01-rbac.md` §3.9, ADR-0031): the account may log in, but it may not
 * work before the user sets a password of their own. The default keeps the
 * contract valid for a caller that does not know the flag yet.
 */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    givenName: z.string(),
    familyName: z.string(),
    locale: z.enum(['de', 'en']),
    theme: z.enum(['auto', 'light', 'dark']),
    roles: z.array(z.string().min(1)),
    permissions: z.array(z.string().min(1)),
    mustChangePassword: z.boolean().default(false),
  }),
})

export type MeResponse = z.infer<typeof meResponseSchema>
export type AuthUser = MeResponse['user']

/**
 * Answer of `POST /api/v1/users/:id/password` (`specs/01-rbac.md` §3.9,
 * ADR-0031): the plaintext of the one-time password the server generated. It
 * exists exactly once, in this answer — it is never stored and never logged.
 */
export const resetPasswordResponseSchema = z.object({
  temporaryPassword: z.string().min(1),
})

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>
