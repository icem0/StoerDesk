import { describe, expect, it } from 'vitest'

import { meResponseSchema, resetPasswordResponseSchema } from '../schemas/auth'
import { userSummarySchema } from '../schemas/user'

describe('the contracts of the open password change', () => {
  it('carries the flag of the one-time password in the me answer', () => {
    const parsed = meResponseSchema.parse({
      user: {
        id: '3f6b1a54-1f2e-4a2f-9f5c-2b8f4d1e7a10',
        email: 'kollege@example.org',
        givenName: 'Nora',
        familyName: 'Technik',
        locale: 'de',
        theme: 'auto',
        roles: ['oncall'],
        permissions: ['ticket.read'],
        mustChangePassword: true,
      },
    })

    expect(parsed.user.mustChangePassword).toBe(true)
  })

  it('defaults the flag to false for a caller that does not know it', () => {
    const parsed = meResponseSchema.parse({
      user: {
        id: '3f6b1a54-1f2e-4a2f-9f5c-2b8f4d1e7a10',
        email: 'kollege@example.org',
        givenName: 'Nora',
        familyName: 'Technik',
        locale: 'de',
        theme: 'auto',
        roles: ['oncall'],
        permissions: ['ticket.read'],
      },
    })

    expect(parsed.user.mustChangePassword).toBe(false)
  })

  it('carries the flag in the summary of the user list', () => {
    const parsed = userSummarySchema.parse({
      id: '3f6b1a54-1f2e-4a2f-9f5c-2b8f4d1e7a10',
      email: 'kollege@example.org',
      givenName: 'Nora',
      familyName: 'Technik',
      locale: 'de',
      theme: 'auto',
      active: true,
      roleKeys: ['oncall'],
      mustChangePassword: true,
    })

    expect(parsed.mustChangePassword).toBe(true)
  })

  it('keeps the plaintext of the one-time password in the answer of the reset', () => {
    expect(resetPasswordResponseSchema.parse({ temporaryPassword: 'abc' })).toEqual({
      temporaryPassword: 'abc',
    })
    expect(resetPasswordResponseSchema.safeParse({ temporaryPassword: '' }).success).toBe(false)
    expect(resetPasswordResponseSchema.safeParse({}).success).toBe(false)
  })
})
