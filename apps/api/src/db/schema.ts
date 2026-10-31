import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * UUID v7 is generated in the database (see migration 0001, function
 * `gen_uuid_v7()`). Postgres 16 has no built-in uuidv7, so the function is
 * created by the first migration and used as the column default below.
 */
export const uuidDefault = sql`gen_uuid_v7()`

const timestampOptions = { withTimezone: true, mode: 'date' } as const

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    locale: text('locale').notNull().default('de'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_key').on(table.email),
    check('users_locale_check', sql`${table.locale} IN ('de', 'en')`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('groups_name_key').on(table.name)],
)

export const userGroups = pgTable(
  'user_groups',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId], name: 'user_groups_pk' }),
    index('user_groups_group_id_idx').on(table.groupId),
  ],
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
})

/**
 * RBAC (`specs/01-rbac.md` §4.1). Roles and permissions are seeded from
 * `packages/shared/src/permissions.ts`; `is_system` roles are protected against
 * DELETE by the `protect_system_roles` trigger of migration 0001.
 */
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    key: text('key').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('roles_key_key').on(table.key)],
)

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    key: text('key').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('permissions_key_key').on(table.key)],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId], name: 'role_permissions_pk' }),
    index('role_permissions_permission_id_idx').on(table.permissionId),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId], name: 'user_roles_pk' }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
)

/** Explicit per-user overrides; `deny` always wins over the role union. */
export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    effect: text('effect').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.permissionId], name: 'user_permissions_pk' }),
    index('user_permissions_permission_id_idx').on(table.permissionId),
    check('user_permissions_effect_check', sql`${table.effect} IN ('allow', 'deny')`),
  ],
)

/**
 * Core object tables (`specs/02-data-model.md` §4.3–§4.6). The object list is
 * the maintained list of maintenance objects; `object_no` is the user input
 * natural key, unique case-insensitively through a `lower()` index (§4.3.1).
 * Internal links use the UUID primary key, external referencing uses
 * `object_no`. `qr_token` stays NULL until WP-M2-02 fills it.
 */
export const objects = pgTable(
  'objects',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    objectNo: text('object_no').notNull(),
    name: text('name').notNull(),
    street: text('street'),
    houseNumber: text('house_number'),
    postalCode: text('postal_code'),
    city: text('city'),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    qrToken: text('qr_token'),
    externalId: text('external_id'),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('objects_object_no_lower_key').on(sql`lower(${table.objectNo})`),
    uniqueIndex('objects_qr_token_key').on(table.qrToken),
    index('objects_name_idx').on(table.name),
    index('objects_active_idx').on(table.active),
  ],
)

export const SYSTEM_TYPES = ['BMA', 'LICHTRUF', 'RWA', 'EMA', 'SPRACHALARM', 'SONSTIGE'] as const

const systemTypeCheckSql = sql.raw(SYSTEM_TYPES.map((type) => `'${type}'`).join(', '))

/** Maintenance subsystems of an object (`specs/02-data-model.md` §4.4). */
export const systems = pgTable(
  'systems',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    label: text('label').notNull(),
    qrToken: text('qr_token'),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('systems_qr_token_key').on(table.qrToken),
    index('systems_object_id_idx').on(table.objectId),
    index('systems_type_idx').on(table.type),
    check('systems_type_check', sql`${table.type} IN (${systemTypeCheckSql})`),
  ],
)

/**
 * Retired QR tokens (`specs/02-data-model.md` §4.7, WP-M2-02). A regenerated
 * object token keeps redirecting through this table until `expires_at`; the
 * daily pg-boss job of WP-M2-02b deletes expired rows.
 */
export const oldQrTokens = pgTable(
  'old_qr_tokens',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('old_qr_tokens_token_key').on(table.token),
    index('old_qr_tokens_object_id_idx').on(table.objectId),
    index('old_qr_tokens_expires_at_idx').on(table.expiresAt),
  ],
)

/**
 * Localized standard texts of the report form
 * (`specs/02-data-model.md` §4.5). The `de`/`en` content comes from
 * `STANDARD_TEXTS` in `@stoerdesk/shared`, never from literals in API code.
 */
export const textTemplates = pgTable(
  'text_templates',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    key: text('key').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('text_templates_key_key').on(table.key)],
)

export const textTemplateTranslations = pgTable(
  'text_template_translations',
  {
    templateId: uuid('template_id')
      .notNull()
      .references(() => textTemplates.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.templateId, table.locale],
      name: 'text_template_translations_pk',
    }),
    check('text_template_translations_locale_check', sql`${table.locale} IN ('de', 'en')`),
  ],
)

/** Status values of the ticket state machine (`PLAN.md` §7). */
export const TICKET_STATUSES = [
  'NEW',
  'IN_REVIEW',
  'WORK_ORDER_CREATED',
  'OFFERED',
  'ASSIGNED',
  'ACCEPTED',
  'ACKNOWLEDGED',
  'CLOSED',
  'CANCELLED',
] as const

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const

/** Report source, used by the statistics of `PLAN.md` §13. */
export const TICKET_SOURCES = ['QR', 'INTERNAL', 'API'] as const

export const TICKET_EVENT_ACTOR_KINDS = ['user', 'public', 'system'] as const

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'] as const

const checkList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

/**
 * Yearly counter of `ticket_no` (`specs/02-data-model.md` §4.11). One row per
 * calendar year, allocated by the `next_ticket_no()` function of migration 0004,
 * which is also the column default of `tickets.ticket_no`. The number is a
 * readable key, not an invoice number: a rolled back transaction may leave a gap.
 */
