import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped admin group membership integration: ${testDatabase.reason}\n`)
}

const { groups, roles, userGroups, userRoles, users } = schema

type GroupMember = {
  userId: string
  email: string
  givenName: string
  familyName: string
}

type GroupMembersBody = { members?: GroupMember[] }
type GroupSummary = { id: string; name: string; userCount: number }
type GroupsBody = { groups?: GroupSummary[] }
type MembershipBody = { userId?: string; groupId?: string }
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'admin group membership API — list, add and remove members (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let groupId = ''
    let aliceId = ''
    let bobId = ''
    const cookies: Record<'admin' | 'office' | 'oncall', string> = {
      admin: '',
      office: '',
      oncall: '',
    }

    async function userIdFor(email: string, givenName: string, familyName: string) {
      const inserted = await db
        .insert(users)
        .values({ email, givenName, familyName, passwordHash: 'no-login-for-this-group' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getMembers(cookie?: string, id = groupId) {
      return app.inject({
        method: 'GET',
        url: `/api/v1/groups/${id}/members`,
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function addMember(cookie: string, userId: string, id = groupId) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/groups/${id}/members`,
        headers: { cookie },
        payload: { userId },
      })
    }

    function removeMember(cookie: string, userId: string, id = groupId) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/groups/${id}/members/${userId}`,
        headers: { cookie },
      })
    }

    function getGroups(cookie: string) {
      return app.inject({ method: 'GET', url: '/api/v1/groups', headers: { cookie } })
    }

    function groupOf(body: GroupsBody, id: string): GroupSummary {
      const [group] = (body.groups ?? []).filter((entry) => entry.id === id)

      if (group === undefined) {
        throw new Error(`expected group ${id}`)
      }

      return group
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-groups@example.org', 'Admin', 'Groups')
      const officeId = await userIdFor('office-groups@example.org', 'Office', 'Groups')
      const oncallId = await userIdFor('oncall-groups@example.org', 'Oncall', 'Groups')
      aliceId = await userIdFor('alice-groups@example.org', 'Alice', 'Zeta')
      bobId = await userIdFor('bob-groups@example.org', 'Bob', 'Alpha')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
        { userId: oncallId, roleId: await roleIdFor('oncall') },
      ])

      groupId = onlyRow(
        await db.insert(groups).values({ name: 'Technik' }).returning({ id: groups.id }),
        'group Technik',
      ).id

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)
      cookies['oncall'] = await sessionCookieFor(oncallId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers 401 before any permission check for an anonymous request', async () => {
      const response = await getMembers()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorBody>().code).toBe('session_invalid')
    })

    it('refuses a reader without user.read and a writer without user.write', async () => {
      const read = await getMembers(cookies['oncall'])
      const add = await addMember(cookies['office'], aliceId)
      const remove = await removeMember(cookies['office'], aliceId)

      expect(read.statusCode).toBe(403)
      expect(read.json<ErrorBody>()).toEqual({ code: 'forbidden', params: {} })
      expect(add.statusCode).toBe(403)
      expect(remove.statusCode).toBe(403)
    })

    it('lists the members of an empty group', async () => {
      const response = await getMembers(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<GroupMembersBody>()).toEqual({ members: [] })
    })

    it('adds a member and answers the membership row', async () => {
      const response = await addMember(cookies['admin'], aliceId)

      expect(response.statusCode).toBe(201)
      expect(response.json<MembershipBody>()).toEqual({ userId: aliceId, groupId })
    })

    it('rejects a duplicate membership with membership_exists', async () => {
      const response = await addMember(cookies['admin'], aliceId)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorBody>()).toEqual({
        code: 'membership_exists',
        params: { fields: ['id', 'userId'] },
      })
    })

    it('rejects an unknown user and an unknown group', async () => {
      const unknownUser = await addMember(cookies['admin'], randomUUID())
      const unknownGroupAdd = await addMember(cookies['admin'], bobId, randomUUID())
      const unknownGroupRead = await getMembers(cookies['admin'], randomUUID())

      expect(unknownUser.statusCode).toBe(404)
      expect(unknownUser.json<ErrorBody>()).toEqual({
        code: 'user_not_found',
        params: { fields: ['userId'] },
      })
      expect(unknownGroupAdd.statusCode).toBe(404)
      expect(unknownGroupAdd.json<ErrorBody>().code).toBe('group_not_found')
      expect(unknownGroupRead.statusCode).toBe(404)
      expect(unknownGroupRead.json<ErrorBody>().code).toBe('group_not_found')
    })

    it('lists the members ordered by email with their names', async () => {
      const added = await addMember(cookies['admin'], bobId)

      expect(added.statusCode).toBe(201)

      const response = await getMembers(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<GroupMembersBody>().members).toEqual([
        {
          userId: aliceId,
          email: 'alice-groups@example.org',
          givenName: 'Alice',
          familyName: 'Zeta',
        },
        {
          userId: bobId,
          email: 'bob-groups@example.org',
          givenName: 'Bob',
          familyName: 'Alpha',
        },
      ])
    })

    it('counts the written rows in the group list', async () => {
      const response = await getGroups(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(groupOf(response.json<GroupsBody>(), groupId).userCount).toBe(2)
    })

    it('removes exactly one membership and reports a missing one', async () => {
      const removed = await removeMember(cookies['admin'], aliceId)

      expect(removed.statusCode).toBe(204)

      const members = await getMembers(cookies['admin'])

      expect(members.json<GroupMembersBody>().members?.map((member) => member.userId)).toEqual([
        bobId,
      ])

      const missing = await removeMember(cookies['admin'], aliceId)

      expect(missing.statusCode).toBe(404)
      expect(missing.json<ErrorBody>()).toEqual({
        code: 'membership_not_found',
        params: { fields: ['id', 'userId'], userId: aliceId, groupId },
      })

      const groupsResponse = await getGroups(cookies['admin'])

      expect(groupOf(groupsResponse.json<GroupsBody>(), groupId).userCount).toBe(1)
      expect(
        onlyRow(
          await db
            .select({ userId: userGroups.userId })
            .from(userGroups)
            .where(eq(userGroups.groupId, groupId)),
          'remaining membership',
        ).userId,
      ).toBe(bobId)
    })

    it('rejects malformed ids before touching the database', async () => {
      const group = await getMembers(cookies['admin'], 'not-a-uuid')
      const member = await removeMember(cookies['admin'], 'not-a-uuid')

      expect(group.statusCode).toBe(400)
      expect(group.json<ErrorBody>().params?.fields).toEqual(['id'])
      expect(member.statusCode).toBe(400)
      expect(member.json<ErrorBody>().params?.fields).toEqual(['userId'])
    })
  },
)
