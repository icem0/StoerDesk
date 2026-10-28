import { createHash } from 'node:crypto'

export interface SignalConfig {
  /** Base URL of an existing signal-cli JSON-RPC bridge, e.g. https://signal.example.org */
  url: string
  /** Own number of the bridge, e.g. +49123456789 */
  source: string
  /** Recipients of the notification, e.g. ["+49123456789"] */
  recipients: string[]
}

export interface NotificationMessage {
  title: string
  body: string
}

export class SignalError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SignalError'
    this.code = code
  }
}

interface JsonRpcResponse {
  error?: { code: number; message: string }
  result?: unknown
}

/**
 * Sends notifications through signal-cli.
 *
 * The bridge exposes a JSON-RPC endpoint (POST /api/v1/rpc) with a `send`
 * method; the transport id has to be unique per request.
 */
export async function sendSignalNotification(
  config: SignalConfig,
  message: NotificationMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (config.recipients.length === 0) {
    throw new SignalError('no_recipients', 'No Signal recipients configured')
  }

  const text = `${message.title}\n${message.body}`
  const transactionId = createHash('sha256')
    .update(`${config.source}:${text}:${Date.now()}:${Math.random()}`)
    .digest('hex')

  const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/api/v1/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: transactionId,
      method: 'send',
      params: {
        message: text,
        recipient: config.recipients,
        source: config.source,
      },
    }),
  })

  if (!response.ok) {
    throw new SignalError('http_error', `signal-cli responded with ${response.status}`)
  }

  const payload = (await response.json()) as JsonRpcResponse

  if (payload.error !== undefined) {
    throw new SignalError(
      'rpc_error',
      payload.error.message ?? `signal-cli error ${payload.error.code}`,
    )
  }
}
