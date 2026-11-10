import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const REPORTED_AT = '2026-11-09T19:00:00.000Z'
const RECEIVED_AT = '2026-11-10T08:00:00.000Z'

function fixture() {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111111',
      ticketNo: 'ST-2026-0001',
      objectNo: '12345_01',
      objectName: 'Rathaus',
      status: 'NEW',
      priority: 'normal',
      title: null,
      description: null,
      faultTemplateKeys: [],
      source: 'INTERNAL',
      reportedAt: REPORTED_AT,
      receivedAt: RECEIVED_AT,
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
        payload: { reporterChannel: 'email', reporterKind: 'external' },
        createdAt: RECEIVED_AT,
      },
    ],
    photos: [],
    timeline: {
      reportedAt: REPORTED_AT,
      deadlineAt: '2026-11-12T19:00:00.000Z',
      stoppedAt: null,
      pausedMs: 0,
      totalMs: 259_200_000,
      elapsedMs: 46_800_000,
      remainingMs: 212_400_000,
      percent: 18,
      state: 'green',
      pause: null,
      markers: [{ type: 'created', at: RECEIVED_AT }],
    },
    pauses: [],
  }
}

function renderPage() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)

      if (path.includes('/v1/me')) {
        return Response.json({ user: { id: 'u1', email: 'max@example.invalid', permissions: [] } })
      }

      if (path.includes('/v1/text-templates')) {
        return Response.json({ templates: [] })
      }

      return Response.json(fixture())
    }),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/tickets/ST-2026-0001']}>
          <Routes>
            <Route path="/tickets/:ticketNo" element={<TicketDetailPage />} />
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

describe('TicketDetailPage report metadata', () => {
  it('shows the backdated report row, channel and reporter kind', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('history-reported')).toBeTruthy())
    expect(screen.getByTestId('history-reported').textContent).toContain('Meldung gemeldet')
    expect(screen.getByTestId('history-reported').textContent).toContain('Erika Extern')
    expect(screen.getAllByText('E-Mail').length).toBeGreaterThan(0)
    expect(screen.getByText('Externer Melder')).toBeTruthy()
    expect(screen.getByText('Erfasst am')).toBeTruthy()
  })
})
