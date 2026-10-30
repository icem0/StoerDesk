import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMe, usePermission } from '../usePermission'

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function stubMe(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'admin@example.com',
          locale: 'de',
          roles: ['admin'],
          permissions,
        },
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePermission', () => {
  it('is true when one of the OR keys is granted', async () => {
    stubMe(['user.read', 'ticket.read'])
    const { result } = renderHook(() => usePermission('user.write', 'user.read'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('is false while the session is anonymous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'session_invalid', params: {} }, { status: 401 })),
    )
    const { result } = renderHook(() => usePermission('user.read'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('exposes the permissions array of /me through useMe', async () => {
    stubMe(['role.read'])
    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.user.permissions).toEqual(['role.read'])
  })
})
