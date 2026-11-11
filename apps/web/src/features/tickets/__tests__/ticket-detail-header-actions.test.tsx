import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_ESCALATION_STAGES } from '@stoerdesk/shared'
import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0001'

function fixture(status: string) {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111111',
      ticketNo: TICKET_NO,
      objectNo: '12345_01',
      objectName: 'Rathaus',
      status,
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
      reporterEmail: 'erika@example.invalid',
      recordedBy: 'Max Muster',
      statusToken: null,
    },
    events: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'created',
        actorKind: 'user',
        actorName: 'Max Muster',
        payload: {},
        createdAt: '2026-11-10T08:00:00.000Z',
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
      markers: [{ type: 'created', at: '2026-11-10T08:00:00.000Z' }],
    },
    pauses: [],
  }
}

function renderPage(status = 'NEW') {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'max@example.invalid', permissions: [] },
      })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    if (path.includes('/v1/escalation-stages')) {
      return Response.json({ stages: DEFAULT_ESCALATION_STAGES })
    }

    return Response.json(fixture(status))
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/tickets/${TICKET_NO}`]}>
          <Routes>
            <Route path="/tickets/:ticketNo" element={<TicketDetailPage />} />
            <Route path="/tickets/:ticketNo/email" element={<div data-testid="email-page" />} />
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

describe('TicketDetailPage header actions', () => {
  it('shows the e-mail export and the cancel button in the header, not in the escalation section', async () => {
    renderPage()

    const header = await waitFor(() => screen.getByTestId('ticket-header-actions'))
    expect(within(header).getByRole('button', { name: 'E-Mail exportieren' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'Stornieren' })).toBeTruthy()

    const section = screen.getByTestId('ticket-action-section')
    expect(within(section).queryByRole('button', { name: 'E-Mail exportieren' })).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Stornieren' })).toBeNull()
  })

  it('opens the e-mail page from the header icon', async () => {
    renderPage()

    const button = await waitFor(() => screen.getByTestId('ticket-email-button'))
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByTestId('email-page')).toBeTruthy())
  })

  it('opens the cancel dialog from the header button', async () => {
    renderPage()

    const button = await waitFor(() => screen.getByTestId('ticket-cancel-button'))
    fireEvent.click(button)

    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(dialog.textContent).toContain('Stornieren')
    expect(within(dialog).getByLabelText('Stornierungsgrund (mind. 5 Zeichen)')).toBeTruthy()
  })

  it('offers the revocation of a cancellation instead of the cancel button', async () => {
    renderPage('CANCELLED')

    const button = await waitFor(() => screen.getByTestId('ticket-cancel-button'))
    expect(button.textContent).toBe('Stornierung aufheben')
  })

  it('has no way back to the list', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('ticket-action-section')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Zurück zur Liste' })).toBeNull()
    expect(screen.queryByText('Zurück zur Liste')).toBeNull()
  })
})
