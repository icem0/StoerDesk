import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { MeResponse } from '@stoerdesk/shared'

import { apiFetch } from '../lib/api'

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/v1/me'),
    retry: false,
    staleTime: 30_000,
  })
}

/**
 * UI-side permission check (`specs/01-rbac.md` §3.7): the `permissions` array of
 * `/me` with OR semantics, mirroring `requirePermission`. Hiding controls this way
 * is cosmetic only (§3.2) — the server guard stays the only enforcement point.
 */
export function usePermission(...keys: string[]): boolean {
  const me = useMe()
  const permissions = me.data?.user.permissions ?? []

  return keys.some((key) => permissions.includes(key))
}
