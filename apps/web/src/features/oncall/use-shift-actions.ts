import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { apiFetch, ApiError } from '../../lib/api'
import {
  deliverShiftAction,
  enqueueShiftAction,
  queuedShiftActions,
  removeShiftAction,
  type QueuedShiftAction,
  type ShiftActionKind,
} from '../../lib/outbox'

type ShiftActionRow = QueuedShiftAction & { ageMinutes: number }

/**
 * Offline-capable confirm and decline for one on-call shift (`WP-M8-15`).
 *
 * `confirm()` and `decline(reason)` try the online route first and queue the
 * write in the Dexie `shift_actions` table when the browser is offline. The
 * decline reason is validated before it is queued or sent. `rows` exposes the
 * queued/failed/conflict rows of this shift, `retry(row)` replays one row and
 * `discard(row)` drops a rejected row.
 */
export function useShiftActions(shiftId: string) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<ShiftActionRow[]>([])
  const [isPending, setIsPending] = useState(false)

  const ageMinutes = (createdAt: number) =>
    Math.max(0, Math.round((Date.now() - createdAt) / 60000))

  const refresh = useCallback(async () => {
    const fetched = await queuedShiftActions()
    setRows(
      fetched
        .filter((row) => row.shift_id === shiftId)
        .map((row) => ({ ...row, ageMinutes: ageMinutes(row.created_at) })),
    )
  }, [shiftId])

  useEffect(() => {
    let mounted = true

    void queuedShiftActions()
      .then((fetched) => {
        if (!mounted) return

        setRows(
          fetched
            .filter((row) => row.shift_id === shiftId)
            .map((row) => ({ ...row, ageMinutes: ageMinutes(row.created_at) })),
        )
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [shiftId])

  const deliver = useCallback(
    async (action: ShiftActionKind, payload: Record<string, unknown>) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueShiftAction({ shiftId, action, payload })
        await refresh()
        return
      }

      setIsPending(true)
      try {
        await apiFetch(`/v1/oncall/shifts/${shiftId}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientUuid: crypto.randomUUID(), ...payload }),
        })
        await queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
      } finally {
        setIsPending(false)
      }
    },
    [queryClient, refresh, shiftId],
  )

  const confirm = useCallback(() => deliver('confirm', {}), [deliver])

  const decline = useCallback(
    async (reason: string) => {
      const trimmed = reason.trim()

      if (trimmed.length < 5 || trimmed.length > 500) {
        throw new ApiError({ status: 422, code: 'oncall_decline_reason_required' })
      }

      await deliver('decline', { reason: trimmed })
    },
    [deliver],
  )

  const retry = useCallback(
    async (row: QueuedShiftAction) => {
      setIsPending(true)
      try {
        await deliverShiftAction(row)
        await refresh()
      } finally {
        setIsPending(false)
      }
    },
    [refresh],
  )

  const discard = useCallback(
    async (row: QueuedShiftAction) => {
      await removeShiftAction(row.client_uuid)
      await refresh()
    },
    [refresh],
  )

  return { confirm, decline, retry, discard, rows, isPending }
}
