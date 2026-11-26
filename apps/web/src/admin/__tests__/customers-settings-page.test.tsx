import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { CustomersSettingsPage } from '../customers-settings-page'

/**
 * The switch of the customer portal (`specs/19-customer-portal.md` §19.13,
 * ADR-0062): the administration switches the portal and the self-registration
 * on — the registration only with a cleanly set up mailbox.
 */

const adminId = '11111111-1111-4111-8111-111111111111'

function meResponse(permissions: string[]) {
  return {
    user: { id: adminId, email: 'admin@example.com', locale: 'de', roles: ['admin'], permissions },
  }
}

function stubRoutes(routes: Record<string, unknown>, calls?: { method: string; body: unknown }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      calls?.push({
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <CustomersSettingsPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CustomersSettingsPage', () => {
  it('shows both switches and writes the portal on', async () => {
    const calls: { method: string; body: unknown }[] = []

    stubRoutes(
      {
        '/v1/me': meResponse(['settings.read', 'settings.write']),
        '/v1/settings/customers': {
          portalEnabled: false,
          registrationEnabled: false,
          mailReady: true,
          mailReasons: [],
        },
      },
      calls,
    )

    renderPage()

    const portal = await screen.findByRole('checkbox', { name: /Kundenportal freischalten/ })

    fireEvent.click(portal)

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === 'PUT' &&
            (call.body as { portalEnabled?: boolean } | null)?.portalEnabled === true,
        ),
      ).toBe(true)
    })
  })

  it('locks the registration while the mailbox is not cleanly set up', async () => {
    stubRoutes({
      '/v1/me': meResponse(['settings.read', 'settings.write']),
      '/v1/settings/customers': {
        portalEnabled: false,
        registrationEnabled: false,
        mailReady: false,
        mailReasons: ['sender_missing'],
      },
    })

    renderPage()

    const registration = await screen.findByRole('checkbox', {
      name: /Selbstregistrierung freischalten/,
    })

    expect((registration as HTMLInputElement).disabled).toBe(true)
    expect(await screen.findByText(/Absenderadresse fehlt/)).toBeTruthy()
  })
})
