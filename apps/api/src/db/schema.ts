import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  inet,
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
    givenName: text('given_name').notNull().default(''),
    familyName: text('family_name').notNull().default(''),
    passwordHash: text('password_hash').notNull(),
    locale: text('locale').notNull().default('de'),
    theme: text('theme').notNull().default('auto'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_key').on(table.email),
    index('users_name_idx').on(sql`lower(${table.familyName})`, sql`lower(${table.givenName})`),
    check('users_locale_check', sql`${table.locale} IN ('de', 'en')`),
    check('users_theme_check', sql`${table.theme} IN ('auto', 'light', 'dark')`),
    check('users_given_name_length_check', sql`LENGTH(${table.givenName}) <= 64`),
    check('users_family_name_length_check', sql`LENGTH(${table.familyName}) <= 64`),
    check(
      'users_klarmname_trimmed_check',
      sql`TRIM(${table.givenName}) = ${table.givenName} AND TRIM(${table.familyName}) = ${table.familyName}`,
    ),
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
    externalType: text('external_type'),
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
    archivedAt: timestamp('archived_at', timestampOptions),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('text_templates_key_key').on(table.key),
    index('text_templates_archived_at_idx').on(table.archivedAt),
  ],
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
    ticketNo: text('ticket_no')
      .notNull()
      .default(sql`next_ticket_no()`),
    /** Objects are only soft-deleted, so a report never loses its object. */
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('NEW'),
    priority: text('priority').notNull().default('normal'),
    title: text('title'),
    description: text('description'),
    /** `text_templates.key` values — machine keys, never translated text. */
    faultTemplateKeys: text('fault_template_keys')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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
    /**
     * Workflow columns of `PLAN.md` §7 — added by the hand-written migration 0006
     * (WP-M2-19a) and declared here so the snapshot chain describes the real database.
     */
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewStartedAt: timestamp('review_started_at', timestampOptions),
    offeredToUserId: uuid('offered_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    offerEscalatedAt: timestamp('offer_escalated_at', timestampOptions),
    workOrderType: text('work_order_type'),
    workOrderNumber: text('work_order_number'),
    acceptedAt: timestamp('accepted_at', timestampOptions),
    firstResponseAt: timestamp('first_response_at', timestampOptions),
    acknowledgedAt: timestamp('acknowledged_at', timestampOptions),
    closedAt: timestamp('closed_at', timestampOptions),
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
    index('tickets_assigned_user_id_status_idx').on(table.assignedUserId, table.status),
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
 * Wait reasons of the timeline (`PLAN.md` §9, `specs/05-timeline.md` §5.2,
 * WP-M6-04). A pause stops the pause clock until `ended_at`; the partial unique
 * index allows at most one open pause per ticket.
 */
export const ticketPauses = pgTable(
  'ticket_pauses',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    startedAt: timestamp('started_at', timestampOptions).notNull().defaultNow(),
    endedAt: timestamp('ended_at', timestampOptions),
    startedByUserId: uuid('started_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    endedByUserId: uuid('ended_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('ticket_pauses_ticket_id_idx').on(table.ticketId),
    uniqueIndex('ticket_pauses_one_open_per_ticket')
      .on(table.ticketId)
      .where(sql`${table.endedAt} IS NULL`),
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

/**
 * Append-only log of permanently deleted tickets (`PLAN.md` §7 rule 10,
 * WP-M2-76). A hard-deleted ticket takes its events and photo rows with it;
 * this table keeps the accountability record without any reporter contact
 * data or ticket content.
 */
export const ticketPurges = pgTable(
  'ticket_purges',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketNo: text('ticket_no').notNull(),
    objectNo: text('object_no').notNull(),
    /** NULL if the deleting admin was removed afterwards. */
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    deletedEventsCount: integer('deleted_events_count').notNull(),
    deletedPhotosCount: integer('deleted_photos_count').notNull(),
    createdAt: timestamp('created_at', timestampOptions)
      .notNull()
      .defaultNow(),
  },
  (table) => [index('ticket_purges_created_at_idx').on(table.createdAt)]
)

/**
 * Admin-facing channel registry and web-push subscription store (`PLAN.md` §6,
 * §12, WP-M7-04). Rows only in this WP — the settings UI and the web-push
 * channel are later work packages. `notification_channels` names the channels
 * the admin may offer, `push_subscriptions` holds one VAPID subscription per
 * user.
 */
export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('notification_channels_name_key').on(table.name)],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [index('push_subscriptions_created_at_idx').on(table.createdAt)],
)

