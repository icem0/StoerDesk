import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CustomerTicketSummary } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { PortalTicketsPage } from '../portal-tickets-page'

/**
 * The landing page of the customer (`specs/19-customer-portal.md` §19.5,
 * ADR-0061): the open tickets first, the closed ones below, and exactly one
 * open ticket opens its detail directly.
 */

function ticket(overrides: Partial<CustomerTicketSummary>): CustomerTicketSummary {
  return {
    ticketNo: 'ST-0001',
    title: null,
    objectName: 'Aufzug Nord',
    priority: 'normal',
    status: 'NEW',
    reportedAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    open: true,
    emailNotifications: false,
    ...overrides,
  }
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
        <MemoryRouter initialEntries={['/portal']}>
          <Routes>
            <Route path="/portal" element={<PortalTicketsPage />} />
            <Route path="/portal/tickets/:ticketNo" element={<div data-testid="ticket-detail" />} />
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

describe('PortalTicketsPage', () => {
  it('shows the open tickets first and the closed ones below them', async () => {
    stubFetch((url) =>
      url.includes('/v1/customer/tickets')
        ? Response.json({
            tickets: [
              ticket({ ticketNo: 'ST-0001', open: true }),
              ticket({ ticketNo: 'ST-0003', open: true }),
              ticket({ ticketNo: 'ST-0002', open: false, status: 'CLOSED' }),
            ],
          })
        : Response.json({ objects: [] }),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Offene Meldungen' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Abgeschlossene Meldungen' })).toBeTruthy()
    expect(screen.getByText(/ST-0001/)).toBeTruthy()
    expect(screen.getByText(/ST-0002/)).toBeTruthy()
  })

  it('opens the detail of the one open ticket directly', async () => {
    stubFetch((url) =>
      url.includes('/v1/customer/tickets')
        ? Response.json({
            tickets: [
              ticket({ ticketNo: 'ST-0001', open: true }),
              ticket({ ticketNo: 'ST-0002', open: false, status: 'CLOSED' }),
            ],
          })
        : Response.json({ objects: [] }),
    )
    renderPage()

    expect(await screen.findByTestId('ticket-detail')).toBeTruthy()
  })

  it('shows the list when more than one ticket is open', async () => {
    stubFetch((url) =>
      url.includes('/v1/customer/tickets')
        ? Response.json({
            tickets: [
              ticket({ ticketNo: 'ST-0001', open: true }),
              ticket({ ticketNo: 'ST-0003', open: true }),
            ],
          })
        : Response.json({ objects: [] }),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Offene Meldungen' })).toBeTruthy()
    expect(screen.queryByTestId('ticket-detail')).toBeNull()
  })

  it('names an empty portal', async () => {
    stubFetch((url) =>
      url.includes('/v1/customer/tickets')
        ? Response.json({ tickets: [] })
        : Response.json({ objects: [] }),
    )
    renderPage()

    expect(
      await screen.findByText('Sie haben zurzeit keine offene Meldung.'),
    ).toBeTruthy()
  })
})
