import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
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

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Group = typeof groups.$inferSelect
export type UserGroup = typeof userGroups.$inferSelect
export type Setting = typeof settings.$inferSelect
