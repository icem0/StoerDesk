import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { UpdateHostUpdate } from '../update-host-update'

const fetchCalls: { url: string; method: string }[] = []

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      fetchCalls.push({ url, method: init?.method ?? 'GET' })

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

function statusPayload(overrides: Record<string, unknown> = {}) {
  return {
    agent: { reachable: true, state: 'idle', error: null },
    running: false,
    currentVersion: 'v0.1.99',
    lastRun: null,
    ...overrides,
  }
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/update']}>
          <Routes>
            <Route path="/admin/update" element={<UpdateHostUpdate />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('UpdateHostUpdate', () => {
  it('stays hidden without the permission system.update', async () => {
    stubRoutes({ ...meRoutes(['settings.read']), '/v1/admin/update/status': statusPayload() })

    renderSection()

    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes('/v1/me'))).toBe(true)
    })

    expect(screen.queryByText(/Host-Update|Host update/i)).toBeNull()
  })

  it('shows the state of the agent and the version of the server', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload(),
    })

    renderSection()

    expect(await screen.findByText('v0.1.99')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Host-Update starten|Start host update/i })).toBeTruthy()
  })

  it('asks for a confirmation before the run starts', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload(),
      '/v1/admin/update/run': { run: { id: 'run-1', status: 'RUNNING' } },
    })

    renderSection()

    // The button is only enabled when the state of the agent is known.
    expect(await screen.findByText('v0.1.99')).toBeTruthy()

    const button = screen.getByRole('button', {
      name: /Host-Update starten|Start host update/i,
    })

    fireEvent.click(button)

    expect(
      await screen.findByText(/Der Stack wird neu gebaut|stack is rebuilt/i),
    ).toBeTruthy()
    expect(fetchCalls.some((call) => call.url.includes('/v1/admin/update/run'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Ja, Host-Update starten|Yes, start/i }))

    await waitFor(() => {
      expect(
        fetchCalls.some(
          (call) => call.url.includes('/v1/admin/update/run') && call.method === 'POST',
        ),
      ).toBe(true)
    })
  })

  it('shows a missing agent and blocks the run', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload({
        agent: { reachable: false, state: null, error: 'update_agent_unreachable' },
        currentVersion: null,
      }),
    })

    renderSection()

    const button = (await screen.findByRole('button', {
      name: /Host-Update starten|Start host update/i,
    })) as HTMLButtonElement

    await waitFor(() => {
      expect(button.disabled).toBe(true)
    })

    expect(screen.getByText(/der Agent läuft nicht|agent does not run/i)).toBeTruthy()
  })

  it('carries the guide that starts the agent', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload({
        agent: { reachable: false, state: null, error: 'update_agent_unreachable' },
        currentVersion: null,
      }),
    })

    renderSection()

    expect(
      await screen.findByText(/Host-Update aktivieren|Enable the host update/i),
    ).toBeTruthy()
    expect(
      screen.getByText('docker compose --profile update up -d update-agent'),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Befehl kopieren|Copy command/i }),
    ).toBeTruthy()
  })

  it('hides the guide when the agent answers', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload(),
    })

    renderSection()

    expect(await screen.findByText('v0.1.99')).toBeTruthy()
    expect(screen.queryByText(/Host-Update aktivieren|Enable the host update/i)).toBeNull()
  })

  it('names the missing token of the agent', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload({
        agent: { reachable: false, state: null, error: 'update_agent_not_configured' },
        currentVersion: null,
      }),
    })

    renderSection()

    expect(
      await screen.findByText(/Agent läuft noch nicht|agent does not run yet/i),
    ).toBeTruthy()
  })

  it('checks for a newer version on GitHub and shows the update button', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload(),
      'api.github.com/repos/icem0/StoerDesk/tags': [{ name: 'v0.2.0' }],
    })

    renderSection()

    await screen.findByText('v0.1.99')

    const checkButton = screen.getByRole('button', {
      name: /Update prüfen|Check for update/i,
    })
    fireEvent.click(checkButton)

    expect(await screen.findByText(/v0.2.0/)).toBeTruthy()
    expect(
      await screen.findByText(/Update verfügbar!|Update available!/i),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Jetzt updaten|Update now/i }),
    ).toBeTruthy()
  })

  it('shows up to date when versions match', async () => {
    stubRoutes({
      ...meRoutes(['system.update']),
      '/v1/admin/update/status': statusPayload(),
      'api.github.com/repos/icem0/StoerDesk/tags': [{ name: 'v0.1.91' }],
    })

    renderSection()

    await screen.findByText('v0.1.99')

    const checkButton = screen.getByRole('button', {
      name: /Update prüfen|Check for update/i,
    })
    fireEvent.click(checkButton)

    await waitFor(() => {
      expect(
        screen.getByText(/Sie nutzen die neueste Version|You are using the latest version/i),
      ).toBeTruthy()
    })
    expect(
      screen.queryByRole('button', { name: /Jetzt updaten|Update now/i }),
    ).toBeNull()
  })

  it('shows check failed when github is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        fetchCalls.push({ url, method: 'GET' })

        if (url.includes('api.github.com')) {
          throw new Error('network error')
        }

        for (const [path, payload] of Object.entries({
          '/v1/me': {
            user: {
              id: '22222222-2222-4222-8222-222222222222',
              email: 'admin@example.com',
              locale: 'de',
              roles: ['admin'],
              permissions: ['system.update'],
            },
          },
          '/v1/admin/update/status': statusPayload(),
        })) {
          if (url.includes(path)) {
            return Response.json(payload)
          }
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderSection()

    await screen.findByText('v0.1.99')

    const checkButton = screen.getByRole('button', {
      name: /Update prüfen|Check for update/i,
    })
    fireEvent.click(checkButton)

    expect(await screen.findByText(/Prüfung fehlgeschlagen|Check failed/i)).toBeTruthy()
  })
})
