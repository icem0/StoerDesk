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

function fixture(status: string, reachable: unknown[], extraEvents: unknown[] = []) {
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
      ...extraEvents,
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

function renderPage(
  status: string,
  reachable: unknown[],
  writeError?: { status: number; body: unknown },
  extraEvents: unknown[] = [],
): {
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

        // The colour of the internal entries under „Darstellung“ (WP-M14-149d,
        // WP-M18-01): the ticket view frames the entries of the house in it.
        if (path.includes('/v1/settings/display')) {
          return Response.json({ internalCommentColor: '#450a0a' })
        }

        // The stage chain of the installation (§7.9, WP-M14-152c): the history names
        // a firing with the display name of its stage and spares the first stage.
        if (path.includes('/v1/escalation-stages')) {
      return Response.json({
        stages: [
          { key: 'new', names: { de: 'Neu', en: 'New' }, predecessor: null },
          {
            key: 'review',
            names: { de: 'Prüfung', en: 'Review' },
            predecessor: 'new',
          },
        ],
      })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/`)) {
      const tail = path.split(`/v1/tickets/${TICKET_NO}/`)[1]

      writes.push(tail ?? '')
      bodies.push(init?.body === undefined ? {} : JSON.parse(String(init.body)))

      if (writeError !== undefined) {
        return Response.json(writeError.body, { status: writeError.status })
      }

      return Response.json({ ok: true })
    }

    return Response.json(fixture(status, reachable, extraEvents))
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

/**
 * The events of the stage buttons the view offers (WP-M14-153): every reachable
 * milestone stands next to the others as a button.
 */
function stageEvents(): string[] {
  const group = screen.getByTestId('ticket-escalation-stages')

  return Array.from(group.querySelectorAll('button')).map(
    (button) => (button.getAttribute('data-testid') ?? '').replace('ticket-stage-', ''),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('TicketDetailPage stage buttons', () => {
  it('offers the reachable stages of the ticket as buttons next to each other', async () => {
    const { writes } = renderPage(
      'WORK_ORDER_CREATED',
      stages('assignment', { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' },
        ['assigned', 'offered']),
    )

    await waitFor(() => expect(screen.getByTestId('ticket-action-section')).toBeTruthy())
    await waitFor(() => expect(stageEvents()).toStrictEqual(['assigned', 'offered']))
    expect(screen.getByRole('button', { name: 'Zuweisen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anbieten' })).toBeTruthy()
    expect(writes).toHaveLength(0)
  })

  it('a button performs the workflow route of the milestone', async () => {
    const { writes } = renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' },
      ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-review_started'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toBe('review')
  })

  it('the confirmation of a milestone stands below its buttons', async () => {
    renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' }, ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-review_started'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    const button = screen.getByTestId('ticket-stage-review_started')
    const confirm = screen.getByRole('button', { name: 'Bestätigen' })
    expect(
      button.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps the actions that are no milestone as buttons', async () => {
    renderPage('OFFERED', stages('acceptance', { de: 'Angenommen', en: 'Accepted' },
      ['accepted']))

    await waitFor(() => expect(stageEvents()).toStrictEqual(['accepted']))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ablehnen' })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'Angenommen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Annehmen' })).toBeNull()
  })

  it('the comment stays and goes to the comment route', async () => {
    const { bodies } = renderPage('NEW', stages('review', { de: 'Prüfung', en: 'Review' },
      ['review_started']))

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
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

  it('names the stage of a fired rule with the name of the stage and spares the first stage', async () => {
    renderPage(
      'IN_REVIEW',
      stages('work_order', { de: 'Auftrag angelegt', en: 'Work order created' },
        ['work_order_set']),
      undefined,
      [
        {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'escalated',
          actorKind: 'system',
          actorName: null,
          payload: {
            rule: 'new#1',
            stage: 'new',
            thresholdAt: '2026-11-10T08:15:00.000Z',
            deadlineAt: '2026-11-12T19:00:00.000Z',
          },
          createdAt: '2026-11-10T08:15:00.000Z',
        },
        {
          id: '55555555-5555-5555-8555-555555555555',
          type: 'escalated',
          actorKind: 'system',
          actorName: null,
          payload: {
            rule: 'review#1',
            stage: 'review',
            thresholdAt: '2026-11-10T09:00:00.000Z',
            deadlineAt: '2026-11-12T19:00:00.000Z',
          },
          createdAt: '2026-11-10T09:00:00.000Z',
        },
      ],
    )

    await waitFor(() => expect(screen.getByTestId('ticket-history')).toBeTruthy())
    const history = screen.getByTestId('ticket-history').textContent ?? ''

    expect(history).toContain('Eskaliert')
    expect(history).toContain('Eskalationsstufe: Prüfung')
    expect(history.includes('Eskalationsstufe: Neu')).toBe(false)
    expect(history.includes('Eskalationsstufe: new')).toBe(false)
    expect(history.includes('Eskalationsstufe: review')).toBe(false)
  })

  it('names the channel, the recipient and the configured target of a notification', async () => {
    renderPage(
      'IN_REVIEW',
      stages('work_order', { de: 'Auftrag angelegt', en: 'Work order created' },
        ['work_order_set']),
      undefined,
      [
        {
          id: '66666666-6666-6666-8666-666666666666',
          type: 'notification_sent',
          actorKind: 'system',
          actorName: null,
          payload: {
            channel: 'ntfy',
            ticketNo: TICKET_NO,
            attempts: 1,
            rule: 'review#1',
            stage: 'review',
            target: 'SiTec',
            recipient: 'Erik Escalation',
          },
          createdAt: '2026-11-10T09:01:00.000Z',
        },
      ],
    )

    await waitFor(() => expect(screen.getByTestId('ticket-history')).toBeTruthy())
    const history = screen.getByTestId('ticket-history').textContent ?? ''

    expect(history).toContain('Benachrichtigung gesendet')
    expect(history).toContain('ntfy · Empfäng: Erik Escalation · Target: SiTec')
    expect(history).toContain('Eskalationsstufe: Prüfung')
  })

  it('frames the entries of the house in the colour of the Darstellung', async () => {
    renderPage(
      'IN_REVIEW',
      stages('work_order', { de: 'Auftrag angelegt', en: 'Work order created' },
        ['work_order_set']),
      undefined,
      [
        {
          id: '77777777-7777-4777-8777-777777777771',
          type: 'internal_comment',
          actorKind: 'user',
          actorName: 'Max Muster',
          payload: { text: 'Nur für die Kollegen' },
          createdAt: '2026-11-10T09:02:00.000Z',
        },
        {
          id: '77777777-7777-4777-8777-777777777772',
          type: 'escalation_note',
          actorKind: 'system',
          actorName: null,
          payload: { rule: 'review#1', stage: 'review', from: 'NEW', to: 'IN_REVIEW' },
          createdAt: '2026-11-10T09:03:00.000Z',
        },
        {
          id: '77777777-7777-4777-8777-777777777773',
          type: 'notification_failed',
          actorKind: 'system',
          actorName: null,
          payload: { channel: 'ntfy', recipient: 'Erik Escalation', target: 'SiTec' },
          createdAt: '2026-11-10T09:04:00.000Z',
        },
        {
          id: '77777777-7777-4777-8777-777777777774',
          type: 'assigned',
          actorKind: 'user',
          actorName: 'Max Muster',
          payload: {},
          createdAt: '2026-11-10T09:05:00.000Z',
        },
      ],
    )

    await waitFor(() => expect(screen.getByTestId('ticket-history')).toBeTruthy())
    const history = screen.getByTestId('ticket-history')
    const framed = Array.from(history.querySelectorAll('[data-testid="history-internal"]'))

    expect(framed).toHaveLength(4)

    for (const row of framed) {
      expect(String(row.getAttribute('style') ?? '')).toContain('rgb(69, 10, 10)')
    }

    const rows = Array.from(history.children)
    const workflowRow = rows.find((row) => (row.textContent ?? '').includes('Zugewiesen'))
    const historicStageRow = rows.find((row) =>
      (row.textContent ?? '').includes('Manuell eskaliert'),
    )

    expect(workflowRow?.getAttribute('style')).toBeNull()
    expect(String(historicStageRow?.getAttribute('style') ?? '')).toContain(
      'rgb(69, 10, 10)',
    )
  })
})

describe('TicketDetailPage names the reason of a failed action', () => {
  it('names the status of the ticket when the step is not possible', async () => {
    renderPage(
      'NEW',
      stages('review', { de: 'Prüfung', en: 'Review' }, ['review_started']),
      {
        status: 409,
        body: {
          code: 'invalid_transition',
          params: { ticketNo: TICKET_NO, from: 'IN_REVIEW', event: 'assigned' },
        },
      },
    )

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-review_started'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Dieser Schritt ist im Status „In Prüfung“ nicht möglich.',
      ),
    )
  })

  it('names the rejected input when the server refuses the body', async () => {
    renderPage(
      'NEW',
      stages('review', { de: 'Prüfung', en: 'Review' }, ['review_started']),
      { status: 400, body: { code: 'invalid_request', params: {} } },
    )

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-review_started'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Die Angaben wurden abgelehnt. Bitte die Eingaben prüfen.',
      ),
    )
  })

  it('keeps the generic notice for a code without a text', async () => {
    renderPage(
      'NEW',
      stages('review', { de: 'Prüfung', en: 'Review' }, ['review_started']),
      { status: 500, body: { code: 'internal_error', params: {} } },
    )

    await waitFor(() => expect(screen.getByTestId('ticket-escalation-stages')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-review_started'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Die Aktion konnte nicht ausgeführt werden.',
      ),
    )
  })
})
