import { useTranslation } from 'react-i18next'

/**
 * The pool of the office (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-06): the ordered list of the technicians a ticket may be assigned to.
 *
 * The order of the list is the order of the refusal chain — a technician who
 * declines passes the ticket to the next member. The list is edited with the
 * buttons _up_ and _down_, a member is removed from the list and a technician
 * is added at its end.
 */

export type AssigneePoolMember = { id: string; name: string }

export function EscalationAssigneePool({
  pool,
  users,
  canWrite,
  onPool,
}: {
  pool: AssigneePoolMember[]
  users: AssigneePoolMember[]
  canWrite: boolean
  onPool: (next: AssigneePoolMember[]) => void
}) {
  const { t } = useTranslation('settings')

  const candidates = users.filter(
    (user) => !pool.some((member) => member.id === user.id),
  )

  function move(index: number, offset: number) {
    const target = index + offset

    if (target < 0 || target >= pool.length) {
      return
    }

    const next = [...pool]
    const [moved] = next.splice(index, 1)

    if (moved === undefined) {
      return
    }

    next.splice(target, 0, moved)
    onPool(next)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="escalation-assignee-pool">
      <p className="text-sm text-slate-400">{t('admin.escalation.pool.hint')}</p>

      <ol className="flex flex-col gap-2">
        {pool.map((member, index) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-900 p-2"
          >
            <span className="text-sm text-slate-200">{member.name}</span>
            {canWrite ? (
              <>
                <button
                  data-testid={`escalation-pool-up-${index}`}
                  className="min-h-11 rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  {t('admin.escalation.pool.up')}
                </button>
                <button
                  data-testid={`escalation-pool-down-${index}`}
                  className="min-h-11 rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  disabled={index === pool.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  {t('admin.escalation.pool.down')}
                </button>
                <button
                  data-testid={`escalation-pool-remove-${index}`}
                  className="min-h-11 rounded border border-rose-500/60 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/40"
                  onClick={() => onPool(pool.filter((entry) => entry.id !== member.id))}
                  type="button"
                >
                  {t('admin.escalation.pool.remove')}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ol>

      {pool.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="escalation-pool-empty">
          {t('admin.escalation.pool.empty')}
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            {t('admin.escalation.pool.add')}
            <select
              data-testid="escalation-pool-add"
              className="w-64 rounded bg-slate-950 p-2 text-sm text-slate-100"
              defaultValue=""
              onChange={(event) => {
                const id = event.target.value

                if (id === '') {
                  return
                }

                const user = candidates.find((entry) => entry.id === id)

                if (user !== undefined) {
                  onPool([...pool, user])
                }

                event.target.value = ''
              }}
            >
              <option value="">{t('admin.escalation.pool.choose')}</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  )
}
