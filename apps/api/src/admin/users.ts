import { and, eq, inArray, ne } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createUserRequestSchema,
  PERMISSIONS,
  resetPasswordResponseSchema,
  updateUserRequestSchema,
  userListResponseSchema,
  userSummarySchema,
} from '@stoerdesk/shared'

import { generateTemporaryPassword, hashPassword } from '../auth/password'
import { requirePermission } from '../auth/requirePermission'
import { destroyUserSessions } from '../auth/session'
import type { Database } from '../db/client'
import { roles, userRoles, users } from '../db/schema'

type Transaction = Parameters<Parameters<Database['database']['transaction']>[0]>[0]

type UserRow = {
  id: string
  email: string
  givenName: string
  familyName: string
  locale: string
  theme: string
  active: boolean
  mustChangePassword: boolean
}

class UserRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'UserRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } }
}

function parseUser(row: UserRow, roleKeys: string[]) {
  return userSummarySchema.parse({ ...row, roleKeys: [...roleKeys].sort() })
}

async function loadRoleKeys(database: Transaction, userId: string): Promise<string[]> {
  const rows = await database
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))

  return rows.map((row) => row.key).sort()
}

async function loadRoleIds(database: Transaction, roleKeys: string[]): Promise<string[]> {
  if (roleKeys.length === 0) {
    return []
  }

  const rows = await database
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.key, roleKeys))

  const found = new Set(rows.map((row) => row.key))
  const missing = roleKeys.filter((key) => found.has(key) === false).sort()

  if (missing.length > 0) {
    throw new UserRouteError(422, 'unknown_role_key', {
      fields: ['roleKeys'],
      roleKeys: missing,
    })
  }

  return rows.map((row) => row.id)
}

async function assertNotLastAdmin(database: Transaction, userId: string): Promise<void> {
  const other = await database
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, 'admin'), eq(users.active, true), ne(users.id, userId)))
    .limit(1)

  if (other.length === 0) {
    throw new UserRouteError(409, 'last_admin', { fields: ['id'] })
  }
}

export type AdminUsersRouteOptions = {
  database: Database['database']
}

