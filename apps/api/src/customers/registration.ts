import { createHash, randomBytes } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'

import { hashPassword } from '../auth/password'
import type { Database } from '../db/client'
import { accountTokens, roles, userRoles, users } from '../db/schema'

/**
 * The registration of a customer (`specs/19-customer-portal.md` §19.3,
 * ADR-0054): the account exists from the moment of the request, but it is not
 * usable until the link of the mail was used.
 *
 * The plain text of the token exists once, in the mail; the row holds the
 * SHA-256 hash. A token is valid for 24 hours and is consumed by its first
 * use.
 */

type Db = Database['database']
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** The database or the transaction of a ticket — the customer is written in both. */
export type CustomerExecutor = Db | Tx

export const ACCOUNT_TOKEN_TTL_HOURS = 24

export type AccountTokenPurpose = 'registration' | 'password_reset'

export class CustomerServiceError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'CustomerServiceError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/** A token of a link: 32 random bytes as base64url. */
export function generateAccountToken(): string {
  return randomBytes(32).toString('base64url')
}

/** The hash of a token — the row never holds the plain text. */
export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** The role key of the customer (`specs/19-customer-portal.md` §19.1). */
export const CUSTOMER_ROLE_KEY = 'customer'

async function customerRoleId(database: CustomerExecutor): Promise<string> {
  const rows = await database
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, CUSTOMER_ROLE_KEY))
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    throw new CustomerServiceError(500, 'internal_error')
  }

  return row.id
}

/**
 * The pending account of a registration. The password is a random value that
 * nobody knows — the customer sets his own password over the link.
 */
export async function createPendingCustomer(
  database: CustomerExecutor,
  values: {
    email: string
    givenName?: string
    familyName?: string
    createdVia: 'admin' | 'registration' | 'qr_registration'
  },
): Promise<{ userId: string; token: string }> {
  const existing = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, values.email))
    .limit(1)

  if (existing.length > 0) {
    throw new CustomerServiceError(409, 'email_taken', {})
  }

  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))

  const [user] = await database
    .insert(users)
    .values({
      email: values.email,
      givenName: values.givenName ?? '',
      familyName: values.familyName ?? '',
      passwordHash,
      active: false,
      createdVia: values.createdVia,
    })
    .returning({ id: users.id })

  if (user === undefined) {
    throw new CustomerServiceError(500, 'internal_error')
  }

  await database.insert(userRoles).values({
    userId: user.id,
    roleId: await customerRoleId(database),
  })

  const token = generateAccountToken()

  await database.insert(accountTokens).values({
    userId: user.id,
    purpose: 'registration',
    tokenHash: hashAccountToken(token),
    expiresAt: new Date(Date.now() + ACCOUNT_TOKEN_TTL_HOURS * 60 * 60 * 1000),
  })

  return { userId: user.id, token }
}

/** Creates a token of the forgotten password for an existing account. */
export async function createPasswordResetToken(database: Db, userId: string): Promise<string> {
  const token = generateAccountToken()

  await database.insert(accountTokens).values({
    userId,
    purpose: 'password_reset',
    tokenHash: hashAccountToken(token),
    expiresAt: new Date(Date.now() + ACCOUNT_TOKEN_TTL_HOURS * 60 * 60 * 1000),
  })

  return token
}

/** The account of an address — the colleague of the office is no customer. */
export async function findCustomerByEmail(
  database: CustomerExecutor,
  email: string,
): Promise<{ userId: string; isCustomer: boolean } | null> {
  const rows = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    return null
  }

  const customerRows = await database
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, row.id), eq(roles.key, CUSTOMER_ROLE_KEY)))
    .limit(1)

  return { userId: row.id, isCustomer: customerRows.length > 0 }
}

/** The account of an address — for the forgotten password. */
export async function userIdByEmail(database: CustomerExecutor, email: string): Promise<string | null> {
  const rows = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  return rows[0]?.id ?? null
}

/**
 * The token of a link with its purpose and its address. An unknown token and
 * a consumed one are the same answer, and an expired one is named as expired.
 */
export async function readAccountToken(
  database: Db,
  token: string,
): Promise<{ purpose: AccountTokenPurpose; email: string; expiresAt: Date }> {
  const rows = await database
    .select({
      purpose: accountTokens.purpose,
      expiresAt: accountTokens.expiresAt,
      consumedAt: accountTokens.consumedAt,
      email: users.email,
    })
    .from(accountTokens)
    .innerJoin(users, eq(users.id, accountTokens.userId))
    .where(
      and(eq(accountTokens.tokenHash, hashAccountToken(token)), isNull(accountTokens.consumedAt)),
    )
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    throw new CustomerServiceError(404, 'token_unknown')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new CustomerServiceError(410, 'token_expired')
  }

  return {
    purpose: row.purpose as AccountTokenPurpose,
    email: row.email,
    expiresAt: row.expiresAt,
  }
}

/**
 * Uses a token: the new password is set, the account becomes usable and the
 * token is consumed. A consumed token can not be used a second time.
 */
export async function consumeAccountToken(
  database: Db,
  token: string,
  password: string,
): Promise<string> {
  const rows = await database
    .select({
      id: accountTokens.id,
      userId: accountTokens.userId,
      expiresAt: accountTokens.expiresAt,
      consumedAt: accountTokens.consumedAt,
    })
    .from(accountTokens)
    .where(eq(accountTokens.tokenHash, hashAccountToken(token)))
    .limit(1)

  const [row] = rows

  if (row === undefined || row.consumedAt !== null) {
    throw new CustomerServiceError(404, 'token_unknown')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new CustomerServiceError(410, 'token_expired')
  }

  await database
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      active: true,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.userId))

  await database
    .update(accountTokens)
    .set({ consumedAt: new Date() })
    .where(eq(accountTokens.id, row.id))

  return row.userId
}
