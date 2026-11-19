import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { NotificationsPage } from '../notifications-page'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/settings/notifications']}>
          <Routes>
            <Route path="/settings/notifications" element={<NotificationsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubReadinessFlow() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/v1/notifications/accounts/telegram/code')) {
      return Response.json({ code: 'AB2C3D', expiresAt: '2030-01-01T00:00:00.000Z' })
    }

    if (url.endsWith('/v1/admin/channels')) {
      return Response.json({
        channels: [
          { kind: 'ntfy', enabled: true, label: 'ntfy', config: {}, secretSet: false },
          { kind: 'email', enabled: true, label: 'Email', config: {}, secretSet: false },
          { kind: 'matrix', enabled: false, label: 'Matrix', config: {}, secretSet: false },
        ],
      })
    }

    if (url.endsWith('/v1/notifications/preferences')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { preferences?: unknown }

        return Response.json(body)
      }

      return Response.json({
        preferences: [
          { eventType: 'oncall.assigned', channel: 'ntfy' },
          { eventType: 'ticket.created', channel: 'email' },
        ],
      })
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WP-M14-32 readiness block of /settings/notifications', () => {
  it('renders the three readiness rows with the German labels and the saved checkboxes', async () => {
    vi.stubGlobal('fetch', stubReadinessFlow())

    const { container } = renderPage()

    await waitFor(() => {
      expect(
        container.querySelector('[id="readiness-oncall.assigned:ntfy"]'),
      ).toBeTruthy()
    })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Bereitschafts-Ereignisse' }),
    ).toBeTruthy()
    expect(screen.getByText('Bereitschaft zugewiesen')).toBeTruthy()
    expect(screen.getByText('Tausch angefragt')).toBeTruthy()
    expect(screen.getByText('Nicht bestätigte Erinnerung')).toBeTruthy()

    const assignedNtfy = container.querySelector(
      '[id="readiness-oncall.assigned:ntfy"]',
    ) as HTMLInputElement
    const assignedEmail = container.querySelector(
      '[id="readiness-oncall.assigned:email"]',
    ) as HTMLInputElement
    expect(assignedNtfy).toBeTruthy()
    expect(assignedNtfy.checked).toBe(true)
    expect(assignedEmail.checked).toBe(false)

    const swapCheckbox = container.querySelector(
      '[id="readiness-oncall.swap_requested:ntfy"]',
    ) as HTMLInputElement
    expect(swapCheckbox.checked).toBe(false)

    expect(screen.getAllByText('Die Kanäle der Installation')).toHaveLength(2)

    // `matrix` is disabled: no checkbox is rendered for that channel.
    expect(
      container.querySelector('[id="readiness-oncall.assigned:matrix"]'),
    ).toBeNull()
  })

  it('saves the readiness selection through the shared PUT route', async () => {
    const fetchMock = stubReadinessFlow()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderPage()

    await waitFor(() => {
      expect(
        container.querySelector('[id="readiness-oncall.assigned:ntfy"]'),
      ).toBeTruthy()
    })

    const saveButton = screen.getByRole('button', {
      name: 'Bereitschafts-Auswahl speichern',
    })

    fireEvent.click(saveButton)

    await screen.findByText('Die Bereitschafts-Auswahl wurde gespeichert.')
    const expectedBody = JSON.stringify({
      preferences: [
        { eventType: 'oncall.assigned', channel: 'ntfy' },
        { eventType: 'ticket.created', channel: 'email' },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/preferences',
      expect.objectContaining({
        method: 'PUT',
        body: expectedBody,
      }),
    )
  })
})
