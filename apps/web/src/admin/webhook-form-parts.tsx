import { useTranslation } from 'react-i18next'
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '@stoerdesk/shared'

import { ApiError } from '../lib/api'

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

export function EventFields(props: {
  events: WebhookEventType[]
  onToggle: (event: WebhookEventType) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm text-slate-300">{t('webhooks.events')}</legend>
      {WEBHOOK_EVENT_TYPES.map((event) => (
        <label className="flex items-center gap-2 text-sm" key={event}>
          <input
            checked={props.events.includes(event)}
            onChange={() => props.onToggle(event)}
            type="checkbox"
          />
          {t(`webhooks.eventLabels.${event}`)}
        </label>
      ))}
    </fieldset>
  )
}

export function toggleEvent(
  current: WebhookEventType[],
  event: WebhookEventType,
): WebhookEventType[] {
  return current.includes(event) ? current.filter((entry) => entry !== event) : [...current, event]
}
