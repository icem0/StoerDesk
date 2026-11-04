import { useCallback, useEffect, useState } from 'react'

import {
  deliverAction,
  enqueueInternalAction,
  queuedActions,
  removeAction,
  type QueuedAction,
} from '../../lib/outbox'

/**
 * Offline queue for the three internal writes of phase 5: acknowledge, comment,
 * decline (`PLAN.md` §10, WP-M5-01/WP-M5-04).
 *
 * `queueAction` persists a write to IndexedDB and bumps the pending count.
 * `deliverNow(row)` replays one row through `deliverAction` (which removes it
 * on success and marks network failures `failed` with `retries + 1`).
 * `pendingCount` counts queued/failed/conflict rows of this ticket, refreshed on
 * mount so the notice survives a reload. `rows` exposes every row of this ticket
 * (with a pre-computed `ageMinutes`) so the conflict banner can render them
 * (`WP-M5-06`).
 */
type ActionRow = QueuedAction & { ageMinutes: number }

export function useInternalActions(ticketNo: string) {
  const [pendingCount, setPendingCount] = useState(0)
  const [isDelivering, setIsDelivering] = useState(false)
  const [rows, setRows] = useState<ActionRow[]>([])

  const ageMinutes = (createdAt: number) =>
    Math.max(0, Math.round((Date.now() - createdAt) / 60000))

  const refresh = useCallback(async () => {
    const fetched = await queuedActions()
    const ticketRows = fetched
      .filter((row) => row.ticket_no === ticketNo)
      .map((row) => ({ ...row, ageMinutes: ageMinutes(row.created_at) }))
    setRows(ticketRows)
    setPendingCount(
      ticketRows.filter(
        (row) =>
          row.status === 'queued' || row.status === 'failed' || row.status === 'conflict',
      ).length,
    )
  }, [ticketNo])

  useEffect(() => {
    let mounted = true

    queuedActions().then((fetched) => {
      if (!mounted) return

      const ticketRows = fetched
        .filter((row) => row.ticket_no === ticketNo)
        .map((row) => ({ ...row, ageMinutes: ageMinutes(row.created_at) }))
      setRows(ticketRows)
      setPendingCount(
        ticketRows.filter(
          (row) =>
            row.status === 'queued' || row.status === 'failed' || row.status === 'conflict',
        ).length,
      )
    })

    return () => {
      mounted = false
    }
  }, [ticketNo])

  const queueAction = useCallback(
    async (action: 'acknowledge' | 'comment' | 'decline', payload: Record<string, unknown>) => {
      await enqueueInternalAction({ ticketNo, action, payload })
      setPendingCount((c) => c + 1)
    },
    [ticketNo],
  )

  const deliverNow = useCallback(
    async (row: QueuedAction) => {
      setIsDelivering(true)
      try {
        const ok = await deliverAction(row)
        if (ok) {
          await refresh()
        }
      } finally {
        setIsDelivering(false)
      }
    },
    [refresh],
  )

  const discard = useCallback(
    async (id: number) => {
      await removeAction(id)
      await refresh()
    },
    [refresh],
  )

  return { queueAction, deliverNow, discard, pendingCount, isDelivering, rows }
}