export const ticketNoCounters = pgTable('ticket_no_counters', {
  year: integer('year').primaryKey(),
  nextValue: integer('next_value').notNull(),
})

/**
 * One malfunction report (`specs/02-data-model.md` §4.8`). The public report
 * endpoint of WP-M2-04b writes the first row; every later state change is a new
 * `ticket_events` row, never a rewrite of the history. Status and priority values
 * are English in code and database, the labels come from i18n (`PLAN.md` §7).
 */
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketNo: text('ticket_no').notNull().default(sql`next_ticket_no()`),
    /** Objects are only soft-deleted, so a report never loses its object. */
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'restrict' }),
    /** The object sync of WP-M2-01 deletes system rows; the report keeps the object. */
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('NEW'),
    priority: text('priority').notNull().default('normal'),
    title: text('title'),
    description: text('description'),
    /** `text_templates.key` values — machine keys, never translated text. */
    faultTemplateKeys: text('fault_template_keys').array().notNull().default(sql`'{}'::text[]`),
    source: text('source').notNull().default('QR'),
    reportedAt: timestamp('reported_at', timestampOptions).notNull(),
    receivedAt: timestamp('received_at', timestampOptions).notNull().defaultNow(),
    clockSkewed: boolean('clock_skewed').notNull().default(false),
    deadlineAt: timestamp('deadline_at', timestampOptions).notNull(),
    reporterName: text('reporter_name'),
    reporterPhone: text('reporter_phone'),
    reporterEmail: text('reporter_email'),
    /** Idempotency key of the offline outbox replay — unique over all tickets. */
    clientUuid: uuid('client_uuid'),
    statusToken: text('status_token'),
    suspectedSpam: boolean('suspected_spam').notNull().default(false),
    parentTicketId: uuid('parent_ticket_id').references((): AnyPgColumn => tickets.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tickets_ticket_no_key').on(table.ticketNo),
    uniqueIndex('tickets_client_uuid_key').on(table.clientUuid),
    uniqueIndex('tickets_status_token_key').on(table.statusToken),
    index('tickets_object_id_reported_at_idx').on(table.objectId, table.reportedAt),
    index('tickets_status_idx').on(table.status),
    index('tickets_parent_ticket_id_idx').on(table.parentTicketId),
    check('tickets_status_check', sql`${table.status} IN (${checkList(TICKET_STATUSES)})`),
    check('tickets_priority_check', sql`${table.priority} IN (${checkList(TICKET_PRIORITIES)})`),
    check('tickets_source_check', sql`${table.source} IN (${checkList(TICKET_SOURCES)})`),
  ],
)

/**
 * Append-only audit trail (`specs/02-data-model.md` §4.9, `PLAN.md` §15 Audit).
 * There is deliberately no check on `type`: later phases add event types without
 * a migration. UPDATE and a direct DELETE are blocked by the trigger of migration
 * 0004; only the `ON DELETE CASCADE` of the ticket itself may remove the trail.
 */
export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    actorKind: text('actor_kind').notNull(),
    /** NULL for the `public` and `system` actors. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('ticket_events_ticket_id_idx').on(table.ticketId),
    check(
      'ticket_events_actor_kind_check',
      sql`${table.actorKind} IN (${checkList(TICKET_EVENT_ACTOR_KINDS)})`,
    ),
  ],
)

/**
 * Photo metadata of a report (`specs/02-data-model.md` §4.10). The bytes live on
 * the uploads volume below `UPLOAD_DIR`; the directory is never served directly
 * (`PLAN.md` §15), so the path is stored relative to it.
 */
export const ticketPhotos = pgTable(
  'ticket_photos',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    /** Verified by magic bytes in WP-M2-04c, never by the client claim. */
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    /** NULL for an anonymous reporter. */
    uploaderUserId: uuid('uploader_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ticket_photos_file_path_key').on(table.filePath),
    index('ticket_photos_ticket_id_idx').on(table.ticketId),
    check(
      'ticket_photos_mime_type_check',
      sql`${table.mimeType} IN (${checkList(PHOTO_MIME_TYPES)})`,
    ),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Group = typeof groups.$inferSelect
export type UserGroup = typeof userGroups.$inferSelect
export type Setting = typeof settings.$inferSelect
export type Role = typeof roles.$inferSelect
export type Permission = typeof permissions.$inferSelect
export type RolePermission = typeof rolePermissions.$inferSelect
export type UserRole = typeof userRoles.$inferSelect
export type UserPermission = typeof userPermissions.$inferSelect
export type MaintenanceObject = typeof objects.$inferSelect
export type NewMaintenanceObject = typeof objects.$inferInsert
export type System = typeof systems.$inferSelect
export type NewSystem = typeof systems.$inferInsert
export type SystemType = (typeof SYSTEM_TYPES)[number]
export type TextTemplate = typeof textTemplates.$inferSelect
export type TextTemplateTranslation = typeof textTemplateTranslations.$inferSelect
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type TicketEvent = typeof ticketEvents.$inferSelect
export type NewTicketEvent = typeof ticketEvents.$inferInsert
export type TicketPhoto = typeof ticketPhotos.$inferSelect
export type NewTicketPhoto = typeof ticketPhotos.$inferInsert
export type TicketNoCounter = typeof ticketNoCounters.$inferSelect
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketSource = (typeof TICKET_SOURCES)[number]
export type TicketEventActorKind = (typeof TICKET_EVENT_ACTOR_KINDS)[number]