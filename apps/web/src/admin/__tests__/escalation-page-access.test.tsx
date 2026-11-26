import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const STAGES = [
  {
    key: 'new',
    names: { de: 'Neu', en: 'New' },
    position: 1,
    active: true,
    predecessor: null,
    reachedBy: [],
  },
]

function stubApi(config: () => Response, permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)

      if (path.includes('/v1/me')) {
        return Response.json({
          user: {
            id: 'u1',
            email: 'admin@example.invalid',
            permissions,
          },
        })
      }

      if (path.includes('/v1/escalation/config')) {
        return config()
      }

      if (path.includes('/v1/settings/deadlines')) {
        return Response.json({ hours: { low: 168, normal: 72, high: 24, critical: 8 } })
      }

      if (path.includes('/v1/escalation/channels')) {
        return Response.json({ channels: [] })
      }

      if (path.includes('/v1/admin/statuses')) {
        return Response.json({ statuses: [] })
      }

      if (path.includes('/v1/oncall/pools')) {
        return Response.json({ pools: [] })
      }

      if (path.includes('/v1/groups')) {
        return Response.json({ groups: [] })
      }

      if (path.includes('/v1/users')) {
        return Response.json({ users: [] })
      }

      return Response.json({ webhooks: [] })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/escalation']}>
          <Routes>
            <Route path="/admin/escalation" element={<EscalationPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the access of the escalation administration', () => {
  it('names the missing read permission when a user opens the page', async () => {
    void i18n.changeLanguage('de')
    stubApi(
      () =>
        Response.json(
          { code: 'forbidden', params: {} },
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ['ticket.read'],
    )

    renderPage()

    expect(await screen.findByText('Keine Berechtigung für die Eskalation.')).toBeTruthy()
    expect(screen.queryByText('Speichern fehlgeschlagen.')).toBeNull()
  })

  it('names an expired session when the configuration cannot be read', async () => {
    void i18n.changeLanguage('de')
    stubApi(
      () =>
        Response.json(
          { code: 'session_invalid', params: {} },
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ['settings.read', 'settings.write'],
    )

    renderPage()

    expect(await screen.findByText('Die Anmeldung ist abgelaufen.')).toBeTruthy()
  })

  it('shows the stages of an installation the user may read', async () => {
    void i18n.changeLanguage('de')
    stubApi(() => Response.json({ stages: STAGES, rules: [] }), ['settings.read'])

    renderPage()

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Stufen & Regeln' }))

    expect(await screen.findByTestId('escalation-stage-list')).toBeTruthy()
  })

  it('names a saved configuration of an older installation as an invalid configuration', async () => {
    void i18n.changeLanguage('de')
    stubApi(
      () =>
        Response.json(
          { code: 'config_invalid', params: {} },
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ['settings.read'],
    )

    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Speichern fehlgeschlagen.')).toBeNull()
  })

  it('names a server error of the read of the configuration', async () => {
    void i18n.changeLanguage('de')
    stubApi(
      () =>
        Response.json(
          { statusCode: 500, error: 'Internal Server Error' },
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ['settings.read'],
    )

    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Speichern fehlgeschlagen.')).toBeNull()
  })
})
