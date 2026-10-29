/**
 * Permission catalog and the default role matrix — the single source of truth for
 * the database seed, the API guards and the UI (`specs/01-rbac.md` §3.3, §3.4).
 * Multi-word keys use snake_case; the key value is the permission string itself.
 */
export const PERMISSIONS = {
  ticket: {
    read: 'ticket.read',
    create: 'ticket.create',
    review: 'ticket.review',
    assign: 'ticket.assign',
    offer: 'ticket.offer',
    claim: 'ticket.claim',
    accept: 'ticket.accept',
    decline: 'ticket.decline',
    acknowledge: 'ticket.acknowledge',
    close: 'ticket.close',
    reopen: 'ticket.reopen',
    cancel: 'ticket.cancel',
    comment: 'ticket.comment',
    photoRead: 'ticket.photo.read',
    photoWrite: 'ticket.photo.write',
  },
  object: {
    read: 'object.read',
    write: 'object.write',
    delete: 'object.delete',
    regenerateQr: 'object.regenerate_qr',
    import: 'object.import',
  },
  oncall: {
    read: 'oncall.read',
    plan: 'oncall.plan',
    confirm: 'oncall.confirm',
    swap: 'oncall.swap',
    admin: 'oncall.admin',
  },
  user: {
    read: 'user.read',
    write: 'user.write',
  },
  role: {
    read: 'role.read',
    write: 'role.write',
  },
  settings: {
    read: 'settings.read',
    write: 'settings.write',
  },
  apikey: {
    read: 'apikey.read',
    write: 'apikey.write',
  },
  stats: {
    read: 'stats.read',
    export: 'stats.export',
  },
  notification: {
    read: 'notification.read',
    write: 'notification.write',
  },
} as const

type PermissionGroups = typeof PERMISSIONS
type PermissionValue<T> = T[keyof T]

export type PermissionKey = PermissionValue<{
  [K in keyof PermissionGroups]: PermissionValue<PermissionGroups[K]>
}>

export const PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.ticket.read,
  PERMISSIONS.ticket.create,
  PERMISSIONS.ticket.review,
  PERMISSIONS.ticket.assign,
  PERMISSIONS.ticket.offer,
  PERMISSIONS.ticket.claim,
  PERMISSIONS.ticket.accept,
  PERMISSIONS.ticket.decline,
  PERMISSIONS.ticket.acknowledge,
  PERMISSIONS.ticket.close,
  PERMISSIONS.ticket.reopen,
  PERMISSIONS.ticket.cancel,
  PERMISSIONS.ticket.comment,
  PERMISSIONS.ticket.photoRead,
  PERMISSIONS.ticket.photoWrite,
  PERMISSIONS.object.read,
  PERMISSIONS.object.write,
  PERMISSIONS.object.delete,
  PERMISSIONS.object.regenerateQr,
  PERMISSIONS.object.import,
  PERMISSIONS.oncall.read,
  PERMISSIONS.oncall.plan,
  PERMISSIONS.oncall.confirm,
  PERMISSIONS.oncall.swap,
  PERMISSIONS.oncall.admin,
  PERMISSIONS.user.read,
  PERMISSIONS.user.write,
  PERMISSIONS.role.read,
  PERMISSIONS.role.write,
  PERMISSIONS.settings.read,
  PERMISSIONS.settings.write,
  PERMISSIONS.apikey.read,
  PERMISSIONS.apikey.write,
  PERMISSIONS.stats.read,
  PERMISSIONS.stats.export,
  PERMISSIONS.notification.read,
  PERMISSIONS.notification.write,
]

export const SYSTEM_ROLE_KEYS = [
  'reporter_internal',
  'office',
  'oncall',
  'manager',
  'admin',
] as const

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]

/** Permission set of the five system roles, seeded into `role_permissions`. */
export const DEFAULT_ROLES: Record<SystemRoleKey, PermissionKey[]> = {
  reporter_internal: [
    PERMISSIONS.ticket.read,
    PERMISSIONS.ticket.create,
    PERMISSIONS.ticket.comment,
    PERMISSIONS.ticket.photoRead,
    PERMISSIONS.ticket.photoWrite,
    PERMISSIONS.object.read,
    PERMISSIONS.notification.read,
    PERMISSIONS.notification.write,
  ],
  office: [
    PERMISSIONS.ticket.read,
    PERMISSIONS.ticket.create,
    PERMISSIONS.ticket.review,
    PERMISSIONS.ticket.assign,
    PERMISSIONS.ticket.offer,
    PERMISSIONS.ticket.close,
    PERMISSIONS.ticket.reopen,
    PERMISSIONS.ticket.cancel,
    PERMISSIONS.ticket.comment,
    PERMISSIONS.ticket.photoRead,
    PERMISSIONS.ticket.photoWrite,
    PERMISSIONS.object.read,
    PERMISSIONS.object.write,
    PERMISSIONS.object.import,
    PERMISSIONS.oncall.read,
    PERMISSIONS.user.read,
    PERMISSIONS.settings.read,
    PERMISSIONS.notification.read,
    PERMISSIONS.notification.write,
  ],
  oncall: [
    PERMISSIONS.ticket.read,
    PERMISSIONS.ticket.claim,
    PERMISSIONS.ticket.accept,
    PERMISSIONS.ticket.decline,
    PERMISSIONS.ticket.acknowledge,
    PERMISSIONS.ticket.comment,
    PERMISSIONS.ticket.photoRead,
    PERMISSIONS.ticket.photoWrite,
    PERMISSIONS.object.read,
    PERMISSIONS.oncall.read,
    PERMISSIONS.oncall.confirm,
    PERMISSIONS.oncall.swap,
    PERMISSIONS.settings.read,
    PERMISSIONS.notification.read,
    PERMISSIONS.notification.write,
  ],
  manager: [
    PERMISSIONS.ticket.read,
    PERMISSIONS.ticket.reopen,
    PERMISSIONS.ticket.comment,
    PERMISSIONS.ticket.photoRead,
    PERMISSIONS.object.read,
    PERMISSIONS.oncall.read,
    PERMISSIONS.user.read,
    PERMISSIONS.settings.read,
    PERMISSIONS.stats.read,
    PERMISSIONS.stats.export,
    PERMISSIONS.notification.read,
    PERMISSIONS.notification.write,
  ],
  admin: [...PERMISSION_KEYS],
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(value)
}
