import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { StatusPage } from '../status-page'
import type { PublicTicketStatus } from '@stoerdesk/shared'

const TOKEN = 'Qr7tYw4KdBe3vLm2pQ7tYw'

const STATUS: PublicTicketStatus = {
  ticketNo: 'ST-2026-0042',
  status: 'ACCEPTED',
  reportedAt: '2026-10-31T09:00:00.000Z',
  deadlineAt: '2026-11-03T09:00:00.000Z',
  events: [
    { type: 'created', at: '2026-10-31T09:00:00.000Z' },
    { type: 'work_order_set', at: '2026-10-31T09:10:00.000Z' },
    { type: 'accepted', at: '2026-10-31T09:20:00.000Z' },
  ],
}

function stubStatus(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
}

function renderPage(token: string = TOKEN) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/s/${token}`]}>
          <Routes>
            <Route path="/s/:token" element={<StatusPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('StatusPage', () => {
  it('renders the ticket number, the status badge and the public timeline in German', async () => {
    stubStatus(Response.json(STATUS))
    const { container } = renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vorgangsnummer ST-2026-0042' }),
    ).toBeTruthy()
    expect(screen.getByTestId('status-badge').textContent).toBe('Angenommen')
    expect(screen.getByRole('heading', { level: 2, name: 'Verlauf' })).toBeTruthy()

    const entries = [...container.querySelectorAll('ol > li')].map((entry) => entry.textContent)

    expect(entries).toHaveLength(3)
    expect(entries[0]).toContain('Meldung eingegangen')
    expect(entries[1]).toContain('Auftrag angelegt')
    expect(entries[2]).toContain('Auftrag angenommen')
  })

  it('renders the English labels when the stored language is en', async () => {
    stubStatus(Response.json(STATUS))
    await i18n.changeLanguage('en')
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Report status' })).toBeTruthy()
    expect((await screen.findByTestId('status-badge')).textContent).toBe('Accepted')
    expect(screen.getByText('Report received')).toBeTruthy()
    expect(screen.getByText('Work order created')).toBeTruthy()
    expect(screen.getByText('Work order accepted')).toBeTruthy()
  })

  it('answers an unknown token with its notice and an invalid token without a request', async () => {
    stubStatus(Response.json({ code: 'status_token_not_found', params: {} }, { status: 404 }))
    const unknown = renderPage()

    expect(
      await screen.findByText(
        'Zu diesem Statuslink gibt es keine Meldung. Bitte den Link aus der Bestätigung erneut öffnen.',
      ),
    ).toBeTruthy()
    unknown.unmount()

    vi.unstubAllGlobals()
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    renderPage('short')

    expect(
      await screen.findByText(
        'Dieser Statuslink ist ungültig. Bitte den Link aus der Bestätigung erneut öffnen.',
      ),
    ).toBeTruthy()
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
