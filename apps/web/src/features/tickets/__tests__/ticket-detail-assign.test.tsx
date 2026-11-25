import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0002'

/**
 * The assignment of the office (§7.14, ADR-0033): the panel of the `assigned`
 * stage names the target — a readiness pool, a user group or a technician —
 * taken from the escalation sources, and the route receives that target.
 */
function fixture(status: string) {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111112',
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
      assignees: [],
      assignee: null,
      assignmentStatus: null,
    },
    events: [
      {
        id: '22222222-2222-4222-8222-222222222223',
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
    availableStages: [
      {
        key: 'assignment',
        names: { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' },
        events: ['assigned', 'offered'],
      },
    ],
  }
}

const POOL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GROUP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const TARGETS = {
  pools: [
    {
      id: POOL_ID,
      name: 'Bereitschaft Früh',
      members: [{ id: USER_ID, name: 'Frank Techniker' }],
    },
  ],
  groups: [
    {
      id: GROUP_ID,
      name: 'Technikerteam',
      members: [{ id: USER_ID, name: 'Frank Techniker' }],
    },
  ],
  users: [
    { id: USER_ID, name: 'Frank Techniker' },
    { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Gina Techniker' },
  ],
}

function renderPage(): { writes: string[]; bodies: Record<string, unknown>[] } {
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

    if (path.includes('/v1/settings/display')) {
      return Response.json({ internalCommentColor: '#450a0a' })
    }

    if (path.includes('/v1/escalation-stages')) {
      return Response.json({ stages: [] })
    }

    if (path.includes('/v1/ticket-assign-targets')) {
      return Response.json(TARGETS)
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/`)) {
      const tail = path.split(`/v1/tickets/${TICKET_NO}/`)[1]

      writes.push(tail ?? '')
      bodies.push(init?.body === undefined ? {} : JSON.parse(String(init.body)))

      return Response.json({ ok: true })
    }

    return Response.json(fixture('WORK_ORDER_CREATED'))
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

describe('TicketDetailPage assignment target', () => {
  it('offers the pools, the groups and the technicians of the installation', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('ticket-stage-assigned')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-assigned'))

    const select = (await waitFor(() =>
      document.querySelector('select[name="assignTarget"]'),
    )) as HTMLSelectElement
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(5))

    const values = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(values).toStrictEqual([
      '',
      `pool:${POOL_ID}`,
      `group:${GROUP_ID}`,
      `user:${USER_ID}`,
      'user:ffffffff-ffff-4fff-8fff-ffffffffffff',
    ])
  })

  it('confirms only with a chosen target and posts it to the assign route', async () => {
    const { writes, bodies } = renderPage()

    await waitFor(() => expect(screen.getByTestId('ticket-stage-assigned')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ticket-stage-assigned'))

    const select = (await waitFor(() =>
      document.querySelector('select[name="assignTarget"]'),
    )) as HTMLSelectElement
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(5))

    const confirm = screen.getByRole('button', { name: 'Bestätigen' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(select, { target: { value: `pool:${POOL_ID}` } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toBe('assign')
    expect(bodies[0]).toStrictEqual({
      target: { kind: 'pool', id: POOL_ID },
      acceptance: true,
    })
  })
})
