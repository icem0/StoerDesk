import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ESCALATION_ACTION_TYPES, type EscalationActionConfig, type EscalationCondition } from '@stoerdesk/shared'

import { EscalationConditionBuilder } from './escalation-condition-builder'

/**
 * The action editor of the escalation administration
 * (`specs/07-escalation.md` §7.5, WP-M13-16).
 *
 * An action has a type (`notify`, `webhook`, `history`), its configuration —
 * the configured channels of the installation for a `notify` action, the
 * webhook endpoints of the administration for a `webhook` action, the note
 * text for a `history` action — and its own condition, built with the
 * condition builder of WP-M13-15. The order of the actions is the order of the
 * dispatcher and is changed by drag and drop.
 */

type ActionShape = {
  key: string
  type: string
  channels?: string[]
  endpointIds?: string[]
  text?: string
  condition: unknown
}

/** The current selection of a multi-select, with the raw value as a fallback. */
function selectionOf(event: { target: unknown }): string[] {
  const target = event.target as { selectedOptions?: Iterable<unknown>; value?: unknown }
  const selected = Array.from(target.selectedOptions ?? []).map(
    (option) => (option as { value: string }).value,
  )

  if (selected.length > 0) {
    return selected
  }

  return typeof target.value === 'string'
    ? target.value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
    : []
}

function shapeOf(action: EscalationActionConfig): ActionShape {
  return {
    key: action.key,
    type: action.type,
    channels: 'channels' in action ? action.channels : [],
    endpointIds: 'endpointIds' in action ? action.endpointIds : [],
    text: 'text' in action ? action.text : '',
    condition: action.condition,
  }
}

function actionOf(shape: ActionShape): EscalationActionConfig {
  const condition = shape.condition as unknown as Record<string, unknown>

  if (shape.type === 'webhook') {
    return {
      key: shape.key,
      type: 'webhook',
      endpointIds: shape.endpointIds ?? [],
      condition,
    } as unknown as EscalationActionConfig
  }

  if (shape.type === 'history') {
    return {
      key: shape.key,
      type: 'history',
      text: shape.text ?? '',
      condition,
    } as unknown as EscalationActionConfig
  }

  return {
    key: shape.key,
    type: 'notify',
    channels: shape.channels ?? [],
    condition,
  } as unknown as EscalationActionConfig
}

export function EscalationActionEditor({
  initial,
  channels,
  endpointIds,
  canWrite,
  onActions,
}: {
  initial: EscalationActionConfig[]
  channels: string[]
  endpointIds: string[]
  canWrite: boolean
  onActions: (next: EscalationActionConfig[]) => void
}) {
  const { t } = useTranslation('settings')
  const [actions, setActions] = useState<ActionShape[]>(initial.map(shapeOf))
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function publish(next: ActionShape[]) {
    setActions(next)
    onActions(next.map(actionOf))
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3" data-testid="escalation-action-list">
        {actions.map((action, index) => (
          <li
            key={`${action.key}-${index}`}
            draggable={canWrite}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              if (canWrite) {
                event.preventDefault()
              }
            }}
            onDrop={(event) => {
              event.preventDefault()

              if (canWrite && dragIndex !== null && dragIndex !== index) {
                const next = [...actions]
                const [moved] = next.splice(dragIndex, 1)

                if (moved !== undefined) {
                  next.splice(index, 0, moved)
                }

                publish(next)
              }

              setDragIndex(null)
            }}
            className="rounded border p-3 border-slate-700 bg-slate-900"
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-400">
                {t('admin.escalation.action.type')}
                <select
                  className="w-32 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  value={action.type}
                  onChange={(event) => {
                    const type = event.target.value

                    if ((ESCALATION_ACTION_TYPES as readonly string[]).includes(type)) {
                      publish(
                        actions.map((entry, position) =>
                          position === index ? { ...entry, type } : entry,
                        ),
                      )
                    }
                  }}
                >
                  {(ESCALATION_ACTION_TYPES as readonly string[]).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-slate-400">
                {t('admin.escalation.action.key')}
                <input
                  className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  required
                  value={action.key}
                  onChange={(event) =>
                    publish(
                      actions.map((entry, position) =>
                        position === index ? { ...entry, key: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </label>

              {action.type === 'notify' ? (
                <label className="text-xs text-slate-400">
                  {t('admin.escalation.action.channels')}
                  <select
                    multiple
                    size={Math.max(2, channels.length)}
                    className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                    disabled={!canWrite}
                    value={action.channels ?? []}
                    onChange={(event) =>
                      publish(
                        actions.map((entry, position) =>
                          position === index
                            ? {
                                ...entry,
                                channels: selectionOf(event),
                              }
                            : entry,
                        ),
                      )
                    }
                  >
                    {channels.map((channel) => (
                      <option key={channel} value={channel}>
                        {channel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {action.type === 'webhook' ? (
                <label className="text-xs text-slate-400">
                  {t('admin.escalation.action.endpoints')}
                  <select
                    multiple
                    size={Math.max(2, endpointIds.length)}
                    className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                    disabled={!canWrite}
                    value={action.endpointIds ?? []}
                    onChange={(event) =>
                      publish(
                        actions.map((entry, position) =>
                          position === index
                            ? {
                                ...entry,
                                endpointIds: selectionOf(event),
                              }
                            : entry,
                        ),
                      )
                    }
                  >
                    {endpointIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {action.type === 'history' ? (
                <label className="text-xs text-slate-400">
                  {t('admin.escalation.action.text')}
                  <input
                    className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                    disabled={!canWrite}
                    value={action.text ?? ''}
                    onChange={(event) =>
                      publish(
                        actions.map((entry, position) =>
                          position === index ? { ...entry, text: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
            </div>

            <EscalationConditionBuilder
              initial={action.condition as unknown as EscalationCondition}
              canWrite={canWrite}
              onCondition={(next) =>
                publish(
                  actions.map((entry, position) =>
                    position === index ? { ...entry, condition: next ?? { all: [] } } : entry,
                  ),
                )
              }
            />
          </li>
        ))}
      </ol>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={() =>
              publish([...actions, { key: `action_${actions.length + 1}`, type: 'notify', channels: [], condition: { all: [] } }])
            }
            type="button"
          >
            {t('admin.escalation.action.add')}
          </button>
          <button
            className="rounded bg-rose-800 px-3 py-2 text-sm text-rose-100 hover:bg-rose-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            disabled={actions.length === 0}
            onClick={() => publish(actions.slice(0, -1))}
            type="button"
          >
            {t('admin.escalation.action.remove')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
