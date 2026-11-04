import { useTranslation } from 'react-i18next'
import type { QueuedAction } from '../../lib/outbox'

type BannerRow = QueuedAction & { ageMinutes?: number }

interface OfflineActionBannerProps {
  rows: BannerRow[]
  onRetry: (row: QueuedAction) => Promise<void>
  onDiscard: (id: number) => Promise<void>
}

/**
 * Banner on the ticket detail page that lists queued, failed and conflict
 * outbox rows of this ticket (`WP-M5-06`). Every row offers a retry; conflict
 * rows additionally offer discard. Queued and failed rows are never discarded
 * from here — the user retries them instead.
 */
export function OfflineActionBanner({ rows, onRetry, onDiscard }: OfflineActionBannerProps) {
  const { t } = useTranslation('ticket')

  if (rows.length === 0) {
    return null
  }

  const actionLabel = (action: QueuedAction['action']) => {
    switch (action) {
      case 'acknowledge':
        return t('detail.offlineAction.acknowledge')
      case 'comment':
        return t('detail.offlineAction.comment')
      case 'decline':
        return t('detail.offlineAction.decline')
    }
  }

  const statusLabel = (status: QueuedAction['status']) => {
    switch (status) {
      case 'queued':
        return t('detail.offlineStatus.queued')
      case 'failed':
        return t('detail.offlineStatus.failed')
      case 'conflict':
        return t('detail.offlineStatus.conflict')
      case 'sending':
        return t('detail.offlineStatus.sending')
      case 'sent':
        return t('detail.offlineStatus.sent')
    }
  }

  return (
    <div className="rounded bg-amber-900/20 border border-amber-500/30 p-3">
      <p className="text-sm font-medium text-amber-200 mb-2">
        {t('detail.offlineTitle')}
      </p>
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-baseline gap-2 text-sm mb-1">
          <span className="text-slate-300">{actionLabel(row.action)}</span>
          <span className="text-xs text-slate-500">{statusLabel(row.status)}</span>
          <span className="text-xs text-slate-500">
            {t('detail.offlineAge', { minutes: row.ageMinutes ?? 0 })}
          </span>
          {row.status === 'conflict' && (
            <span className="text-xs text-rose-400">
              {t('detail.offlineConflict', {
                code: row.error_code ?? 'unknown',
                status: row.ticket_status ?? 'unknown',
              })}
            </span>
          )}
          <button
            type="button"
            className="rounded bg-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-500"
            onClick={() => void onRetry(row)}
          >
            {t('detail.offlineAction.retry')}
          </button>
          {row.status === 'conflict' && row.id !== undefined && (
            <button
              type="button"
              className="rounded bg-rose-600 px-2 py-1 text-xs text-slate-200 hover:bg-rose-500"
              onClick={() => void onDiscard(row.id as number)}
            >
              {t('detail.offlineAction.discard')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
