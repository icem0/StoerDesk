import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_ESCALATION_STAGES } from '@stoerdesk/shared'
import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0001'

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
        id: '33333333-3333-4333-8333-333333333333',
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
  }
}

function renderPage() {
  const escalations: unknown[] = []

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

    if (path.includes('/v1/escalation-stages')) {
      return Response.json({ stages: DEFAULT_ESCALATION_STAGES })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/escalate`)) {
      escalations.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ type: 'escalation_set', payload: { stageKey: 'group' } })
    }

    return Response.json(fixture())
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

  return { escalations }
}

function stageSelect(): HTMLSelectElement {
  return screen.getByTestId('ticket-escalation-stage') as HTMLSelectElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('TicketDetailPage escalation section', () => {
  it('replaces the top-right menu with the escalation section', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('ticket-action-section')).toBeTruthy())
    expect(screen.queryByTestId('ticket-options-button')).toBeNull()
    expect(screen.getByTestId('ticket-escalation-stage')).toBeTruthy()
  })

  it('offers Kommentar and every configured stage and preselects the next one', async () => {
    renderPage()

    const select = await waitFor(() => stageSelect())
    const values = Array.from(select.options).map((option) => option.value)
    expect(values).toStrictEqual([
      '__comment__',
      ...DEFAULT_ESCALATION_STAGES.map((stage) => stage.key),
    ])

    // The last manual escalation went to `group`, so the next stage is `assignee`.
    const next = DEFAULT_ESCALATION_STAGES[2]?.names.de ?? ''
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Eskalation auf „${next}“ setzen` })).toBeTruthy(),
    )
  })

  it('lets an earlier stage be chosen and writes it', async () => {
    const { escalations } = renderPage()

    const select = await waitFor(() => stageSelect())
    fireEvent.change(select, { target: { value: 'office' } })

    const text = screen.getByLabelText('Beschreibung') as HTMLTextAreaElement
    fireEvent.change(text, { target: { value: 'Backwards to the office' } })

    const office = DEFAULT_ESCALATION_STAGES[0]?.names.de ?? ''
    fireEvent.click(
      screen.getByRole('button', { name: `Eskalation auf „${office}“ setzen` }),
    )

    await waitFor(() => expect(escalations).toHaveLength(1))
    expect(escalations[0]).toStrictEqual({
      stageKey: 'office',
      text: 'Backwards to the office',
    })
  })

  it('names the stage of a manual escalation in the history', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('ticket-history')).toBeTruthy())
    const history = screen.getByTestId('ticket-history').textContent ?? ''
    expect(history).toContain('Manuell eskaliert')
    expect(history).toContain('Eskalationsstufe: Gruppe')
    expect(history).toContain('Gruppe in Assignment nominated')
  })
})