/** Delivery state of an outbox row (`PLAN.md` §12, WP-M7-04). */
export const OUTBOX_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const

/**
 * Notification outbox (`PLAN.md` §12, WP-M7-04). One row per configured channel
 * is written by `enqueueOutbox` in the same transaction as the ticket and its
 * `created` event; the create path never calls a channel, so a channel failure
 * can never lose the event. `target` carries only the machine-readable message
 * parameters (ticket number, priority, object name) — never a photo, never
 * contact data. The `state` check and the `(state, created_at)` index serve the
 * drain worker of WP-M7-04b.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    target: jsonb('target').notNull().default({}),
    state: text('state').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('outbox_state_created_at_idx').on(table.state, table.createdAt),
    check('outbox_state_check', sql`${table.state} IN (${checkList(OUTBOX_STATUSES)})`),
  ],
)

/**
 * Server-side receipts for replayed internal actions (`PLAN.md` §10,
 * WP-M5-01/WP-M5-02). The `client_uuid` unique key mirrors the client
 * outbox and makes a replayed acknowledge/comment/decline idempotent:
 * a second insert with the same `client_uuid` is rejected.
 */
export const internalActionReceipts = pgTable(
  'internal_action_receipts',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    /** Idempotency key of the offline outbox — unique over all receipts. */
    clientUuid: text('client_uuid').notNull().unique(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => ticketEvents.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('internal_action_receipts_client_uuid_key').on(table.clientUuid),
    index('internal_action_receipts_ticket_id_idx').on(table.ticketId),
    index('internal_action_receipts_created_at_idx').on(table.createdAt),
  ]
)

/**
 * Attempt log of the public report endpoint (`specs/06-report-form.md` §7.6,
 * WP-M2-07). One row per report attempt; the 10-minute suspicion window is a
 * `count(*)` over these rows, because the stack has no cache or Redis
 * (`PLAN.md` §4) and PostgreSQL is the only shared store. The application only
 * ever inserts here — no update, no delete (see `PLAN.md` §15 for the retention
 * question of the stored IP).
 */
export const reportThrottle = pgTable(
  'report_throttle',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    /** Request IP as Fastify sees it, honouring `TRUST_PROXY`. */
    ip: inet('ip').notNull(),
    /** The QR token the attempt arrived with — object tokens and system tokens. */
    qrToken: text('qr_token').notNull(),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('report_throttle_ip_created_at_idx').on(table.ip, table.createdAt),
    index('report_throttle_qr_token_created_at_idx').on(table.qrToken, table.createdAt),
  ],
)

/** Run status of the BMAcloud object sync (`specs/17-bmacloud-sync.md` §17.4). */
export const BMA_SYNC_RUN_STATUSES = ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'] as const

/**
 * One run of the BMAcloud Anlagen pull (`specs/17-bmacloud-sync.md` §17.4,
 * ADR-0003, WP-M2-34). A row is written once at the start and finished once;
 * unlike the event tables it is not append-only. `conflicts` keeps what the run
 * could not apply (`{ code, objectNo, aid, detail }`) and never a contact field.
 */
export const bmaSyncRuns = pgTable(
  'bma_sync_runs',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    startedAt: timestamp('started_at', timestampOptions).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', timestampOptions),
    status: text('status').notNull().default('RUNNING'),
    total: integer('total').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    unchanged: integer('unchanged').notNull().default(0),
    deactivated: integer('deactivated').notNull().default(0),
    conflicts: jsonb('conflicts').notNull().default([]),
    errorCode: text('error_code'),
  },
  (table) => [
    check('bma_sync_runs_status_check', sql`${table.status} IN (${checkList(BMA_SYNC_RUN_STATUSES)})`),
    index('bma_sync_runs_started_at_idx').on(table.startedAt),
  ],
)

