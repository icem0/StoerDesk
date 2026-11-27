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

/**
 * The condition builder of the escalation administration
 * (`specs/07-escalation.md` §7.4, WP-M13-15).
 *
 * A condition is a typed tree over a closed field list. The fields and their
 * operators are read from the shared contract, so the form cannot offer an
 * invalid combination; the page validates the built condition with the same
 * schema before it saves it.
 *
 * The waiting clock of a rule is the leaf `timer_expired` (ADR-0064,
 * WP-M45-03): its value is a start value with the delay per priority — or the
 * percentage of the timeline of a deadline rule — and the builder edits it in
 * a frame of its own instead of the one value field of the other leaves.
 */

const TIMER_FIELD = 'timer_expired'

/** The delay a new timer starts with: the arrival delay of ADR-0008. */
const DEFAULT_TIMER_MINUTES: EscalationMinutes = { low: 15, normal: 15, high: 15, critical: 5 }

/** The value of a timer that was just chosen as the field of a leaf. */
export function defaultTimerValue(): EscalationTimerValue {
  return { reference: 'received_at', minutes: { ...DEFAULT_TIMER_MINUTES } }
}

/** The value of a timer leaf, or the default when the leaf carries another shape. */
function timerValueOf(value: unknown): EscalationTimerValue {
  if (typeof value === 'object' && value !== null) {
    const entry = value as Record<string, unknown>

    if (typeof entry.percent === 'number') {
      return { percent: entry.percent }
    }

    if (
      typeof entry.reference === 'string' &&
      typeof entry.minutes === 'object' &&
      entry.minutes !== null
    ) {
      return {
        reference: entry.reference as EscalationReferenceEvent,
        minutes: { ...DEFAULT_TIMER_MINUTES, ...(entry.minutes as Partial<EscalationMinutes>) },
      }
    }
  }

  return defaultTimerValue()
}

const popoverClass =
  'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400'

/** The closed field list of §7.4 with the operators of each field. */
export function conditionFields(): { field: string; operators: string[] }[] {
  const alternatives = (escalationConditionLeafSchema as unknown as { options: unknown[] }).options

  return alternatives.map((entry) => {
    const shape = (
      entry as { shape: { field: { value: string }; operator: { options: string[] } } }
    ).shape

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
function leavesOf(
  condition: EscalationCondition,
): { field: string; operator: string; value: unknown }[] {
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
function buildCondition(
  mode: 'all' | 'any',
  leaves: { field: string; operator: string; value: unknown }[],
): EscalationCondition {
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
  const [mode, setMode] = useState<'all' | 'any'>('any' in initial ? 'any' : 'all')
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

  function renderValue(leaf: { field: string; operator: string; value: unknown }, index: number) {
    const options = valueOptions(leaf.field)
    const multi = leaf.operator === 'in' || leaf.operator === 'notIn'
    const current = Array.isArray(leaf.value)
      ? (leaf.value as string[])
      : leaf.value == null
        ? []
        : [String(leaf.value)]

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
          value={multi ? current : (current[0] ?? '')}
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

  /**
   * The value of a timer leaf (ADR-0064): the start value and the delay per
   * priority, or the percentage of the timeline of a deadline rule.
   */
  function renderTimer(leaf: { field: string; operator: string; value: unknown }, index: number) {
    const value = timerValueOf(leaf.value)
    const isPercent = 'percent' in value

    function save(next: EscalationTimerValue) {
      const updated = leaves.map((entry, position) =>
        position === index ? { ...entry, value: next } : entry,
      )

      setLeaves(updated)
      publish(buildCondition(mode, updated))
    }

    return (
      <fieldset
        className="flex flex-wrap items-end gap-2 rounded border border-slate-700 px-2 pb-2"
        data-testid="escalation-condition-timer"
      >
        <legend className="px-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 align-middle">
            {t('admin.escalation.condition.timer.legend')}
            <HelpPopover
              className={`${popoverClass} -my-3`}
              label={t('help:triggerFor', { name: t('admin.escalation.condition.timer.legend') })}
              text={t('help:escalation.timelineMore')}
            />
          </span>
        </legend>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.condition.timer.start')}
          <select
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            value={isPercent ? 'percent' : value.reference}
            onChange={(event) => {
              const next = event.target.value

              if (next === 'percent') {
                save({ percent: 80 })
              } else if ((ESCALATION_REFERENCE_EVENTS as readonly string[]).includes(next)) {
                save({
                  reference: next as EscalationReferenceEvent,
                  minutes: isPercent ? { ...DEFAULT_TIMER_MINUTES } : value.minutes,
                })
              }
            }}
          >
            {ESCALATION_REFERENCE_EVENTS.map((event) => (
              <option key={event} value={event}>
                {t(`admin.escalation.condition.timer.events.${event}`)}
              </option>
            ))}
            <option value="percent">{t('admin.escalation.condition.timer.events.percent')}</option>
          </select>
        </label>
        {isPercent ? (
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
              onChange={(event) => save({ percent: Number(event.target.value) })}
            />
          </label>
        ) : (
          TICKET_PRIORITIES.map((priority) => (
            <label key={priority} className="text-xs text-slate-400">
              {t(`admin.escalation.condition.timer.minutes.${priority}`)}
              <input
                className="w-20 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                disabled={!canWrite}
                max={10080}
                min={1}
                step={1}
                type="number"
                value={value.minutes[priority]}
                onChange={(event) =>
                  save({
                    reference: value.reference,
                    minutes: { ...value.minutes, [priority]: Number(event.target.value) },
                  })
                }
              />
            </label>
          ))
        )}
      </fieldset>
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

                  const target = fields.find((entry) => entry.field === next)

                  if (target !== undefined) {
                    // A timer carries its own operators and an object value; a
                    // leaf that becomes or stops being a timer starts with the
                    // first operator and a fresh value (ADR-0064).
                    const switching = (leaf.field === TIMER_FIELD) !== (next === TIMER_FIELD)
                    const updated = leaves.map((entry, position) =>
                      position !== index
                        ? entry
                        : switching
                          ? {
                              field: next,
                              operator: target.operators[0] ?? 'eq',
                              value: next === TIMER_FIELD ? defaultTimerValue() : '',
                            }
                          : { ...entry, field: next },
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

                  if (
                    fields.some(
                      (entry) => entry.field === leaf.field && entry.operators.includes(operator),
                    )
                  ) {
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
            {leaf.field === TIMER_FIELD ? (
              renderTimer(leaf, index)
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
