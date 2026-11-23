import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ESCALATION_ACTION_TYPES,
  ESCALATION_NOTIFY_PRIORITIES,
  ticketStatusKeySchema,
  type EscalationActionConfig,
  type EscalationCondition,
  type EscalationNotifyPriority,
} from '@stoerdesk/shared'

import { EscalationConditionBuilder } from './escalation-condition-builder'

/**
 * The action editor of the escalation administration
 * (`specs/07-escalation.md` §7.5, WP-M13-16).
 *
 * An action has a type (`notify`, `webhook`, `history`), its configuration —
 * the configured channels of the installation for a `notify` action **without
 * a target**, the webhook endpoints of the administration for a `webhook`
 * action, the note text for a `history` action — and its own condition, built
 * with the condition builder of WP-M13-15. The order of the actions is the
 * order of the dispatcher and is changed by drag and drop.
 *
 * A `notify` action **with** a target names the recipient — a technician, a
 * readiness pool or the technicians of the ticket — and leaves the way of the
 * message to them: they receive it over the channels they selected themselves
 * (ADR-0037). The editor therefore shows the channels only without a target.
 */

type ActionShape = {
  key: string
  type: string
  channels?: string[]
  endpointIds?: string[]
  text?: string
  toStatus?: string
  targetKind?: 'user' | 'pool' | 'group' | 'assigned'
  targetId?: string
  /** The mode of an `assign` action (`pool` or `user`, ADR-0039). */
  mode?: 'pool' | 'user'
  /** The technician of the mode `user`. */
  user?: string
  /** The flag _Annahme erforderlich_ of an `assign` action. */
  acceptance?: boolean
  priority?: string
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
  const mode = 'mode' in action && action.mode === 'user' ? 'user' : 'pool'

  return {
    key: 'key' in action && typeof action.key === 'string' ? action.key : '',
    type: action.type,
    channels: 'channels' in action ? action.channels : [],
    endpointIds: 'endpointIds' in action ? action.endpointIds : [],
    text: 'text' in action ? action.text : '',
    toStatus: 'toStatus' in action ? action.toStatus : '',
    targetKind:
      'target' in action && action.target !== undefined
        ? action.target.kind
        : action.type === 'notify'
          ? 'user'
          : 'pool',
    targetId:
      'target' in action && action.target !== undefined && 'id' in action.target
        ? action.target.id
        : '',
    mode,
    user: 'user' in action && typeof action.user === 'string' ? action.user : '',
    acceptance: 'acceptance' in action ? action.acceptance !== false : true,
    priority: 'priority' in action ? action.priority : '',
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
      ...(shape.key === '' ? {} : { key: shape.key }),
      type: 'history',
      text: shape.text ?? '',
      condition,
    } as unknown as EscalationActionConfig
  }

  if (shape.type === 'status_change') {
    return {
      key: shape.key,
      type: 'status_change',
      toStatus: shape.toStatus ?? '',
      condition,
    } as unknown as EscalationActionConfig
  }

  if (shape.type === 'offer') {
    return {
      key: shape.key,
      type: shape.type,
      target: { kind: shape.targetKind ?? 'pool', id: shape.targetId ?? '' },
      condition,
    } as unknown as EscalationActionConfig
  }

  if (shape.type === 'assign') {
    // The assignment names one technician (§7.14, ADR-0039): the first member
    // of the pool of the office or a fixed technician.
    const mode = shape.mode ?? 'pool'

    return {
      key: shape.key,
      type: shape.type,
      mode,
      ...(mode === 'user' ? { user: shape.user ?? '' } : {}),
      acceptance: shape.acceptance !== false,
      condition,
    } as unknown as EscalationActionConfig
  }

  const targeted = shape.targetKind === 'assigned' || (shape.targetId ?? '') !== ''

  return {
    key: shape.key,
    type: 'notify',
    // A `notify` action with a target carries no channels: the way of the
    // message belongs to the recipient (ADR-0037). Without a target the
    // channels of the installation are the way of the broadcast.
    ...(targeted ? {} : { channels: shape.channels ?? [] }),
    // The target `assigned` names the technicians of the ticket and carries
    // no id (`specs/07-escalation.md` §7.14, ADR-0033).
    ...(shape.targetKind === 'assigned'
      ? { target: { kind: 'assigned' } }
      : targeted
        ? { target: { kind: shape.targetKind ?? 'user', id: shape.targetId } }
        : {}),
    ...(shape.priority === undefined || shape.priority === ''
      ? {}
      : { priority: shape.priority as EscalationNotifyPriority }),
    condition,
  } as unknown as EscalationActionConfig
}

