import { createHash, randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import {
  apiKeySummarySchema,
  type ApiKeySummary,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  type UpdateApiKeyRequest,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { apiKeys, users } from '../db/schema'

/**
 * API-key service (`specs/08-objects-api.md` §9.5, ADR-0013, WP-M10-03).
 *
 * Only the SHA-256 hash of a token is stored. The plaintext exists in the create
 * answer once and is never logged or answered again.
 */

type Db = Database['database']

export class ApiKeyError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ApiKeyError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

const KEY_PREFIX = 'sk_'

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** `sk_` plus 32 random bytes in base64url (43 characters). */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

function summarize(row: {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdBy: string | null
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}): ApiKeySummary {
  return apiKeySummarySchema.parse({
    ...row,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  })
}

function expiryFrom(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return new Date(value)
}

const listSelection = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  scopes: apiKeys.scopes,
  createdBy: users.email,
  lastUsedAt: apiKeys.lastUsedAt,
  expiresAt: apiKeys.expiresAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
}

export async function listApiKeys(database: Db): Promise<ApiKeySummary[]> {
  const rows = await database
    .select(listSelection)
    .from(apiKeys)
    .leftJoin(users, eq(users.id, apiKeys.createdByUserId))
    .orderBy(desc(apiKeys.createdAt))

  return rows.map(summarize)
}

export async function createApiKey(
  database: Db,
  input: CreateApiKeyRequest,
  createdByUserId: string | undefined,
): Promise<CreateApiKeyResponse> {
  const token = generateApiKey()
  const [row] = await database
    .insert(apiKeys)
    .values({
      tokenHash: hashApiKey(token),
      prefix: token.slice(0, 10),
      name: input.name,
      scopes: input.scopes,
      createdByUserId: createdByUserId ?? null,
      expiresAt: expiryFrom(input.expiresAt),
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdByUserId: apiKeys.createdByUserId,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })

  if (row === undefined) {
    throw new ApiKeyError(500, 'api_key_create_failed')
  }

  return {
    key: summarize({ ...row, createdBy: null }),
    token,
  }
}

export async function updateApiKey(
  database: Db,
  id: string,
  input: UpdateApiKeyRequest,
): Promise<ApiKeySummary> {
  const [updated] = await database
    .update(apiKeys)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: expiryFrom(input.expiresAt) }),
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, id))
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdByUserId: apiKeys.createdByUserId,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })

  if (updated === undefined) {
    throw new ApiKeyError(404, 'api_key_not_found', { id })
  }

  const [createdBy] = updated.createdByUserId === null
    ? []
    : await database
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, updated.createdByUserId))
        .limit(1)

  return summarize({ ...updated, createdBy: createdBy?.email ?? null })
}

export async function revokeApiKey(database: Db, id: string, now: Date = new Date()): Promise<void> {
  const [row] = await database
    .update(apiKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(apiKeys.id, id))
    .returning({ id: apiKeys.id })

  if (row === undefined) {
    throw new ApiKeyError(404, 'api_key_not_found', { id })
  }
}

export type VerifiedApiKey = {
  id: string
  scopes: string[]
}

/**
 * Verifies a bearer token and refreshes `last_used_at`. A revoked or expired key
 * is invalid, regardless of its hash.
 */
export async function verifyApiKey(
  database: Db,
  token: string,
  now: Date = new Date(),
): Promise<VerifiedApiKey | undefined> {
  if (!token.startsWith(KEY_PREFIX)) {
    return undefined
  }

  const [row] = await database
    .select({
      id: apiKeys.id,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tokenHash, hashApiKey(token)))
    .limit(1)

  if (row === undefined || row.revokedAt !== null) {
    return undefined
  }

  if (row.expiresAt !== null && row.expiresAt <= now) {
    return undefined
  }

  await database
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, row.id))

  return { id: row.id, scopes: row.scopes }
}