export const adminUsersRoutes = fp<AdminUsersRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/users',
      { preHandler: requirePermission(database, PERMISSIONS.user.read) },
      async () => {
        const userRows = await database
          .select({
            id: users.id,
            email: users.email,
            givenName: users.givenName,
            familyName: users.familyName,
            locale: users.locale,
            theme: users.theme,
            active: users.active,
            mustChangePassword: users.mustChangePassword,
          })
          .from(users)
          .orderBy(users.email)

        const roleRows = await database
          .select({ userId: userRoles.userId, key: roles.key })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))

        const roleKeysByUser = new Map<string, string[]>()

        for (const row of roleRows) {
          const existing = roleKeysByUser.get(row.userId) ?? []
          existing.push(row.key)
          roleKeysByUser.set(row.userId, existing)
        }

        return userListResponseSchema.parse({
          users: userRows.map((row) => parseUser(row, (roleKeysByUser.get(row.id) ?? []).sort())),
        })
      },
    )

    app.post(
      '/api/v1/users',
      { preHandler: requirePermission(database, PERMISSIONS.user.write) },
      async (request, reply) => {
        const parsed = createUserRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const { email, password, givenName, familyName, locale, theme, active, roleKeys } =
          parsed.data
        const duplicate = await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)

        if (duplicate.length > 0) {
          return reply.code(409).send({ code: 'email_taken', params: { fields: ['email'] } })
        }

        const passwordHash = await hashPassword(password)
        const created = await database.transaction(async (tx) => {
          const roleIds = await loadRoleIds(tx, roleKeys)
          const inserted = await tx
            .insert(users)
            .values({
              email,
              passwordHash,
              givenName,
              familyName,
              locale,
              theme,
              active,
            })
            .returning({
              id: users.id,
              email: users.email,
              givenName: users.givenName,
              familyName: users.familyName,
              locale: users.locale,
              theme: users.theme,
              active: users.active,
              mustChangePassword: users.mustChangePassword,
            })

          const [user] = inserted

          if (user === undefined) {
            throw new UserRouteError(500, 'user_create_failed', { fields: ['email'] })
          }

          if (roleIds.length > 0) {
            await tx
              .insert(userRoles)
              .values(roleIds.map((roleId) => ({ userId: user.id, roleId })))
          }

          return user
        })

        return reply.code(201).send(parseUser(created, roleKeys))
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/users/:id',
      { preHandler: requirePermission(database, PERMISSIONS.user.write) },
      async (request, reply) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = updateUserRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const targetId = parsedId.data
        const body = parsed.data
        const passwordHash =
          body.password === undefined ? undefined : await hashPassword(body.password)

        const updated = await database.transaction(async (tx) => {
          const targetRows = await tx
            .select({
              id: users.id,
              email: users.email,
              givenName: users.givenName,
              familyName: users.familyName,
              locale: users.locale,
              theme: users.theme,
              active: users.active,
              mustChangePassword: users.mustChangePassword,
            })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)

          const [target] = targetRows

          if (target === undefined) {
            throw new UserRouteError(404, 'user_not_found', { fields: ['id'] })
          }

          const currentRoleKeys = await loadRoleKeys(tx, targetId)
          const nextRoleKeys = body.roleKeys ?? currentRoleKeys
          const nextActive = body.active ?? target.active
          const removesAdmin =
            target.active === true &&
            currentRoleKeys.includes('admin') &&
            (nextActive !== true || nextRoleKeys.includes('admin') === false)

          if (removesAdmin) {
            await assertNotLastAdmin(tx, targetId)
          }

          const nextGivenName = body.givenName ?? target.givenName
          const nextFamilyName = body.familyName ?? target.familyName
          const nextLocale = body.locale ?? target.locale
          const nextTheme = body.theme ?? target.theme

          await tx
            .update(users)
            .set({
              givenName: nextGivenName,
              familyName: nextFamilyName,
              locale: nextLocale,
              theme: nextTheme,
              active: nextActive,
              updatedAt: new Date(),
              ...(passwordHash === undefined ? {} : { passwordHash }),
            })
            .where(eq(users.id, targetId))

          if (body.roleKeys !== undefined) {
            const roleIds = await loadRoleIds(tx, nextRoleKeys)
            await tx.delete(userRoles).where(eq(userRoles.userId, targetId))

            if (roleIds.length > 0) {
              await tx
                .insert(userRoles)
                .values(roleIds.map((roleId) => ({ userId: targetId, roleId })))
            }
          }

          return parseUser(
            {
              id: target.id,
              email: target.email,
              givenName: nextGivenName,
              familyName: nextFamilyName,
              locale: nextLocale,
              theme: nextTheme,
              active: nextActive,
              mustChangePassword: target.mustChangePassword,
            },
            nextRoleKeys,
          )
        })

        return reply.code(200).send(updated)
      },
    )

    /**
     * The administration sets the password of a colleague (`specs/01-rbac.md`
     * §3.9, ADR-0031): the server generates the one-time password and answers
     * it exactly once. The account carries the flag `must_change_password`
     * until the colleague sets a password of their own, and the sessions of
     * the account die with the secret.
     *
     * The answer carries the plaintext of the one-time password — it is never
     * stored, never logged and never answered a second time.
     */
    app.post<{ Params: { id: string } }>(
      '/api/v1/users/:id/password',
      { preHandler: requirePermission(database, PERMISSIONS.user.write) },
      async (request, reply) => {
        const parsedId = z.uuid().safeParse(request.params.id)

        if (!parsedId.success) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const targetId = parsedId.data
        const targetRows = await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1)

        if (targetRows.length === 0) {
          return reply.code(404).send({ code: 'user_not_found', params: { fields: ['id'] } })
        }

        const temporaryPassword = generateTemporaryPassword()
        const passwordHash = await hashPassword(temporaryPassword)

        await database.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
            .where(eq(users.id, targetId))

          // The sessions die with the secret: the old password and every open
          // session of the account are gone with the reset.
          await destroyUserSessions(tx, targetId)
        })

        // The log line carries the code only — never the plaintext, never the
        // e-mail of the account.
        request.log.info({ code: 'password_reset' })

        return reply.code(200).send(resetPasswordResponseSchema.parse({ temporaryPassword }))
      },
    )
  },
  { name: 'stoerdesk-admin-users' },
)
