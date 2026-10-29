import { createHash, randomBytes } from 'node:crypto'

import { and, eq, lte } from 'drizzle-orm'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { roles, sessions, userRoles, users } from '../db/schema'

/**
 * Session handling of `specs/01-rbac.md` §3.6.
 *
 * The cookie carries a 256-bit random token; the database holds only its SHA-256
 * hash, so a read copy of `sessions` (backup, log leak, compromised reader) cannot
 * be replayed as a cookie. The token never reaches a log line either.
 */

export const SESSION_COOKIE_NAME = 'session'

/** 256 bits of randomness, base64url encoded in the cookie (ADR-0002 style ids aside). */
const SESSION_TOKEN_BYTES = 32

type SessionDatabase = Database['database']

export type SessionUser = {
  id: string
  email: string
  locale: string
}

/** Options for `reply.setCookie` / `reply.clearCookie` of the session cookie. */
export type SessionCookieOptions = {
  httpOnly: true
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
  path: string
  maxAge: number
}

export type SessionHandle = {
  token: string
  expiresAt: Date
}

/** New session token. Returned exactly once — only its hash is stored. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

/** SHA-256 of the token in lower case hex, the value of `sessions.token_hash`. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Creates a session row and hands out the plaintext token for the cookie. */
export async function createSession(
  database: SessionDatabase,
  userId: string,
  ttlHours: number,
): Promise<SessionHandle> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

  await database.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt })

  return { token, expiresAt }
}

/**
 * Resolves a token to its user.
 *
 * One query over `sessions ⋈ users`: expired rows of that token are removed on
 * read, and a session of a deactivated account is treated as no session at all,
 * so deactivation takes effect without any cleanup job.
 */
export async function loadSession(
  database: SessionDatabase,
  token: string,
): Promise<SessionUser | undefined> {
  if (token === '') {
    return undefined
  }

  const tokenHash = hashSessionToken(token)
  const now = new Date()

  const rows = await database
    .select({
      id: users.id,
      email: users.email,
      locale: users.locale,
      active: users.active,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))

  const [current] = rows.filter((row) => row.active === true && row.expiresAt > now)

  if (rows.some((row) => row.expiresAt <= now)) {
    await database
      .delete(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), lte(sessions.expiresAt, now)))
  }

  if (current === undefined) {
    return undefined
  }

  return { id: current.id, email: current.email, locale: current.locale }
}

/** Logout: the row is gone, an unknown token is not an error. */
export async function destroySession(database: SessionDatabase, token: string): Promise<void> {
  if (token === '') {
    return
  }

  await database.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
}

/**
 * Role keys of a user, read per request so a role change takes effect without a
 * new login (§3.2). Permission resolution itself belongs to WP-M1-08.
 */
export async function loadUserRoleKeys(
  database: SessionDatabase,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))

  return rows.map((row) => row.key)
}

/** Cookie attributes from the environment: `httpOnly` always, `Secure` in production. */
export function sessionCookieOptions(env: Env, expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: env.COOKIE_SAME_SITE,
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  }
}
