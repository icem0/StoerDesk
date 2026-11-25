import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { ObjectTicketPage } from '../object-ticket-page'
import type { PublicObjectTicket } from '@stoerdesk/shared'

/**
 * The public view of an open ticket of the object (`specs/06-report-form.md`
 * §7.10.3/§7.10.4, ADR-0061).
 */

const TOKEN = 'Qr7tYw4KdBe3vLm2pQ7tYw'

const TICKET: PublicObjectTicket = {
  ticketNo: 'ST-0042',
  status: 'IN_REVIEW',
  reportedAt: '2026-11-01T09:00:00.000Z',
  deadlineAt: '2026-11-04T09:00:00.000Z',
  events: [
    { type: 'created', at: '2026-11-01T09:00:00.000Z' },
    { type: 'work_order_set', at: '2026-11-01T09:10:00.000Z' },
  ],
  comments: [{ at: '2026-11-01T10:00:00.000Z', text: 'Der Aufzug steht noch still.', faultTemplateKeys: [] }],
}

function stubFetch(answer: (url: string, method: string) => Response, calls: string[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)

      return answer(url, init?.method ?? 'GET')
    }),
  )
}

function renderPage(ticketNo = 'ST-0042') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/m/${TOKEN}/tickets/${ticketNo}`]}>
          <Routes>
            <Route path="/m/:token/tickets/:ticketNo" element={<ObjectTicketPage />} />
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

describe('ObjectTicketPage', () => {
  it('shows the ticket number, the status, the times and the public events', async () => {
    stubFetch(() => Response.json(TICKET))
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Vorgangsnummer ST-0042' })).toBeTruthy()
    expect(screen.getByTestId('status-badge') ?? screen.getByText('In Bearbeitung')).toBeTruthy()
    expect(screen.getByText('Der Aufzug steht noch still.')).toBeTruthy()
  })

  it('names the ticket that does not exist', async () => {
    stubFetch(() => Response.json({ code: 'ticket_not_found', params: {} }, { status: 404 }))
    renderPage()

    expect(
      await screen.findByText(
        'Diese Meldung existiert nicht (mehr) oder ist inzwischen geschlossen.',
      ),
    ).toBeTruthy()
  })

  it('sends the comment of the object and shows the confirmation', async () => {
    const calls: string[] = []
    stubFetch(
      (_url, method) =>
        method === 'POST'
          ? Response.json({ ticketNo: 'ST-0042', at: '2026-11-01T11:00:00.000Z' }, { status: 201 })
          : Response.json(TICKET),
      calls,
    )
    renderPage()

    const field = await screen.findByRole('textbox')
    fireEvent.change(field, { target: { value: 'Der Aufzug steht noch still.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ergänzung senden' }))

    await waitFor(() => expect(calls.some((call) => call.includes('/comments'))).toBe(true))
    expect(
      await screen.findByText(/Ihre Ergänzung wurde gespeichert/),
    ).toBeTruthy()
  })

  it('offers the way back to the object', async () => {
    stubFetch(() => Response.json(TICKET))
    renderPage()

    const back = await screen.findByRole('link', { name: 'Zurück zum Objekt' })

    expect(back.getAttribute('href')).toBe(`/m/${TOKEN}`)
  })
})
