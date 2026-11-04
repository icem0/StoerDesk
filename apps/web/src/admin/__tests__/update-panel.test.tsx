import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { UpdatePanel } from '../update-panel'

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

function checkPayload(overrides: Record<string, unknown> = {}) {
  return {
    current: 'abc1234def5678',
    latest: '1a2b3c4',
    updateAvailable: true,
    commitsBehind: 2,
    commits: [
      {
        sha: '1a2b3c4d5e6f',
        message: 'fix(api): answer the check',
        date: '2026-11-04T10:00:00.000Z',
      },
      {
        sha: '2b3c4d5e6f70',
        message: 'feat(web): the update menu',
        date: '2026-11-04T09:00:00.000Z',
      },
    ],
    checkedAt: '2026-11-04T10:05:00.000Z',
    ...overrides,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <UpdatePanel onClose={() => undefined} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('UpdatePanel', () => {
  it('shows the installed version, the newest commit and the commits behind', async () => {
    stubRoutes({ '/v1/admin/update/check': checkPayload() })

    renderPanel()

    expect(await screen.findByText('abc1234def5678')).toBeTruthy()
    expect(screen.getAllByText('1a2b3c4').length).toBeGreaterThan(0)
    expect(screen.getByText(/2 Commits seit der installierten Version/)).toBeTruthy()
    expect(screen.getByText('fix(api): answer the check')).toBeTruthy()
    expect(screen.getByText('feat(web): the update menu')).toBeTruthy()
  })

  it('says that the installed version is up to date', async () => {
    stubRoutes({
      '/v1/admin/update/check': checkPayload({
        updateAvailable: false,
        commitsBehind: 0,
        commits: [],
      }),
    })

    renderPanel()

    expect(await screen.findByText('Die installierte Version ist aktuell.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Update starten/ })).toBeNull()
  })

  it('says that the versions cannot be compared', async () => {
    stubRoutes({
      '/v1/admin/update/check': checkPayload({
        updateAvailable: false,
        commitsBehind: null,
        commits: [],
      }),
    })

    renderPanel()

    expect(await screen.findByText('Die Versionen lassen sich nicht vergleichen.')).toBeTruthy()
  })

  it('asks for a confirmation before the update starts', async () => {
    stubRoutes({
      '/v1/admin/update/check': checkPayload(),
      '/v1/admin/update/start': { started: true },
    })

    renderPanel()

    const button = await screen.findByRole('button', { name: /Update starten/ })

    fireEvent.click(button)

    expect(await screen.findByText(/Der Stack wird neu gebaut|stack is rebuilt/i)).toBeTruthy()
    expect(fetchCalls.some((call) => call.url.includes('/v1/admin/update/start'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Ja, Update starten/ }))

    await waitFor(() => {
      expect(
        fetchCalls.some(
          (call) => call.url.includes('/v1/admin/update/start') && call.method === 'POST',
        ),
      ).toBe(true)
    })
  })

  it('names the error of a failing check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'update_github_rate_limited', params: {} }, { status: 503 }),
      ),
    )

    renderPanel()

    expect(await screen.findByText('GitHub hat die Anfrage gedrosselt.')).toBeTruthy()
  })

  it('names the error of a refused start', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        fetchCalls.push({ url, method: 'GET' })

        if (url.includes('/v1/admin/update/start')) {
          return Response.json({ code: 'update_rate_limited', params: {} }, { status: 429 })
        }

        return Response.json(checkPayload())
      }),
    )

    renderPanel()

    const button = await screen.findByRole('button', { name: /Update starten/ })

    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: /Ja, Update starten/ }))

    expect(await screen.findByText('Es wurde vor Kurzem ein Update gestartet.')).toBeTruthy()
  })

  it('names the status of an unknown answer of the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        fetchCalls.push({ url, method: 'GET' })

        if (url.includes('/v1/admin/update/start')) {
          return Response.json({ statusCode: 500, error: 'Internal Server Error' }, { status: 500 })
        }

        return Response.json(checkPayload())
      }),
    )

    renderPanel()

    const button = await screen.findByRole('button', { name: /Update starten/ })

    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: /Ja, Update starten/ }))

    expect(
      await screen.findByText('Das Update konnte nicht gestartet werden (HTTP 500).'),
    ).toBeTruthy()
  })

  it('treats a lost connection as a restarting stack', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        fetchCalls.push({ url, method: 'GET' })

        if (url.includes('/v1/admin/update/start')) {
          throw new TypeError('Failed to fetch')
        }

        return Response.json(checkPayload())
      }),
    )

    renderPanel()

    const button = await screen.findByRole('button', { name: /Update starten/ })

    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: /Ja, Update starten/ }))

    expect(await screen.findByText(/Die Verbindung wurde unterbrochen/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Seite neu laden/ })).toBeTruthy()
  })
})
