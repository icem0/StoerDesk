export interface NtfyConfig {
  /** Base URL of an existing ntfy server, e.g. https://ntfy.sh */
  url: string
  /** Topic notifications are published to, e.g. stoerdesk */
  topic: string
}

export interface NotificationMessage {
  title: string
  body: string
}

export class NtfyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'NtfyError'
    this.code = code
  }
}

/**
 * Sends a notification to an ntfy topic via HTTP POST.
 *
 * The message is published as JSON with a single `view` action that links to
 * the PWA. `pwaUrl` may be empty — the notification still arrives, the action
 * is just not clickable.
 */
export async function sendNtfyNotification(
  config: NtfyConfig,
  message: NotificationMessage,
  pwaUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/${config.topic}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: message.title,
      message: message.body,
      actions: [{ action: 'view', label: 'Öffnen', uri: pwaUrl }],
    }),
  })

  if (!response.ok) {
    throw new NtfyError('http_error', `ntfy responded with ${response.status}`)
  }
}
