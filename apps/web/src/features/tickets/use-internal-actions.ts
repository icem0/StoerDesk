import { useCallback, useEffect, useState } from 'react'

import {
  deliverAction,
  enqueueInternalAction,
  queuedActions,
  type QueuedAction,
} from '../../lib/outbox'

/**
 * Offline queue for the three internal writes of phase 5: acknowledge, comment,
 * decline (`PLAN.md` §10, WP-M5-01/WP-M5-04).
 *
 * `queueAction` persists a write to IndexedDB and bumps the pending count.
 * `deliverNow(row)` replays one row through `deliverAction` (which removes it
 * on success and marks network failures `failed` with `retries + 1`).
 * `pendingCount` counts queued/failed rows of this ticket, refreshed on mount
 * so the notice survives a reload.
 */
export function useInternalActions(ticketNo: string) {
  const [pendingCount, setPendingCount] = useState(0)
  const [isDelivering, setIsDelivering] = useState(false)

  useEffect(() => {
    let mounted = true

    queuedActions().then((rows) => {
      if (!mounted) return

      setPendingCount(
        rows.filter(
          (row) =>
            row.ticket_no === ticketNo &&
            (row.status === 'queued' || row.status === 'failed'),
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
          setPendingCount((c) => Math.max(0, c - 1))
        }
      } finally {
        setIsDelivering(false)
      }
    },
    [],
  )

  return { queueAction, deliverNow, pendingCount, isDelivering }
}
