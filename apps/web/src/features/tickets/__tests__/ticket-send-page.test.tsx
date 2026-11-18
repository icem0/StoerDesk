import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketSendPage } from '../ticket-send-page'

const TICKET_NO = 'ST-2026-0001'

/**
 * The prepared send view is the printout and the source of the e-mail to the
 * customer: the internal comment (ADR-0034) never belongs into it.
 */
function fixture() {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111111',
      ticketNo: TICKET_NO,
      objectNo: '12345_01',
      objectName: 'Rathaus',
      status: 'NEW',
      priority: 'normal',
      title: null,
      description: null,
      faultTemplateKeys: [],
      source: 'INTERNAL',
      reportedAt: '2026-11-09T19:00:00.000Z',
      receivedAt: '2026-11-10T08:00:00.000Z',
      deadlineAt: '2026-11-12T19:00:00.000Z',
      reporterName: 'Erika Extern',
      reporterPhone: null,
      reporterEmail: null,
      recordedBy: 'Max Muster',
      statusToken: null,
      workOrderText: null,
      assignees: [],
    },
    events: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'comment',
        actorKind: 'user',
        actorName: 'Max Muster',
        payload: { text: 'Der Kunde kommt um zehn.' },
        createdAt: '2026-11-10T09:00:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'internal_comment',
        actorKind: 'user',
        actorName: 'Max Muster',
        payload: { text: 'Nur für die Kollegen' },
        createdAt: '2026-11-10T09:30:00.000Z',
      },
    ],
    photos: [],
    timeline: {
      reportedAt: '2026-11-09T19:00:00.000Z',
      deadlineAt: '2026-11-12T19:00:00.000Z',
      stoppedAt: null,
      pausedMs: 0,
      totalMs: 259_200_000,
      elapsedMs: 46_800_000,
      remainingMs: 212_400_000,
      percent: 18,
      state: 'green',
      pause: null,
      markers: [],
    },
    pauses: [],
    availableStages: [],
  }
}

function renderPage() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)

    if (path.includes('/settings/branding')) {
      return Response.json({ companyName: 'StörDesk Muster', titleEnabled: false, logo: '' })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    return Response.json(fixture())
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/tickets/${TICKET_NO}/send`]}>
          <Routes>
            <Route path="/tickets/:ticketNo/send" element={<TicketSendPage />} />
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

describe('TicketSendPage — the internal comment stays in the house', () => {
  it('shows the normal comment and leaves the internal comment out', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Der Kunde kommt um zehn.')).toBeTruthy())
    expect(screen.queryByText('Nur für die Kollegen')).toBeNull()
  })

  it('copies the normal comment only into the clipboard of the e-mail', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Der Kunde kommt um zehn.')).toBeTruthy())

    const content = document.querySelector('[data-testid="ticket-send-content"]')

    expect(content?.textContent).toContain('Der Kunde kommt um zehn.')
    expect(content?.textContent).not.toContain('Nur für die Kollegen')
  })
})
