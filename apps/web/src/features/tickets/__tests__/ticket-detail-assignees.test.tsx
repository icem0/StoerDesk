import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0001'

/**
 * The technicians of a distributed ticket (`specs/07-escalation.md` §7.14,
 * ADR-0026, WP-M14-85b): the id and the name — no mail address, no telephone
 * number.
 */
const ASSIGNMENTS = [
  { id: '42424242-4242-4242-8242-424242424242', name: 'Max Muster' },
  { id: '53535353-5353-5353-8353-535353535353', name: 'Benno Beispiel' },
]

function fixture(status: string, assignees: { id: string; name: string }[]) {
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
      assignees,
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

function renderPage(status: string, assignees: { id: string; name: string }[]) {
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

    return Response.json(fixture(status, assignees))
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/tickets/${TICKET_NO}`]}>
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

describe('TicketDetailPage assignees', () => {
  it('names every technician of a distributed ticket', async () => {
    renderPage('ASSIGNED', ASSIGNMENTS)

    const row = await waitFor(() => screen.getByTestId('ticket-assignees'))
    expect(row.textContent).toContain('Zuweisen')

    for (const assignee of ASSIGNMENTS) {
      expect(row.textContent).toContain(assignee.name)
    }
  })

  it('shows no assignee row for a ticket without assignees', async () => {
    renderPage('NEW', [])

    await waitFor(() => expect(screen.getByTestId('ticket-action-section')).toBeTruthy())
    expect(screen.queryByTestId('ticket-assignees')).toBeNull()
  })

  it('names no contact value of a technician', async () => {
    renderPage('ASSIGNED', ASSIGNMENTS)

    const row = await waitFor(() => screen.getByTestId('ticket-assignees'))
    expect(row.textContent.includes('erika@example.invalid')).toBe(false)
  })
})
