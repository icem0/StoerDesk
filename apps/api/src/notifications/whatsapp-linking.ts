import { storeAccount } from './accounts'
import type { NotificationAccount } from '@stoerdesk/shared'
import type { Database } from '../db/client'

/**
 * The WhatsApp Web account linking over the external bridge of the operator
 * (`specs/10-notifications.md` §11.3, §11.6, §11.11, §11.13, WP-M14-15). ADR-0020
 * keeps the session and the pairing inside the bridge: StörDesk never pairs a
 * browser, it only reads the chats of the bridge with `GET {baseUrl}/status`
 * (`§11.6`) and stores the chat id the user picked as the account of the user
 * (`storeWhatsAppAccount` over `storeAccount` of WP-M14-08). A bridge that is not
 * reachable answers `{ connected: false, chats: [] }` and never an error of the
 * administration — the same rule the bridge bearer obeys in the adapter of
 * WP-M14-14: the bearer travels only over the request to the bridge and never
 * into an answer, a log or an error message (ADR-0005 rule, §11.13).
 */

type Db = Database['database']

/** The bridge of the channel configuration: the base URL and its write-only bearer. */
export interface BridgeConfig {
  baseUrl: string
  token: string
}

/** One chat the bridge reports, e.g. `{ id, label }` of §11.6. */
export interface BridgeChat {
  id: string
  label: string
}

/** The state of the bridge: connected or not and the chats it knows. */
export interface BridgeStatus {
  connected: boolean
  chats: BridgeChat[]
}

/** The raw answer of `GET {baseUrl}/status` — narrowed field by field. */
interface StatusAnswer {
  connected?: unknown
  chats?: unknown
}

interface StatusChat {
  id?: unknown
  label?: unknown
}

/** The machine-readable code of a refused linking; the route maps it to 422. */
export type WhatsAppLinkingErrorCode = 'unknown_chat'

/** A refused chat; the message never carries the bridge bearer. */
export class WhatsAppLinkingError extends Error {
  readonly code: WhatsAppLinkingErrorCode

  constructor(code: WhatsAppLinkingErrorCode, message: string) {
    super(message)
    this.name = 'WhatsAppLinkingError'
    this.code = code
  }
}

/** Keeps only the string fields of one chat; anything else drops the chat. */
function toChat(chat: StatusChat): BridgeChat | undefined {
  if (typeof chat.id !== 'string' || chat.id === '') {
    return undefined
  }

  return {
    id: chat.id,
    label: typeof chat.label === 'string' ? chat.label : '',
  }
}

/**
 * Reads the state of the bridge over `GET {baseUrl}/status` with the bearer of
 * the channel. A missing base URL, an unreachable bridge, a non-ok answer and an
 * answer that is no JSON all mean `{ connected: false, chats: [] }` — never an
 * error of the administration (§11.6). The bearer never enters a message.
 */
export async function readBridgeStatus(
  config: BridgeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeStatus> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')

  if (baseUrl === '') {
    return { connected: false, chats: [] }
  }

  let response: Response

  try {
    response = await fetchImpl(
      `${baseUrl}/status`,
      config.token === ''
        ? {}
        : { headers: { authorization: `Bearer ${config.token}` } },
    )
  } catch {
    return { connected: false, chats: [] }
  }

  if (!response.ok) {
    return { connected: false, chats: [] }
  }

  let answer: StatusAnswer

  try {
    answer = (await response.json()) as StatusAnswer
  } catch {
    return { connected: false, chats: [] }
  }

  const chats = Array.isArray(answer.chats) ? answer.chats : []
  const known = chats.flatMap((chat) => {
    const chatEntry = toChat(chat as StatusChat)

    return chatEntry === undefined ? [] : [chatEntry]
  })

  return { connected: answer.connected === true, chats: known }
}

/**
 * Reads the chats of the bridge and stores the picked chat id as the WhatsApp
 * account of the user. A chat the bridge does not know — an unreachable bridge
 * included — is refused with `unknown_chat` and nothing is stored (§11.3,
 * §11.11). The account carries no secret: `externalId` is the chat id and the
 * label is the label the bridge gave the chat.
 */
export async function storeWhatsAppAccount(
  database: Db,
  userId: string,
  chatId: string,
  config: BridgeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<NotificationAccount> {
  const status = await readBridgeStatus(config, fetchImpl)
  const chat = status.chats.find((candidate) => candidate.id === chatId)

  if (chat === undefined) {
    throw new WhatsAppLinkingError('unknown_chat', 'The bridge does not know this chat')
  }

  return storeAccount(database, userId, {
    channel: 'whatsapp',
    externalId: chat.id,
    label: chat.label,
  })
}