export function EscalationActionEditor({
  initial,
  channels,
  endpointIds,
  statuses,
  pools,
  groups,
  users,
  canWrite,
  onActions,
}: {
  initial: EscalationActionConfig[]
  channels: string[]
  endpointIds: string[]
  statuses: string[]
  pools: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  users: { id: string; name: string }[]
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

  function targetsOf(action: ActionShape): { id: string; name: string }[] {
    if (action.type === 'notify') {
      return action.targetKind === 'pool' ? pools : users
    }

    if (action.targetKind === 'group') {
      return groups
    }

    return action.targetKind === 'user' ? users : pools
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
              <span className="self-center text-sm font-medium text-slate-200">
                {t('admin.escalation.action.number', { number: index + 1 })}
              </span>

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
                          position === index
                            ? {
                                ...entry,
                                type,
                                key:
                                  type === 'history'
                                    ? ''
                                    : entry.key === ''
                                      ? `action_${index + 1}`
                                      : entry.key,
                                targetKind: type === 'notify' ? 'user' : 'pool',
                                targetId: '',
                              }
                            : entry,
                        ),
                      )
                    }
                  }}
                >
                  {(ESCALATION_ACTION_TYPES as readonly string[]).map((type) => (
                    <option key={type} value={type}>
                      {t(`admin.escalation.action.types.${type}`)}
                    </option>
                  ))}
                </select>
              </label>

              {action.type === 'notify' ? (
                <>
                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.action.targetKind')}
                    <select
                      data-testid="escalation-notify-target-kind"
                      className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={action.targetKind ?? 'user'}
                      onChange={(event) => {
                        const kind =
                          event.target.value === 'pool'
                            ? 'pool'
                            : event.target.value === 'assigned'
                              ? 'assigned'
                              : 'user'

                        publish(
                          actions.map((entry, position) =>
                            position === index
                              ? { ...entry, targetKind: kind, targetId: '' }
                              : entry,
                          ),
                        )
                      }}
                    >
                      <option value="user">
                        {t('admin.escalation.action.targetKinds.user')}
                      </option>
                      <option value="pool">
                        {t('admin.escalation.action.targetKinds.pool')}
                      </option>
                      <option value="assigned">
                        {t('admin.escalation.action.targetKinds.assigned')}
                      </option>
                    </select>
                  </label>

                  {action.targetKind === 'assigned' ? (
                    <p className="text-xs text-slate-500">
                      {t('admin.escalation.action.targetAssigned')}
                    </p>
                  ) : (
                    <label className="text-xs text-slate-400">
                      {t('admin.escalation.action.target')}
                      <select
                        data-testid="escalation-notify-target"
                        className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                        disabled={!canWrite}
                        value={action.targetId ?? ''}
                        onChange={(event) =>
                          publish(
                            actions.map((entry, position) =>
                              position === index
                                ? { ...entry, targetId: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      >
                        <option value="">
                          {t('admin.escalation.action.targetChannels')}
                        </option>
                        {targetsOf(action).map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.action.priority')}
                    <select
                      data-testid="escalation-notify-priority"
                      className="w-32 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={action.priority ?? ''}
                      onChange={(event) =>
                        publish(
                          actions.map((entry, position) =>
                            position === index
                              ? { ...entry, priority: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="">{t('admin.escalation.action.ticketPriority')}</option>
                      {ESCALATION_NOTIFY_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {t(`admin.escalation.action.priorities.${priority}`)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(action.targetKind ?? 'user') === 'assigned' ||
                  (action.targetId ?? '') !== '' ? (
                    <p className="text-xs text-slate-500">
                      {t('admin.escalation.action.notifyHint')}
                    </p>
                  ) : (
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
                            {t(`admin.escalation.action.channelLabels.${channel}`, { defaultValue: channel })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
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

              {action.type === 'status_change' ? (
                <label className="text-xs text-slate-400">
                  {t('admin.escalation.action.statusTarget')}
                  <select
                    data-testid="escalation-action-status-target"
                    className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                    disabled={!canWrite}
                    value={action.toStatus ?? ''}
                    onChange={(event) => {
                      const toStatus = event.target.value

                      if (ticketStatusKeySchema.safeParse(toStatus).success) {
                        publish(
                          actions.map((entry, position) =>
                            position === index ? { ...entry, toStatus } : entry,
                          ),
                        )
                      }
                    }}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {action.type === 'offer' ? (
                <>
                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.action.targetKind')}
                    <select
                      data-testid="escalation-action-target-kind"
                      className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={action.targetKind ?? 'pool'}
                      onChange={(event) => {
                        const kind =
                          event.target.value === 'group'
                            ? 'group'
                            : event.target.value === 'user'
                              ? 'user'
                              : 'pool'

                        publish(
                          actions.map((entry, position) =>
                            position === index
                              ? { ...entry, targetKind: kind, targetId: '' }
                              : entry,
                          ),
                        )
                      }}
                    >
                      <option value="pool">{t('admin.escalation.action.targetKinds.pool')}</option>
                      <option value="group">{t('admin.escalation.action.targetKinds.group')}</option>
                      <option value="user">{t('admin.escalation.action.targetKinds.user')}</option>
                    </select>
                  </label>

                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.action.target')}
                    <select
                      data-testid="escalation-action-target"
                      className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={action.targetId ?? ''}
                      onChange={(event) => {
                        const targetId = event.target.value

                        publish(
                          actions.map((entry, position) =>
                            position === index ? { ...entry, targetId } : entry,
                          ),
                        )
                      }}
                    >
                      <option value="">{t('admin.escalation.action.targetEmpty')}</option>
                      {targetsOf(action).map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              {action.type === 'assign' ? (
                <>
                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.action.assignMode')}
                    <select
                      data-testid="escalation-assign-mode"
                      className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={action.mode ?? 'pool'}
                      onChange={(event) => {
                        const mode = event.target.value === 'user' ? 'user' : 'pool'

                        publish(
                          actions.map((entry, position) =>
                            position === index ? { ...entry, mode, user: '' } : entry,
                          ),
                        )
                      }}
                    >
                      <option value="pool">{t('admin.escalation.action.assignModes.pool')}</option>
                      <option value="user">{t('admin.escalation.action.assignModes.user')}</option>
                    </select>
                  </label>

                  {(action.mode ?? 'pool') === 'user' ? (
                    <label className="text-xs text-slate-400">
                      {t('admin.escalation.action.assignUser')}
                      <select
                        data-testid="escalation-assign-user"
                        className="w-56 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                        disabled={!canWrite}
                        value={action.user ?? ''}
                        onChange={(event) => {
                          const user = event.target.value

                          publish(
                            actions.map((entry, position) =>
                              position === index ? { ...entry, user } : entry,
                            ),
                          )
                        }}
                      >
                        <option value="">{t('admin.escalation.action.targetEmpty')}</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      data-testid="escalation-assign-acceptance"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                      disabled={!canWrite}
                      checked={action.acceptance !== false}
                      onChange={(event) => {
                        const acceptance = event.target.checked

                        publish(
                          actions.map((entry, position) =>
                            position === index ? { ...entry, acceptance } : entry,
                          ),
                        )
                      }}
                    />
                    {t('admin.escalation.action.assignAcceptance')}
                  </label>
                </>
              ) : null}

              {canWrite ? (
                <button
                  className="min-h-11 rounded border border-rose-500/60 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  onClick={() =>
                    publish(actions.filter((_, position) => position !== index))
                  }
                  type="button"
                >
                  {t('admin.escalation.action.remove', { number: index + 1 })}
                </button>
              ) : null}
            </div>

            <EscalationConditionBuilder
              initial={action.condition as unknown as EscalationCondition}
              canWrite={canWrite}
              pools={pools}
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
            className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            onClick={() =>
              publish([...actions, { key: `action_${actions.length + 1}`, type: 'notify', channels: [], targetKind: 'user', targetId: '', priority: '', condition: { all: [] } }])
            }
            type="button"
          >
            {t('admin.escalation.action.add')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
