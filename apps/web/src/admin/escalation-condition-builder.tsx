import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ESCALATION_REFERENCE_EVENTS,
  ESCALATION_SOURCES,
  ESCALATION_SYSTEM_TYPES,
  escalationConditionLeafSchema,
  type EscalationCondition,
  type EscalationMinutes,
  type EscalationReferenceEvent,
  type EscalationTimerValue,
} from '@stoerdesk/shared'
import { TICKET_PRIORITIES, TICKET_STATUS_VALUES } from '@stoerdesk/shared'

import { HelpPopover } from '../components/help-popover'

const popoverClass =
  'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400'

/** The value of a new `timer_expired` leaf: the arrival of the report and the seed delay. */
const DEFAULT_TIMER_VALUE: EscalationTimerValue = {
  reference: 'received_at',
  minutes: { low: 15, normal: 15, high: 15, critical: 15 },
}

/** The value a leaf starts with when its field changes (`stageReached`, `timer_expired`, …). */
function initialValueOf(field: string): unknown {
  switch (field) {
    case 'timer_expired':
      return DEFAULT_TIMER_VALUE
    case 'priority':
      return 'normal'
    case 'assigned':
    case 'paused':
      return true
    case 'deadlinePercent':
    case 'elapsedMinutes':
      return 0
    default:
      return ''
  }
}

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
export function conditionValue(field: string, operator: string, raw: string | string[]): unknown {
  if (operator === 'in' || operator === 'notIn') {
    const entries = Array.isArray(raw) ? raw : String(raw).split(',')

    return entries.map((entry) => entry.trim()).filter((entry) => entry !== '')
  }

  if (field === 'assigned' || field === 'paused') {
    return String(raw).trim().toLowerCase() === 'true'
  }

  if (field === 'deadlinePercent' || field === 'elapsedMinutes') {
    return Number(raw)
  }

  return String(raw).trim()
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
  stageNames,
  pools,
}: {
  initial: EscalationCondition
  canWrite: boolean
  onCondition: (next: EscalationCondition) => void
  stageNames?: Record<string, string>
  pools?: { id: string; name: string }[]
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

  /** Removes one condition and keeps the other ones. */
  function removeLeaf(position: number) {
    const removed = leaves.filter((_, index) => index !== position)

    setLeaves(removed)
    publish(buildCondition(mode, removed))
  }

  /** The selectable values of a closed field, translated for the interface language. */
  function valueOptions(field: string): { key: string; label: string }[] | undefined {
    if (field === 'assigned' || field === 'paused') {
      return [
        { key: 'true', label: t('admin.escalation.condition.boolean.true') },
        { key: 'false', label: t('admin.escalation.condition.boolean.false') },
      ]
    }

    switch (field) {
      case 'priority':
        return TICKET_PRIORITIES.map((key) => ({
          key,
          label: t(`admin.escalation.condition.values.priority.${key}`),
        }))
      case 'status':
        return TICKET_STATUS_VALUES.map((key) => ({
          key,
          label: t(`admin.escalation.condition.values.status.${key}`),
        }))
      case 'source':
        return ESCALATION_SOURCES.map((key) => ({
          key,
          label: t(`admin.escalation.condition.values.source.${key}`),
        }))
      case 'systemType':
        return ESCALATION_SYSTEM_TYPES.map((key) => ({
          key,
          label: t(`admin.escalation.condition.values.systemType.${key}`),
        }))
      case 'stageReached':
        if (stageNames) {
          return Object.entries(stageNames).map(([key, label]) => ({
            key,
            label,
          }))
        }
        return undefined
      case 'shift':
        // The readiness shift of a pool (§7.4, ADR-0030): the name of the pool
        // is what the office reads.
        return (pools ?? []).map((pool) => ({ key: pool.id, label: pool.name }))
      default:
        return undefined
    }
  }

  /**
   * The timer of a rule (ADR-0064): the start value as a select over the
   * events, the delay as the four minutes fields per priority — or, for the
   * variant of the timeline, the percentage of the ticket deadline.
   */
  function renderTimer(leaf: { field: string; operator: string; value: unknown }, index: number) {
    const value = leaf.value as EscalationTimerValue
    const percentVariant = 'percent' in value

    function saveTimer(next: EscalationTimerValue) {
      const updated = leaves.map((entry, position) =>
        position === index ? { ...entry, value: next } : entry,
      )

      setLeaves(updated)
      publish(buildCondition(mode, updated))
    }

    return (
      <div className="flex flex-wrap items-end gap-2" data-testid="escalation-timer">
        <label className="text-xs text-slate-400">
          {t('admin.escalation.condition.timer.start')}
          <select
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            value={percentVariant ? 'percent' : value.reference}
            onChange={(event) => {
              const chosen = event.target.value

              if (chosen === 'percent') {
                saveTimer({ percent: 80 })
              } else if (ESCALATION_REFERENCE_EVENTS.includes(chosen as EscalationReferenceEvent)) {
                saveTimer({
                  reference: chosen as EscalationReferenceEvent,
                  minutes:
                    'minutes' in value
                      ? value.minutes
                      : (DEFAULT_TIMER_VALUE as { minutes: EscalationMinutes }).minutes,
                })
              }
            }}
          >
            {ESCALATION_REFERENCE_EVENTS.map((event) => (
              <option key={event} value={event}>
                {t(`admin.escalation.rule.referenceEvents.${event}`)}
              </option>
            ))}
            <option value="percent">{t('admin.escalation.condition.timer.percentOfDeadline')}</option>
          </select>
        </label>
        {percentVariant ? (
          <label className="text-xs text-slate-400">
            {t('admin.escalation.condition.timer.percent')}
            <input
              className="w-24 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
              disabled={!canWrite}
              max={100}
              min={1}
              step={1}
              type="number"
              value={value.percent}
              onChange={(event) => saveTimer({ percent: Number(event.target.value) })}
            />
          </label>
        ) : (
          TICKET_PRIORITIES.map((priority) => (
            <label key={priority} className="text-xs text-slate-400">
              {t(`admin.escalation.rule.minutes.${priority}`)}
              <input
                className="w-20 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                disabled={!canWrite}
                max={10080}
                min={1}
                required
                step={1}
                type="number"
                value={value.minutes[priority]}
                onChange={(event) =>
                  saveTimer({
                    reference: value.reference,
                    minutes: { ...value.minutes, [priority]: Number(event.target.value) },
                  })
                }
              />
            </label>
          ))
        )}
        <HelpPopover
          className={popoverClass}
          label={t('help:triggerFor', { name: t('admin.escalation.condition.fields.timer_expired') })}
          text={t('help:escalation.timerMore')}
        />
      </div>
    )
  }

  function renderValue(leaf: { field: string; operator: string; value: unknown }, index: number) {
    if (leaf.field === 'timer_expired') {
      return renderTimer(leaf, index)
    }

    const options = valueOptions(leaf.field)
    const multi = leaf.operator === 'in' || leaf.operator === 'notIn'
    const current = Array.isArray(leaf.value) ? (leaf.value as string[]) : leaf.value == null ? [] : [String(leaf.value)]

    function save(next: string[]) {
      // The value of a leaf is the typed value of the field: a single value for
      // `eq` and `ne`, a list for `in` and `notIn` (`conditionValue`).
      const value = conditionValue(leaf.field, leaf.operator, multi ? next : (next[0] ?? ''))
      const updated = leaves.map((entry, position) =>
        position === index ? { ...entry, value } : entry,
      )

      setLeaves(updated)
      publish(buildCondition(mode, updated))
    }

    if (options) {
      return (
        <select
          className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
          disabled={!canWrite}
          multiple={multi}
          value={multi ? current : current[0] ?? ''}
          onChange={(event) => {
            const target = event.target as HTMLSelectElement

            save(
              multi
                ? Array.from(target.selectedOptions).map((option) => option.value)
                : [target.value],
            )
          }}
        >
          {options.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      )
    }

    if (leaf.field === 'deadlinePercent' || leaf.field === 'elapsedMinutes') {
      return (
        <input
          className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
          disabled={!canWrite}
          max={leaf.field === 'deadlinePercent' ? 100 : 1000000}
          min={0}
          step={1}
          type="number"
          value={String(leaf.value ?? '')}
          onChange={(event) => save([String(event.target.value)])}
        />
      )
    }

    return (
      <input
        className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
        disabled={!canWrite}
        value={Array.isArray(leaf.value) ? leaf.value.join(', ') : String(leaf.value)}
        onChange={(event) => save([String(event.target.value)])}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
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

                  const known = fields.find((entry) => entry.field === next)

                  if (known !== undefined) {
                    // The operator and the value of the old field do not carry over
                    // to a field of another kind: `timer_expired` has its own
                    // operators and an object as its value (ADR-0064).
                    const kindChanges = leaf.field === 'timer_expired' || next === 'timer_expired'
                    const updated = leaves.map((entry, position) =>
                      position === index
                        ? {
                            ...entry,
                            field: next,
                            operator: known.operators.includes(entry.operator)
                              ? entry.operator
                              : (known.operators[0] ?? 'eq'),
                            value: kindChanges ? initialValueOf(next) : entry.value,
                          }
                        : entry,
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
            {leaf.field === 'timer_expired' ? (
              // The timer names its own fields: a label around them would nest labels.
              renderValue(leaf, index)
            ) : (
              <label className="text-xs text-slate-400">
                {t('admin.escalation.condition.value')}
                {renderValue(leaf, index)}
              </label>
            )}
            {canWrite ? (
              <button
                className="min-h-11 rounded border border-rose-500/60 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                onClick={() => removeLeaf(index)}
                type="button"
              >
                {t('admin.escalation.condition.remove', { number: index + 1 })}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            onClick={() => {
              const added = [...leaves, { field: 'priority', operator: 'eq', value: 'normal' }]

              setLeaves(added)
              publish(buildCondition(mode, added))
            }}
            type="button"
          >
            {t('admin.escalation.condition.add')}
          </button>
        </div>
      ) : null}

      {leaves.length > 0 ? (
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
      ) : null}
    </div>
  )
}
