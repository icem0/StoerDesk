import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { QrLandingPage } from '../qr-landing-page'

/**
 * The landing page of a QR code (`specs/06-report-form.md` §7.10.2, ADR-0061):
 * the open tickets of the object come first, the report is one tap away.
 */

const TOKEN = 'Qr7tYw4KdBe3vLm2pQ7tYw'

const OBJECT = {
  token: TOKEN,
  redirected: false,
  object: { objectNo: 'ANL-1', name: 'Aufzug Nord', street: 'Hauptstraße', houseNumber: '3', postalCode: '12345', city: 'Musterstadt' },
  titleEnabled: true,
}

const OPEN_TICKETS = {
  tickets: [
    {
      ticketId: '11111111-1111-4111-8111-111111111111',
      ticketNo: 'ST-0001',
      status: 'NEW',
      reportedAt: '2026-11-01T08:00:00.000Z',
    },
    {
      ticketId: '22222222-2222-4222-8222-222222222222',
      ticketNo: 'ST-0002',
      status: 'IN_REVIEW',
      reportedAt: '2026-11-01T09:00:00.000Z',
    },
  ],
}

function stubFetch(answer: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => answer(String(input))),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/m/${TOKEN}`]}>
          <Routes>
            <Route path="/m/:token" element={<QrLandingPage />} />
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

describe('QrLandingPage', () => {
  it('shows the open tickets of the object, the newest one first', async () => {
    stubFetch((url) =>
      url.includes('/public/tickets/open') ? Response.json(OPEN_TICKETS) : Response.json(OBJECT),
    )
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Aufzug Nord' })).toBeTruthy()

    const tickets = await screen.findAllByTestId('landing-open-ticket')

    expect(tickets).toHaveLength(2)
    expect(tickets[0]?.textContent).toContain('ST-0002')
    expect(tickets[1]?.textContent).toContain('ST-0001')
  })

  it('offers the report directly when no ticket is open', async () => {
    stubFetch((url) =>
      url.includes('/public/tickets/open')
        ? Response.json({ tickets: [] })
        : Response.json(OBJECT),
    )
    renderPage()

    expect(await screen.findByText('Zu diesem Objekt ist keine Meldung offen.')).toBeTruthy()

    const button = await screen.findByTestId('landing-new-report')

    expect(button.getAttribute('href')).toBe(`/m/${TOKEN}/neu`)
  })

  it('offers the new report and the open ticket beside an open ticket', async () => {
    stubFetch((url) =>
      url.includes('/public/tickets/open') ? Response.json(OPEN_TICKETS) : Response.json(OBJECT),
    )
    renderPage()

    const links = await screen.findAllByRole('link', { name: 'Meldung ansehen' })
    const link = links[0]!

    expect(link.getAttribute('href')).toBe(`/m/${TOKEN}/tickets/ST-0002`)

    const report = await screen.findByTestId('landing-new-report')

    expect(report.getAttribute('href')).toBe(`/m/${TOKEN}/neu`)
    expect(report.textContent).toBe('Trotzdem eine neue Meldung melden')
  })

  it('names an unknown QR code', async () => {
    stubFetch(() => Response.json({ code: 'qr_token_not_found', params: {} }, { status: 404 }))
    renderPage()

    expect(
      await screen.findByText(
        'Dieser QR-Code gehört zu keinem aktiven Objekt. Bitte erneut scannen oder die Objektnummer dem Meldebuch nennen.',
      ),
    ).toBeTruthy()
  })

  it('rejects an invalid token before any request', async () => {
    const calls: string[] = []
    stubFetch((url) => {
      calls.push(url)

      return Response.json(OBJECT)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/m/short']}>
            <Routes>
              <Route path="/m/:token" element={<QrLandingPage />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText('Dieser QR-Code ist ungültig. Bitte den Aufkleber des Objekts scannen.'),
    ).toBeTruthy()
    expect(calls).toHaveLength(0)
  })
})
