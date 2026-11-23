import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

/**
 * The state of an assignment in the ticket view (§7.14, ADR-0039,
 * WP-M19-06): the status of the assignment has its own label, and the assigned
 * technician answers the assignment.
 */

const TICKET_NO = 'ST-2026-0003'
const TECHNICIAN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OFFICE_USER_ID = 'u1'

function fixture(assignmentStatus: string | null) {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111113',
      ticketNo: TICKET_NO,
      objectNo: '12345_01',
      objectName: 'Rathaus',
      status: 'ASSIGNED',
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
      assignees: [],
      assignee: { id: TECHNICIAN_ID, name: 'Erika Techniker' },
      assignmentStatus,
    },
    events: [],
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

function renderPage(meId: string): { writes: string[]; bodies: Record<string, unknown>[] } {
  const writes: string[] = []
  const bodies: Record<string, unknown>[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: meId, email: 'max@example.invalid', permissions: [] },
      })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    if (path.includes('/v1/settings/display')) {
      return Response.json({ internalCommentColor: '#450a0a' })
    }

    if (path.includes('/v1/escalation-stages')) {
      return Response.json({ stages: [] })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/`)) {
      const tail = path.split(`/v1/tickets/${TICKET_NO}/`)[1]

      writes.push(tail ?? '')
      bodies.push(init?.body === undefined ? {} : JSON.parse(String(init.body)))

      return Response.json({ ok: true })
    }

    return Response.json(fixture('offered'))
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

  return { writes, bodies }
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('the state of an assignment in the ticket view', () => {
  it('names the status of the assignment', async () => {
    renderPage(OFFICE_USER_ID)

    const status = await waitFor(() => screen.getByTestId('ticket-assignment-status'))
    expect(status.textContent).toContain('Angeboten')
  })

  it('offers the answer to the assigned technician', async () => {
    const { writes, bodies } = renderPage(TECHNICIAN_ID)

    await waitFor(() => expect(screen.getByTestId('ticket-assignment-accept')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-assignment-decline'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toBe('assignment-answer')
    expect(bodies[0]).toStrictEqual({ answer: 'declined' })
  })

  it('offers no answer to another colleague', async () => {
    renderPage(OFFICE_USER_ID)

    await waitFor(() => expect(screen.getByTestId('ticket-assignment-status')).toBeTruthy())
    expect(screen.queryByTestId('ticket-assignment-accept')).toBeNull()
    expect(screen.queryByTestId('ticket-assignment-decline')).toBeNull()
  })
})
