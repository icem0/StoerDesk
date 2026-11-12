import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0001'

/**
 * The reachable stages the server answers with the ticket (`WP-M13-08`): the
 * stage key, its localized names and the events that reach the milestone.
 */
function stages(key: string, names: Record<string, string>, events: string[]) {
  return [{ key, names, events }]
}

function fixture(status: string, reachable: unknown[]) {
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
      {
        id: '33322222-2222-4222-8222-222222222222',
        type: 'escalation_set',
        actorKind: 'user',
        actorName: 'Max Muster',
        payload: {
          stageKey: 'group',
          stageName: 'Gruppe',
          text: 'Gruppe in Assignment nominated',
        },
        createdAt: '2026-11-10T09:00:00.000Z',
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
    availableStages: reachable,
  }
}

function renderPage(status: string, reachable: unknown[]): {
  writes: string[]
  bodies: Record<string, unknown>[]
} {
  const writes: string[] = []
  const bodies: Record<string, unknown>[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'max@example.invalid', permissions: [] },
      })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/`)) {
      const tail = path.split(`/v1/tickets/${TICKET_NO}/`)[1]

      writes.push(tail ?? '')
      bodies.push(init?.body === undefined ? {} : JSON.parse(String(init.body)))

      return Response.json({ ok: true })
    }

    return Response.json(fixture(status, reachable))
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

function stageOptions(): string[] {
  const select = screen.getByTestId('ticket-escalation-stage') as HTMLSelectElement

  return Array.from(select.options).map((option) => option.value)
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('TicketDetailPage stage selection', () => {
  it('offers the reachable stages of the ticket instead of the workflow buttons', async () => {
    const { writes } = renderPage(
      'WORK_ORDER_CREATED',
      stages('assignment', { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' },
        ['assigned', 'offered']),
    )

    await waitFor(() => expect(screen.getByTestId('ticket-action-section')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Zuweisen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anbieten' })).toBeNull()
    expect(stageOptions()).toStrictEqual(['', 'assigned', 'offered'])
    expect(writes).toHaveLength(0)
  })

  it('a choice performs the workflow route of the milestone', async () => {
    const { writes } = renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' },
      ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stage')).toBeTruthy())
    const select = screen.getByTestId('ticket-escalation-stage') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'review_started' } })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toBe('review')
  })

  it('keeps the actions that are no milestone as buttons', async () => {
    renderPage('OFFERED', stages('acceptance', { de: 'Angenommen', en: 'Accepted' },
      ['accepted']))

    await waitFor(() => expect(stageOptions()).toStrictEqual(['', 'accepted']))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ablehnen' })).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: 'Annehmen' })).toBeNull()
  })

  it('the comment stays and goes to the comment route', async () => {
    const { bodies } = renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' },
      ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stage')).toBeTruthy())
    const text = screen.getByLabelText('Kommentar') as HTMLTextAreaElement
    fireEvent.change(text, { target: { value: 'Pump not working' } })
    fireEvent.click(screen.getByTestId('ticket-escalation-submit'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect((bodies[0] ?? {}).text).toBe('Pump not working')
    expect(typeof (bodies[0] ?? {}).clientUuid).toBe('string')
  })

  it('names the stage of a historic manual escalation in the history', async () => {
    renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' }, ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-history')).toBeTruthy())
    const history = screen.getByTestId('ticket-history').textContent ?? ''
    expect(history).toContain('Manuell eskaliert')
    expect(history).toContain('Eskalationsstufe: Gruppe')
  })
})
