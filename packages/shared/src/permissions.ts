export const PERMISSIONS = {
  ticket: {
    assign: 'ticket.assign',
  },
  object: {
    read: 'object.read',
    write: 'object.write',
    delete: 'object.delete',
    regenerateQr: 'object.regenerate_qr',
  },
  user: {
    write: 'user.write',
  },
  settings: {
    write: 'settings.write',
  },
} as const

type PermissionGroups = typeof PERMISSIONS
type PermissionValue<T> = T[keyof T]

export type PermissionKey = PermissionValue<{
  [K in keyof PermissionGroups]: PermissionValue<PermissionGroups[K]>
}>

export const PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.ticket.assign,
  PERMISSIONS.object.read,
  PERMISSIONS.object.write,
  PERMISSIONS.object.delete,
  PERMISSIONS.object.regenerateQr,
  PERMISSIONS.user.write,
  PERMISSIONS.settings.write,
]