/** Run status of a host update (`specs/18-self-update.md` §18.4). */
export const UPDATE_RUN_STATUSES = ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'] as const

/**
 * One run of the host update: `git pull` → `docker compose up -d --build` →
 * image prune (`specs/18-self-update.md` §18.4, ADR-0006). The row is the
 * history the administration shows; the update agent reports the result, the
 * API stores it. `agentRunId` is the id of the agent run, so a `RUNNING` row
 * can be reconciled after the restart of the API. `errorDetail` is the bounded,
 * already redacted output tail of the failing step (WP-M2-69) — never a secret,
 * never a full log.
 */
export const updateRuns = pgTable(
  'update_runs',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    startedAt: timestamp('started_at', timestampOptions).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', timestampOptions),
    status: text('status').notNull().default('RUNNING'),
    beforeVersion: text('before_version'),
    afterVersion: text('after_version'),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    agentRunId: text('agent_run_id'),
  },
  (table) => [
    check('update_runs_status_check', sql`${table.status} IN (${checkList(UPDATE_RUN_STATUSES)})`),
    index('update_runs_started_at_idx').on(table.startedAt),
  ],
)

/** Actor kinds of on-call events (`specs/04-oncall.md` §4a.4, §4a.5). */
export const ONCALL_EVENT_ACTOR_KINDS = ['user', 'system'] as const

/** Shift states of the on-call state machine (`specs/04-oncall.md` §4a.3). */
export const ONCALL_SHIFT_STATES = [
  'UNFILLED',
  'DRAFT',
  'PLANNED',
  'CONFIRMED',
  'DECLINED',
  'SWAP_REQUESTED',
] as const

/** Swap request statuses (`specs/04-oncall.md` §4a.5). */
export const ONCALL_SWAP_STATES = [
  'PENDING',
  'ACCEPTED',
  'APPROVED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
] as const

/**
 * One on-call calendar (`specs/04-oncall.md` §4a.2). An optional `group_id`
 * defines membership: a pool without a group uses every active user holding
 * the `oncall` role. A pool name is unique case-insensitively.
 */
export const oncallPools = pgTable(
  'oncall_pools',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    name: text('name').notNull(),
    /** NULL: every active `oncall` user is eligible for this pool. */
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oncall_pools_name_key').on(sql`lower(${table.name})`),
    check(
      'oncall_pools_name_trimmed_length_check',
      sql`TRIM(${table.name}) = ${table.name} AND LENGTH(${table.name}) BETWEEN 1 AND 100`,
    ),
  ],
)

/**
 * Shifts of one pool, generated from local wall-clock weeks
 * (`specs/04-oncall.md` §4a.3 / §4a.3.1). `ends_at > starts_at`, one slot per
 * `(pool_id, starts_at)`, range index over `(pool_id, starts_at, ends_at)`.
 */
export const oncallShifts = pgTable(
  'oncall_shifts',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => oncallPools.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    state: text('state').notNull().default('UNFILLED'),
    startsAt: timestamp('starts_at', timestampOptions).notNull(),
    endsAt: timestamp('ends_at', timestampOptions).notNull(),
    confirmedAt: timestamp('confirmed_at', timestampOptions),
    declinedAt: timestamp('declined_at', timestampOptions),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('oncall_shifts_pool_id_starts_at_ends_at_idx').on(
      table.poolId,
      table.startsAt,
      table.endsAt,
    ),
    uniqueIndex('oncall_shifts_pool_id_starts_at_key').on(table.poolId, table.startsAt),
    check(
      'oncall_shifts_state_check',
      sql`${table.state} IN (${checkList(ONCALL_SHIFT_STATES)})`,
    ),
    check(
      'oncall_shifts_ends_at_after_starts_at_check',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
)

/**
 * Swap requests for one shift; at most one `PENDING` request per shift
 * (`specs/04-oncall.md` §4a.5).
 */
export const oncallSwapRequests = pgTable(
  'oncall_swap_requests',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => oncallShifts.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('PENDING'),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: timestamp('accepted_at', timestampOptions),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', timestampOptions),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('oncall_swap_requests_shift_id_idx').on(table.shiftId),
    uniqueIndex('oncall_swap_requests_one_pending_per_shift')
      .on(table.shiftId)
      .where(sql`${table.status} = 'PENDING'`),
    check(
      'oncall_swap_requests_status_check',
      sql`${table.status} IN (${checkList(ONCALL_SWAP_STATES)})`,
    ),
  ],
)

