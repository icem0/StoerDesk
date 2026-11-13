import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { NotificationAccount } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { storeAccount } from './accounts'

/**
 * The Telegram account linking via a one-time code (`specs/10-notifications.md`
 * §11.3, §11.11, §11.13, WP-M14-09).
 *
 * `createTelegramCode` writes one code per instance into the write-only settings
 * row `notifications.telegram.code`: the code, its ten-minute deadline, the user
 * it belongs to and the `getUpdates` offset of the bot. `redeemTelegramCode`
 * reads the pending updates, matches the code in a message text and stores the
 * chat id as the account of the requesting user. The row is never answered, and
 * the bot token never appears in an error, a log or an answer.
 */

type Db = Database['database']

/** The key of the linking row in the `settings` table. */
export const TELEGRAM_LINKING_KEY = 'notifications.telegram.code'

/** A code consists of six unambiguous upper-case characters. */
const CODE_LENGTH = 6
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 10 * 60 * 1000

export type TelegramLinkingErrorCode =
  | 'not_configured'
  | 'invalid_code'
  | 'code_expired'
  | 'wrong_user'
  | 'bot_unavailable'

/** A refused exchange; the route maps it to `422 invalid_request`. */
export class TelegramLinkingError extends Error {
  readonly code: TelegramLinkingErrorCode

  constructor(code: TelegramLinkingErrorCode, message: string) {
    super(message)
    this.name = 'TelegramLinkingError'
    this.code = code
  }
}

interface LinkState {
  code: string
  expiresAt: string
  userId: string
  offset: number
}

export interface TelegramCode {
  code: string
  expiresAt: string
}

interface TelegramChat {
  id: number
  username?: string
  first_name?: string
  title?: string
}

interface TelegramMessage {
  text?: string
  chat?: TelegramChat
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramUpdatesAnswer {
  ok?: boolean
  result?: TelegramUpdate[]
}

/** Generates six unambiguous characters. */
function generateCode(): string {
  let code = ''

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }

  return code
}

/** Reads the linking row; a missing or malformed value is `undefined`. */
async function readLinkState(database: Db): Promise<LinkState | undefined> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, TELEGRAM_LINKING_KEY))
    .limit(1)

  const value = row?.value

  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined
  }

  const { code, expiresAt, userId, offset } = value as Record<string, unknown>

  return {
    code: typeof code === 'string' ? code : '',
    expiresAt: typeof expiresAt === 'string' ? expiresAt : '',
    userId: typeof userId === 'string' ? userId : '',
    offset: typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 ? offset : 0,
  }
}

/** Upserts the linking row. */
async function writeLinkState(database: Db, state: LinkState): Promise<void> {
  await database
    .insert(settings)
    .values({ key: TELEGRAM_LINKING_KEY, value: state })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: state, updatedAt: new Date() },
    })
}

/** A missing token cannot reach the Bot API; the message never carries it. */
function botToken(env: Env): string {
  const token = env.TELEGRAM_BOT_TOKEN.trim()

  if (token === '') {
    throw new TelegramLinkingError('not_configured', 'Telegram bot is not configured')
  }

  return token
}

/** Extracts the code from a plain message or a `/start <code>` command. */
function messageCode(text: string): string {
  const trimmed = text.trim()
  const candidate = trimmed.startsWith('/') ? (trimmed.split(/\s+/).at(-1) ?? '') : trimmed

  return candidate.toUpperCase()
}

/**
 * Creates a six-character code that is valid for ten minutes and bound to the
 * user. An existing offset is kept, so pending updates stay acknowledged.
 */
export async function createTelegramCode(
  database: Db,
  env: Env,
  userId: string,
): Promise<TelegramCode> {
  botToken(env)

  const existing = await readLinkState(database)
  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  await writeLinkState(database, {
    code,
    expiresAt,
    userId,
    offset: existing?.offset ?? 0,
  })

  return { code, expiresAt }
}

/** Returns a non-ok Bot API answer as a typed error without the request URL. */
async function pendingUpdates(
  token: string,
  offset: number,
  fetchImpl: typeof fetch,
): Promise<TelegramUpdate[]> {
  const query = new URLSearchParams()

  if (offset > 0) {
    query.set('offset', String(offset))
  }

  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  let response: Response

  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/getUpdates${suffix}`)
  } catch {
    throw new TelegramLinkingError('bot_unavailable', 'Telegram Bot API is unreachable')
  }

  if (!response.ok) {
    throw new TelegramLinkingError(
      'bot_unavailable',
      `Telegram Bot API responded with ${response.status}`,
    )
  }

  let answer: TelegramUpdatesAnswer

  try {
    answer = (await response.json()) as TelegramUpdatesAnswer
  } catch {
    throw new TelegramLinkingError('bot_unavailable', 'Telegram Bot API answered invalid JSON')
  }

  if (answer.ok !== true || !Array.isArray(answer.result)) {
    throw new TelegramLinkingError('bot_unavailable', 'Telegram Bot API refused the request')
  }

  return answer.result
}

/** The visible label of a chat, without any secret. */
function chatLabel(chat: TelegramChat): string {
  return chat.username ?? chat.title ?? chat.first_name ?? ''
}

/**
 * Reads the pending bot updates, matches the stored code from a message text,
 * stores the chat id as the Telegram account of the user, invalidates the code
 * and advances the offset past the consumed updates.
 */
export async function redeemTelegramCode(
  database: Db,
  env: Env,
  userId: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NotificationAccount> {
  const token = botToken(env)
  const state = await readLinkState(database)

  if (state === undefined || state.code === '') {
    throw new TelegramLinkingError('invalid_code', 'No pending Telegram code')
  }

  if (state.userId !== userId) {
    throw new TelegramLinkingError('wrong_user', 'The pending code belongs to another user')
  }

  const deadline = Date.parse(state.expiresAt)

  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    await writeLinkState(database, { ...state, code: '', expiresAt: '' })
    throw new TelegramLinkingError('code_expired', 'The Telegram code has expired')
  }

  const expected = state.code.toUpperCase()

  if (code.trim().toUpperCase() !== expected) {
    throw new TelegramLinkingError('invalid_code', 'The submitted Telegram code does not match')
  }

  const updates = await pendingUpdates(token, state.offset, fetchImpl)
  const match = updates.find((update) => {
    const text = update.message?.text

    return typeof text === 'string' && messageCode(text) === expected
  })
  const chat = match?.message?.chat

  if (match === undefined || chat === undefined) {
    throw new TelegramLinkingError('invalid_code', 'The Telegram code was not found')
  }

  const account = await storeAccount(database, userId, {
    channel: 'telegram',
    externalId: String(chat.id),
    label: chatLabel(chat),
  })

  const newestUpdateId = updates.reduce((newest, update) => Math.max(newest, update.update_id), 0)

  await writeLinkState(database, {
    code: '',
    expiresAt: '',
    userId,
    offset: newestUpdateId + 1,
  })

  return account
}
