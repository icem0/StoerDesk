import { storeAccount } from './accounts'
import type { NotificationAccount } from '@stoerdesk/shared'
import type { Database } from '../db/client'

/**
 * The Matrix account linking (`specs/10-notifications.md` §11.3, §11.11, §11.13,
 * WP-M14-11): the user enters the homeserver, their matrix id and an access
 * token. `verifyMatrixAccount` asks `GET /_matrix/client/v3/account/whoami` of
 * that homeserver with the token and compares the answered `user_id` with the
 * submitted id — only a matching pair is stored as the account of the user
 * (`storeMatrixAccount` over `storeAccount` of WP-M14-08). The token is the
 * write-only secret of the account: it travels into the stored secret only and
 * never into an answer, a log or an error message (ADR-0005 rule, §11.13).
 */

type Db = Database['database']

/** The submitted triple of the settings form — the token stays inside. */
export interface MatrixLinkingConfig {
  /** Base URL of the homeserver of the user, e.g. https://matrix.org */
  homeserver: string
  /** The matrix id the user claims, e.g. alice@example.org */
  matrixId: string
  /** The access token of the user — write-only, never answered */
  accessToken: string
}

/** The machine-readable code of a refused linking. */
export type MatrixLinkingErrorCode =
  | 'invalid_homeserver'
  | 'homeserver_unreachable'
  | 'homeserver_error'
  | 'invalid_answer'
  | 'account_mismatch'

/** A refused linking; the route maps every code to `422 invalid_request`. */
export class MatrixLinkingError extends Error {
  readonly code: MatrixLinkingErrorCode

  constructor(code: MatrixLinkingErrorCode, message: string) {
    super(message)
    this.name = 'MatrixLinkingError'
    this.code = code
  }
}

interface WhoamiAnswer {
  user_id?: string
}

/** An https homeserver without a trailing slash; anything else is refused. */
function homeserverUrl(homeserver: string): string {
  const url = homeserver.trim().replace(/\/+$/, '')

  if (!/^https:\/\//.test(url)) {
    throw new MatrixLinkingError('invalid_homeserver', 'The homeserver is not an https URL')
  }

  return url
}

/**
 * Asks the `whoami` endpoint of the homeserver with the access token and
 * answers the id the homeserver names. A transport failure, a non-ok answer,
 * an answer without a `user_id` and an id that differs from the submitted one
 * are typed errors — none of their messages carries the token.
 */
export async function verifyMatrixAccount(
  config: MatrixLinkingConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ matrixId: string }> {
  const base = homeserverUrl(config.homeserver)

  let response: Response

  try {
    response = await fetchImpl(
      `${base}/_matrix/client/v3/account/whoami`,
      { headers: { authorization: `Bearer ${config.accessToken}` } },
    )
  } catch {
    throw new MatrixLinkingError('homeserver_unreachable', 'The Matrix homeserver is unreachable')
  }

  if (!response.ok) {
    throw new MatrixLinkingError('homeserver_error', `The Matrix homeserver responded with ${response.status}`)
  }

  let answer: WhoamiAnswer

  try {
    answer = (await response.json()) as WhoamiAnswer
  } catch {
    throw new MatrixLinkingError('invalid_answer', 'The Matrix homeserver answered invalid JSON')
  }

  const userId = answer.user_id

  if (typeof userId !== 'string' || userId === '') {
    throw new MatrixLinkingError('invalid_answer', 'The Matrix homeserver answer names no user')
  }

  if (userId !== config.matrixId.trim()) {
    throw new MatrixLinkingError('account_mismatch', 'The homeserver answer names another account')
  }

  return { matrixId: userId }
}

/**
 * Verifies the pair and stores the account of the user — the token becomes the
 * write-only secret of the account and the answer reports `secretSet` only.
 */
export async function storeMatrixAccount(
  database: Db,
  userId: string,
  config: MatrixLinkingConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<NotificationAccount> {
  const verified = await verifyMatrixAccount(config, fetchImpl)

  return storeAccount(database, userId, {
    channel: 'matrix',
    externalId: verified.matrixId,
    secret: config.accessToken,
  })
}
