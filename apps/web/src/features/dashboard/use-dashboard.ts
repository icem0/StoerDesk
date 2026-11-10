import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { apiBaseUrl, apiFetch } from '../../lib/api'

/**
 * Live dashboard snapshot (`specs/11-dashboard.md` §11.2, §11.6, WP-M9-14).
 *
 * The snapshot is fetched once with TanStack Query. When the browser supports
 * `EventSource`, `GET /api/v1/dashboard/stream` pushes a fresh snapshot on every
 * `dashboard` event and the cache is updated directly. Without `EventSource`
 * the query falls back to a 30-second refetch, so the dashboard works in both
 * modes. The stream is closed on unmount.
 */

const DASHBOARD_KEY = ['dashboard', 'snapshot'] as const

function useDashboardStream(enabled: boolean): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) {
      return
    }

    const source = new EventSource(`${apiBaseUrl}/v1/dashboard/stream`, { withCredentials: true })

    source.addEventListener('dashboard', (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as DashboardSnapshot
        queryClient.setQueryData(DASHBOARD_KEY, snapshot)
      } catch {
        // A malformed frame is ignored; the next event or the fallback refetch wins.
      }
    })

    return () => {
      source.close()
    }
  }, [enabled, queryClient])
}

export function useDashboard() {
  const hasEventSource = typeof EventSource !== 'undefined'

  useDashboardStream(hasEventSource)

  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => apiFetch<DashboardSnapshot>('/v1/dashboard'),
    retry: false,
    refetchInterval: hasEventSource ? false : 30_000,
  })
}