/**
 * Append-only audit trail of on-call actions (`specs/04-oncall.md` §4a.4,
 * §4a.5, `PLAN.md` §15 Audit). `client_uuid` makes confirm/decline replays
 * idempotent. UPDATE and direct DELETE are blocked by the
 * `oncall_event_append_only` trigger of migration 0020; only the `ON DELETE
 * CASCADE` of a shift removes its events.
 */
export const oncallEvents = pgTable(
  'oncall_events',
  {
    id: uuid('id').primaryKey().default(uuidDefault),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => oncallShifts.id, { onDelete: 'cascade' }),
    actorKind: text('actor_kind').notNull(),
    /** NULL for `system` actors. */
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').notNull().default({}),
    /** Idempotency key for confirm/decline replays; NULL otherwise. */
    clientUuid: uuid('client_uuid'),
    createdAt: timestamp('created_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    index('oncall_events_shift_id_idx').on(table.shiftId),
    uniqueIndex('oncall_events_client_uuid_key').on(table.clientUuid),
    check(
      'oncall_events_actor_kind_check',
      sql`${table.actorKind} IN (${checkList(ONCALL_EVENT_ACTOR_KINDS)})`,
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
export type TextTemplate = typeof textTemplates.$inferSelect
export type TextTemplateTranslation = typeof textTemplateTranslations.$inferSelect
export type Ticket = typeof tickets.$inferSelect
export type NewTicket = typeof tickets.$inferInsert
export type TicketEvent = typeof ticketEvents.$inferSelect
export type NewTicketEvent = typeof ticketEvents.$inferInsert
export type TicketPhoto = typeof ticketPhotos.$inferSelect
export type NewTicketPhoto = typeof ticketPhotos.$inferInsert
export type TicketPurge = typeof ticketPurges.$inferSelect
export type NewTicketPurge = typeof ticketPurges.$inferInsert
export type InternalActionReceipt = typeof internalActionReceipts.$inferSelect
export type NewInternalActionReceipt = typeof internalActionReceipts.$inferInsert
export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type NewNotificationChannelRow = typeof notificationChannels.$inferInsert
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
export type OutboxRow = typeof outbox.$inferSelect
export type NewOutboxRow = typeof outbox.$inferInsert
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]
export type ReportThrottle = typeof reportThrottle.$inferSelect
export type NewReportThrottle = typeof reportThrottle.$inferInsert
export type BmaSyncRun = typeof bmaSyncRuns.$inferSelect
export type NewBmaSyncRun = typeof bmaSyncRuns.$inferInsert
export type BmaSyncRunStatus = (typeof BMA_SYNC_RUN_STATUSES)[number]
export type UpdateRun = typeof updateRuns.$inferSelect
export type NewUpdateRun = typeof updateRuns.$inferInsert
export type UpdateRunStatus = (typeof UPDATE_RUN_STATUSES)[number]
export type TicketNoCounter = typeof ticketNoCounters.$inferSelect
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketSource = (typeof TICKET_SOURCES)[number]
export type TicketEventActorKind = (typeof TICKET_EVENT_ACTOR_KINDS)[number]
export type OnCallPool = typeof oncallPools.$inferSelect
export type NewOnCallPool = typeof oncallPools.$inferInsert
export type OnCallShift = typeof oncallShifts.$inferSelect
export type NewOnCallShift = typeof oncallShifts.$inferInsert
export type OnCallShiftState = (typeof ONCALL_SHIFT_STATES)[number]
export type OnCallSwapRequest = typeof oncallSwapRequests.$inferSelect
export type NewOnCallSwapRequest = typeof oncallSwapRequests.$inferInsert
export type OnCallSwapState = (typeof ONCALL_SWAP_STATES)[number]
export type OnCallEvent = typeof oncallEvents.$inferSelect
export type NewOnCallEvent = typeof oncallEvents.$inferInsert
export type OnCallEventActorKind = (typeof ONCALL_EVENT_ACTOR_KINDS)[number]
