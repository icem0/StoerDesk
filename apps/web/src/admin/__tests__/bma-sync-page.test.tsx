import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { BmaSyncPage } from '../bma-sync-page'

const runRow = {
  id: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-11-03T03:15:00.000Z',
  finishedAt: '2026-11-03T03:15:07.000Z',
  status: 'PARTIAL',
  total: 4,
  created: 1,
  updated: 2,
  unchanged: 0,
  deactivated: 1,
  conflicts: [
    { code: 'object_no_taken', objectNo: '10372_01', aid: 'aid-9', detail: 'local_object' },
  ],
  errorCode: null,
}

const fetchCalls: { url: string; method: string; body?: unknown }[] = []

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      fetchCalls.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })

      for (const [path, payload] of Object.entries(routes)) {
        if (url.includes(path)) {
          if (payload instanceof Response) {
            return payload
          }

          return Response.json(payload)
        }
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function baseRoutes(permissions: string[], extra: Record<string, unknown> = {}) {
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
    '/v1/admin/bma-sync/runs': { runs: [runRow] },
    '/v1/admin/bma-sync/schedule': { enabled: true, cron: '15 3 * * *' },
    '/v1/admin/bma-sync/credentials': { configured: false, source: 'none' },
    ...extra,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/bma-sync']}>
          <Routes>
            <Route path="/admin/bma-sync" element={<BmaSyncPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const adminPermissions = ['object.read', 'object.write', 'object.import']

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('BmaSyncPage', () => {
  it('lists the newest run with its counters and the conflicts, and prefills the schedule', async () => {
    stubRoutes(baseRoutes(adminPermissions))
    renderPage()

    expect(await screen.findByText(/teilweise|partial/i)).toBeTruthy()
    expect(screen.getByText('10372_01')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /Angelegt|Created/i })).toBeTruthy()

    const cron = (await screen.findByLabelText(
      /Cron-Ausdruck|Cron expression/i,
    )) as HTMLInputElement
    expect(cron.value).toBe('15 3 * * *')

    const enabled = screen.getByLabelText(/Automatischer Abgleich aktiv|Automatic sync enabled/i)
    expect((enabled as HTMLInputElement).checked).toBe(true)
  })

  it('shows no conflict rows when the newest run has none', async () => {
    stubRoutes(
      baseRoutes(adminPermissions, {
        '/v1/admin/bma-sync/runs': { runs: [{ ...runRow, conflicts: [] }] },
      }),
    )
    renderPage()

    expect(await screen.findByText(/keine Konflikte|no conflicts/i)).toBeTruthy()
  })

  it('triggers the manual pull and maps bma_not_configured to a hint', async () => {
    stubRoutes(
      baseRoutes(adminPermissions, {
        '/v1/admin/bma-sync/run': Response.json(
          { code: 'bma_not_configured', params: {} },
          { status: 409 },
        ),
      }),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Jetzt abgleichen|Sync now/i }))

    expect(await screen.findByText(/nicht konfiguriert|not configured/i)).toBeTruthy()
  })

  it('disables the trigger without object.import', async () => {
    stubRoutes(baseRoutes(['object.read']))
    renderPage()

    const button = (await screen.findByRole('button', {
      name: /Jetzt abgleichen|Sync now/i,
    })) as HTMLButtonElement

    expect(button.disabled).toBe(true)
  })

  it('shows where the effective api key comes from', async () => {
    stubRoutes(
      baseRoutes(adminPermissions, {
        '/v1/admin/bma-sync/credentials': { configured: true, source: 'env' },
      }),
    )
    renderPage()

    expect(
      await screen.findByText(
        /API-Schlüssel kommt aus der Umgebung|API key comes from the environment/i,
      ),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /Gespeicherten Schlüssel löschen|Delete stored key/i }),
    ).toBeNull()
  })

  it('stores a typed api key, clears the field and reports the source as stored', async () => {
    stubRoutes(baseRoutes(adminPermissions))
    renderPage()

    const input = (await screen.findByLabelText(
      /API-Schlüssel der BMAcloud|BMAcloud API key/i,
    )) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'secret-key' } })
    fireEvent.click(screen.getByRole('button', { name: /Schlüssel speichern|Save key/i }))

    expect(await screen.findByText(/API-Schlüssel gespeichert|API key saved/i)).toBeTruthy()
    expect(
      fetchCalls.some((call) => {
        const body = (call.body ?? {}) as Record<string, unknown>

        return (
          call.method === 'PUT' &&
          call.url.includes('/v1/admin/bma-sync/credentials') &&
          body.apiKey === 'secret-key'
        )
      }),
    ).toBe(true)
    expect(input.value).toBe('')
  })

  it('offers deletion for a stored key and disables writes without object.import', async () => {
    stubRoutes(
      baseRoutes(['object.read'], {
        '/v1/admin/bma-sync/credentials': { configured: true, source: 'db' },
      }),
    )
    renderPage()

    const removeButton = (await screen.findByRole('button', {
      name: /Gespeicherten Schlüssel löschen|Delete stored key/i,
    })) as HTMLButtonElement
    const saveButton = screen.getByRole('button', {
      name: /Schlüssel speichern|Save key/i,
    }) as HTMLButtonElement
    const input = (await screen.findByLabelText(
      /API-Schlüssel der BMAcloud|BMAcloud API key/i,
    )) as HTMLInputElement

    expect(removeButton.disabled).toBe(true)
    expect(saveButton.disabled).toBe(true)
    expect(input.disabled).toBe(true)
  })

  it('shows the session notice when /me answers 401', async () => {
    stubRoutes({
      '/v1/me': Response.json({ code: 'session_invalid', params: {} }, { status: 401 }),
    })
    renderPage()

    expect(await screen.findByText(/gültige Anmeldung|valid sign-in/i)).toBeTruthy()
  })
})
