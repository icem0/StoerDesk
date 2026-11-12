import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  escalationConditionLeafSchema,
  type EscalationCondition,
} from '@stoerdesk/shared'

/**
 * The condition builder of the escalation administration
 * (`specs/07-escalation.md` §7.4, WP-M13-15).
 *
 * A condition is a typed tree over a closed field list. The fields and their
 * operators are read from the shared contract, so the form cannot offer an
 * invalid combination; the page validates the built condition with the same
 * schema before it saves it.
 */

/** The closed field list of §7.4 with the operators of each field. */
export function conditionFields(): { field: string; operators: string[] }[] {
  const alternatives =
    (escalationConditionLeafSchema as unknown as { options: unknown[] }).options

  return alternatives.map((entry) => {
    const shape = (entry as { shape: { field: { value: string }; operator: { options: string[] } } }).shape

    return { field: shape.field.value, operators: shape.operator.options }
  })
}

/** Splits the raw text of a value input into the typed value of a leaf. */
export function conditionValue(field: string, operator: string, raw: string): unknown {
  if (operator === 'in' || operator === 'notIn') {
    return raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
  }

  if (field === 'assigned' || field === 'paused') {
    return raw.trim().toLowerCase() === 'true'
  }

  if (field === 'deadlinePercent' || field === 'elapsedMinutes') {
    return Number(raw)
  }

  return raw.trim()
}

/** The leaves of a condition tree, in order (the tree has at most two levels). */
function leavesOf(condition: EscalationCondition): { field: string; operator: string; value: unknown }[] {
  if ('all' in condition) {
    return (condition.all as unknown[]).flatMap((child) =>
      leavesOf(child as unknown as EscalationCondition),
    )
  }

  if ('any' in condition) {
    return (condition.any as unknown[]).flatMap((child) =>
      leavesOf(child as unknown as EscalationCondition),
    )
  }

  const leaf = condition as { field?: string; operator?: string; value?: unknown }

  return [{ field: leaf.field ?? '', operator: leaf.operator ?? 'eq', value: leaf.value ?? '' }]
}

/** A condition of one group with the given leaves; no leaves means "always". */
function buildCondition(mode: 'all' | 'any', leaves: { field: string; operator: string; value: unknown }[]): EscalationCondition {
  return { [mode]: leaves } as unknown as EscalationCondition
}

export function EscalationConditionBuilder({
  initial,
  canWrite,
  onCondition,
}: {
  initial: EscalationCondition
  canWrite: boolean
  onCondition: (next: EscalationCondition) => void
}) {
  const { t } = useTranslation('settings')
  const fields = conditionFields()
  const [mode, setMode] = useState<'all' | 'any'>(
    'any' in initial ? 'any' : 'all',
  )
  const [leaves, setLeaves] = useState<{ field: string; operator: string; value: unknown }[]>(
    leavesOf(initial),
  )

  function publish(next: EscalationCondition) {
    onCondition(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-slate-400">
        {t('admin.escalation.condition.modeLabel')}
        <select
          className="w-32 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
          disabled={!canWrite}
          value={mode}
          onChange={(event) => {
            const next = event.target.value === 'any' ? 'any' : 'all'

            setMode(next)
            publish(buildCondition(next, leaves))
          }}
        >
          <option value="all">{t('admin.escalation.condition.mode.all')}</option>
          <option value="any">{t('admin.escalation.condition.mode.any')}</option>
        </select>
      </label>

      <ul className="flex flex-col gap-2" data-testid="escalation-condition-leaves">
        {leaves.map((leaf, index) => (
          <li key={`${leaf.field}-${index}`} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              {t('admin.escalation.condition.field')}
              <select
                className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                disabled={!canWrite}
                value={leaf.field}
                onChange={(event) => {
                  const next = event.target.value

                  if (fields.some((entry) => entry.field === next)) {
                    const updated = leaves.map((entry, position) =>
                      position === index ? { ...entry, field: next } : entry,
                    )

                    setLeaves(updated)
                    publish(buildCondition(mode, updated))
                  }
                }}
              >
                {fields.map((entry) => (
                  <option key={entry.field} value={entry.field}>
                    {t(`admin.escalation.condition.fields.${entry.field}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              {t('admin.escalation.condition.operator')}
              <select
                className="w-32 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                disabled={!canWrite}
                value={leaf.operator}
                onChange={(event) => {
                  const operator = event.target.value

                  if (fields.some((entry) => entry.field === leaf.field && entry.operators.includes(operator))) {
                    const updated = leaves.map((entry, position) =>
                      position === index ? { ...entry, operator } : entry,
                    )

                    setLeaves(updated)
                    publish(buildCondition(mode, updated))
                  }
                }}
              >
                {fields
                  .find((entry) => entry.field === leaf.field)
                  ?.operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {t(`admin.escalation.condition.operators.${operator}`)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              {t('admin.escalation.condition.value')}
              <input
                className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                disabled={!canWrite}
                value={Array.isArray(leaf.value) ? leaf.value.join(', ') : String(leaf.value)}
                onChange={(event) => {
                  const updated = leaves.map((entry, position) =>
                    position === index
                      ? {
                          ...entry,
                          value: conditionValue(
                            entry.field,
                            entry.operator,
                            String(event.target.value),
                          ),
                        }
                      : entry,
                  )

                  setLeaves(updated)
                  publish(buildCondition(mode, updated))
                }}
              />
            </label>
          </li>
        ))}
      </ul>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={() => {
              const added = [...leaves, { field: 'priority', operator: 'eq', value: 'normal' }]

              setLeaves(added)
              publish(buildCondition(mode, added))
            }}
            type="button"
          >
            {t('admin.escalation.condition.add')}
          </button>
          <button
            className="rounded bg-rose-800 px-3 py-2 text-sm text-rose-100 hover:bg-rose-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            disabled={leaves.length === 0}
            onClick={() => {
              const removed = leaves.slice(0, -1)

              setLeaves(removed)
              publish(buildCondition(mode, removed))
            }}
            type="button"
          >
            {t('admin.escalation.condition.remove')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
