export interface MatrixConfig {
  /** Base URL of an existing Matrix homeserver, e.g. https://matrix.org */
  homeserver: string
  /** Room ID, e.g. !abcdef:example.org */
  roomId: string
  /** Access token of the sending user */
  accessToken: string
}

export interface NotificationMessage {
  title: string
  body: string
}

export class MatrixError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'MatrixError'
    this.code = code
  }
}

/**
 * Sends notifications to a Matrix room via the client-server API.
 *
 * The transaction id has to be unique per message, otherwise the homeserver
 * rejects the request.
 */
export async function sendMatrixNotification(
  config: MatrixConfig,
  message: NotificationMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const homeserver = config.homeserver.replace(/\/$/, '')
  const roomId = encodeURIComponent(config.roomId)
  const transactionId = `stoerdesk-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const response = await fetchImpl(
    `${homeserver}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${transactionId}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: `${message.title}\n${message.body}`,
      }),
    },
  )

  if (!response.ok) {
    throw new MatrixError('http_error', `Matrix homeserver responded with ${response.status}`)
  }
}
