import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ticketStatusCreateRequestSchema,
  ticketStatusUpdateRequestSchema,
  type TicketStatusCreateRequest,
  type TicketStatusResponse,
  type TicketStatusUpdateRequest,
} from '@stoerdesk/shared'

/**
 * The create and edit form of the status administration (WP-M14-37).
 *
 * One form serves both directions: without a `status` it creates a new status
 * (the key is part of the body), with a `status` it edits that row and the key
 * stays immutable — the workflow, the escalation stages and the tickets
 * reference it. Every submit is validated against the shared Zod schema of
 * `specs/07-escalation.md` §7.9 before the administration API sees the body.
 */

export function StatusForm({
  status,
  canWrite,
  onSave,
}: {
  status: TicketStatusResponse | null
  canWrite: boolean
  onSave: (body: TicketStatusCreateRequest | TicketStatusUpdateRequest) => void
}) {
  const { t } = useTranslation('settings')
  const [values, setValues] = useState({
    key: status?.key ?? '',
    nameDe: status?.nameDe ?? '',
    nameEn: status?.nameEn ?? '',
    color: status?.color ?? '#6b7280',
    position: status?.position ?? 0,
    active: status?.active ?? true,
    isTerminal: status?.isTerminal ?? false,
  })
  const [attempted, setAttempted] = useState(false)

  const editBody: TicketStatusUpdateRequest = {
    nameDe: values.nameDe,
    nameEn: values.nameEn,
    color: values.color,
    position: values.position,
    active: values.active,
    isTerminal: values.isTerminal,
  }
  const body: TicketStatusCreateRequest | TicketStatusUpdateRequest =
    status === null ? { key: values.key, ...editBody } : editBody

  const schema =
    status === null ? ticketStatusCreateRequestSchema : ticketStatusUpdateRequestSchema
  const valid = schema.safeParse(body).success

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()

        if (valid) {
          onSave(body)
        } else {
          setAttempted(true)
        }
      }}
    >
      <h2 className="text-lg font-semibold">
        {status === null
          ? t('admin.status.createTitle')
          : t('admin.status.editTitle', { key: status.key })}
      </h2>

      {status === null ? (
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {t('admin.status.fields.key')}
          <input
            className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.key}
            onChange={(event) =>
              setValues((current) => ({ ...current, key: event.target.value }))
            }
          />
        </label>
      ) : (
        /*
          The key of an existing status is immutable — the workflow, the
          escalation stages and the tickets reference it. The edit shows it
          beside the names of every language (ADR-0043).
        */
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          {t('admin.status.fields.key')}
          <input
            className="w-40 rounded bg-slate-950 p-2 font-mono text-sm text-slate-100 read-only:opacity-60"
            readOnly
            type="text"
            value={values.key}
          />
        </label>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.nameDe')}
          <input
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.nameDe}
            onChange={(event) =>
              setValues((current) => ({ ...current, nameDe: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.nameEn')}
          <input
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.nameEn}
            onChange={(event) =>
              setValues((current) => ({ ...current, nameEn: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.color')}
          <input
            className="w-28 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            type="text"
            value={values.color}
            onChange={(event) =>
              setValues((current) => ({ ...current, color: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.position')}
          <input
            className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            max={999}
            min={0}
            step={1}
            type="number"
            value={values.position}
            onChange={(event) =>
              setValues((current) => ({ ...current, position: Number(event.target.value) }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.active')}
          <input
            className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            checked={values.active}
            disabled={!canWrite}
            type="checkbox"
            onChange={(event) =>
              setValues((current) => ({ ...current, active: event.target.checked }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.status.fields.isTerminal')}
          <input
            className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            checked={values.isTerminal}
            disabled={!canWrite}
            type="checkbox"
            onChange={(event) =>
              setValues((current) => ({ ...current, isTerminal: event.target.checked }))
            }
          />
        </label>
      </div>

      {attempted && !valid ? (
        <p role="alert" className="text-sm text-red-400">
          {t('admin.status.errors.invalid_request')}
        </p>
      ) : null}

      <button
        className="min-h-11 rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
        disabled={values.nameDe === ''}
        type="submit"
      >
        {status === null ? t('admin.status.create') : t('admin.status.save')}
      </button>
    </form>
  )
}
