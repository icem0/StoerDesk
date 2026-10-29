import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ROLES,
  PERMISSIONS,
  PERMISSION_KEYS,
  SYSTEM_ROLE_KEYS,
  isPermissionKey,
  type PermissionKey,
  type SystemRoleKey,
} from '../permissions.js'

function catalogValues(): string[] {
  return Object.values(PERMISSIONS).flatMap((group) => Object.values(group))
}

describe('permission catalog', () => {
  it('lists every catalog value exactly once in PERMISSION_KEYS', () => {
    const values = catalogValues()

    expect(PERMISSION_KEYS).toHaveLength(values.length)
    expect([...PERMISSION_KEYS].sort()).toEqual([...values].sort())
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it('uses snake_case for multi-word keys and camelCase for the accessors', () => {
    expect(PERMISSIONS.object.regenerateQr).toBe('object.regenerate_qr')
    expect(PERMISSIONS.ticket.photoRead).toBe('ticket.photo.read')
    expect(PERMISSIONS.ticket.photoWrite).toBe('ticket.photo.write')
    expect(PERMISSIONS.object.delete).toBe('object.delete')
    expect(PERMISSIONS.object.import).toBe('object.import')
  })

  it('recognizes catalog keys only', () => {
    expect(isPermissionKey('ticket.review')).toBe(true)
    expect(isPermissionKey('ticket.nonsense')).toBe(false)
    expect(isPermissionKey('admin.everything')).toBe(false)
  })
})

describe('default roles', () => {
  it('covers exactly the five system roles', () => {
    expect(Object.keys(DEFAULT_ROLES).sort()).toEqual([...SYSTEM_ROLE_KEYS].sort())
  })

  it('grants admin every permission and keeps the matrix sizes of specs/01 §3.3', () => {
    const sizes: Record<SystemRoleKey, number> = {
      reporter_internal: 8,
      office: 19,
      oncall: 15,
      manager: 12,
      admin: PERMISSION_KEYS.length,
    }

    for (const roleKey of SYSTEM_ROLE_KEYS) {
      const granted = DEFAULT_ROLES[roleKey]

      expect(granted).toHaveLength(sizes[roleKey])
      expect(new Set(granted).size).toBe(granted.length)
      expect(granted.every((key) => PERMISSION_KEYS.includes(key))).toBe(true)
    }

    expect([...DEFAULT_ROLES.admin].sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('keeps the role matrix free of unknown keys', () => {
    for (const roleKey of SYSTEM_ROLE_KEYS) {
      for (const key of DEFAULT_ROLES[roleKey]) {
        const typed: PermissionKey = key

        expect(isPermissionKey(typed)).toBe(true)
      }
    }
  })
})
