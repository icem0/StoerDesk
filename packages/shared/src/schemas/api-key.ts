import { z } from 'zod'

/**
 * External API credentials (`specs/08-objects-api.md` §9.5, ADR-0013).
 * The token and its hash never appear in a summary; the plaintext exists only in
 * the one-time create answer.
 */

export const API_KEY_SCOPES = [
  'objects:read',
  'objects:write',
  'tickets:read',
  'tickets:write',
] as const

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES)

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>

export const apiKeySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema).min(1),
  createdBy: z.string().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

export const apiKeyListResponseSchema = z.object({
  keys: z.array(apiKeySummarySchema),
})

const apiKeyName = z.string().trim().min(1).max(100)
const apiKeyExpiry = z.iso.datetime().nullable().optional()

export const createApiKeyRequestSchema = z.object({
  name: apiKeyName,
  scopes: z.array(apiKeyScopeSchema).min(1).refine((scopes) => new Set(scopes).size === scopes.length),
  expiresAt: apiKeyExpiry,
})

export const updateApiKeyRequestSchema = z.object({
  name: apiKeyName.optional(),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1)
    .refine((scopes) => new Set(scopes).size === scopes.length)
    .optional(),
  expiresAt: apiKeyExpiry,
})

export const createApiKeyResponseSchema = z.object({
  key: apiKeySummarySchema,
  /** The only time the plaintext token is ever answered. */
  token: z.string().regex(/^sk_[A-Za-z0-9_-]{43}$/),
})

export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>
export type UpdateApiKeyRequest = z.infer<typeof updateApiKeyRequestSchema>
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>
