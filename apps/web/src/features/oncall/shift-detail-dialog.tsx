import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toZonedTime } from 'date-fns-tz'
import type {
  OnCallShift,
  OnCallShiftHistoryEntry,
  OnCallShiftHistoryResponse,
} from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { ShiftAdminActions } from './shift-admin-actions'

/**
 * The details of one shift with its append-only history
 * (`specs/04-oncall.md` §4a.10, WP-M14-154b).
 *
 * The dialog opens from a row of the readiness calendar and from an own shift
 * card. It reads `GET /api/v1/oncall/shifts/:id/history` and names every step
 * with its local time, the acting person and — when the event carries one —
 * the referenced person, the state transition and the reason of a decline.
 * Without `oncall.read_names` the dialog names no person and reads the
 * technician as "besetzt" or "nicht besetzt" (WP-M14-131/132).
 */

const STEP_KEYS = [
  'shift_created',
  'shift_updated',
  'shift_updated_assigned',
  'shift_updated_published',
  'confirmed',
  'declined',
  'swap_requested',
  'swap_accepted',
  'swap_approved',
  'swap_rejected',
  'swap_cancelled',
  'shift_deleted',
  'offered',
  'offer_escalated',
] as const

type StepKey = (typeof STEP_KEYS)[number]

function formatLocal(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: ONCALL_TIMEZONE,
  }).format(toZonedTime(value, ONCALL_TIMEZONE))
}

function memberName(member: { givenName: string; familyName: string; email: string }): string {
  const name = `${member.givenName} ${member.familyName}`.trim()

  return name === '' ? member.email : name
}

export function ShiftDetailDialog(props: {
  shift: OnCallShift
  poolName: string | null
  showNames: boolean
  onClose: () => void
  /** Called after an action of the admin, so the page reads the plan again. */
  onChanged?: () => void
}) {
  const { t, i18n } = useTranslation('oncall')
  const titleId = `shift-detail-title-${props.shift.id}`
  const history = useQuery({
    queryKey: ['oncall', 'shift-history', props.shift.id],
    queryFn: () =>
      apiFetch<OnCallShiftHistoryResponse>(
        `/v1/oncall/shifts/${props.shift.id}/history`,
      ),
    retry: false,
  })

  const technician =
    props.showNames && props.shift.technician
      ? memberName(props.shift.technician)
      : props.shift.userId === null
        ? t('readiness.unassigned')
        : t('readiness.assigned')

  const stepLabel = (entry: OnCallShiftHistoryEntry): string => {
    let key: StepKey = entry.type as StepKey

    if (entry.type === 'shift_updated') {
      if (entry.person !== null) {
        key = 'shift_updated_assigned'
      } else if (entry.fromState === 'DRAFT' && entry.toState === 'PLANNED') {
        key = 'shift_updated_published'
      }
    }

    return STEP_KEYS.includes(key)
      ? t(`admin.shiftDetail.steps.${key}`)
      : t('admin.shiftDetail.unknownStep')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          props.onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold" id={titleId}>
            {t('admin.shiftDetail.title')}
          </h2>
          <button
            aria-label={t('admin.shiftDetail.close')}
            className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            onClick={props.onClose}
            type="button"
          >
            {t('admin.shiftDetail.close')}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-400">{t('admin.shiftDetail.state')}</dt>
          <dd>{t(`admin.state.${props.shift.state}`)}</dd>
          <dt className="text-slate-400">{t('admin.shiftDetail.pool')}</dt>
          <dd>{props.poolName ?? '—'}</dd>
          <dt className="text-slate-400">{t('admin.shiftDetail.period')}</dt>
          <dd>
            {formatLocal(new Date(props.shift.startsAt), i18n.language)} –{' '}
            {formatLocal(new Date(props.shift.endsAt), i18n.language)}
          </dd>
          <dt className="text-slate-400">{t('admin.shiftDetail.technician')}</dt>
          <dd>{technician}</dd>
        </dl>

        <ShiftAdminActions onChanged={props.onChanged} shift={props.shift} />

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-300">
          {t('admin.shiftDetail.history')}
        </h3>

        {history.isPending ? (
          <p className="mt-2 text-sm text-slate-400">{t('admin.loading')}</p>
        ) : null}
        {history.isError ? (
          <p className="mt-2 text-sm text-rose-400" role="alert">
            {t('admin.shiftDetail.error')}
          </p>
        ) : null}
        {history.data?.events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t('admin.shiftDetail.empty')}</p>
        ) : null}

        {history.data && history.data.events.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-2">
            {history.data.events.map((entry) => (
              <li
                className="rounded border border-slate-800 bg-slate-950/60 p-2 text-sm"
                key={entry.id}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-200">{stepLabel(entry)}</span>
                  <span className="text-xs text-slate-400">
                    {formatLocal(new Date(entry.createdAt), i18n.language)}
                  </span>
                </div>
                {props.showNames && entry.actor !== null ? (
                  <p className="text-xs text-slate-400">
                    {t('admin.shiftDetail.actor')}: {memberName(entry.actor)}
                  </p>
                ) : null}
                {props.showNames && entry.person !== null ? (
                  <p className="text-xs text-slate-400">
                    {t('admin.shiftDetail.person')}: {memberName(entry.person)}
                  </p>
                ) : null}
                {entry.fromState !== null || entry.toState !== null ? (
                  <p className="text-xs text-slate-400">
                    {t('admin.shiftDetail.transition')}:{' '}
                    {entry.fromState === null ? '—' : t(`admin.state.${entry.fromState}`)} →{' '}
                    {entry.toState === null ? '—' : t(`admin.state.${entry.toState}`)}
                  </p>
                ) : null}
                {entry.reason !== null ? (
                  <p className="text-xs text-slate-400">
                    {t('admin.shiftDetail.reason')}: {entry.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}
