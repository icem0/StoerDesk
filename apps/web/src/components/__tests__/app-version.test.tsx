import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { AppVersion } from '../app-version'

const fetchCalls: { url: string }[] = []

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      fetchCalls.push({ url })

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function meRoutes(permissions: string[]) {
  return {
    '/v1/me': {
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'admin@example.com',
        locale: 'de',
        roles: ['admin'],
        permissions,
      },
    },
  }
}

function renderBadge(permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  stubRoutes({
    ...meRoutes(permissions),
    '/v1/admin/update/check': {
      current: 'abc1234def5678',
      latest: '1a2b3c4',
      updateAvailable: false,
      commitsBehind: 0,
      commits: [],
      checkedAt: '2026-11-04T10:05:00.000Z',
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AppVersion version="v1.2.3" />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('AppVersion', () => {
  it('renders the label and the injected build version', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nextProvider i18n={i18n}>
          <AppVersion version="v1.2.3" />
        </I18nextProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Version')).toBeTruthy()
    expect(screen.getByText('v1.2.3')).toBeTruthy()
  })

  it('stays a plain text without the permission system.update', async () => {
    renderBadge(['settings.read'])

    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes('/v1/me'))).toBe(true)
    })

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('app-version').tagName).toBe('SPAN')
  })

  it('opens the update menu for an administrator', async () => {
    renderBadge(['system.update'])

    const badge = await waitFor(() => {
      const element = screen.getByTestId('app-version')

      expect(element.tagName).toBe('BUTTON')

      return element
    })

    fireEvent.click(badge)

    expect(await screen.findByText('Installierte Version')).toBeTruthy()
    expect(await screen.findByText('abc1234def5678')).toBeTruthy()
  })
})
