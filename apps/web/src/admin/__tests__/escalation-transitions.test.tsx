import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { EscalationTransitions } from '../escalation-transitions'
import type { EscalationStageConfig } from '@stoerdesk/shared'

const stages: EscalationStageConfig[] = [
  {
    key: 'new',
    names: { de: 'Neu', en: 'New' },
    position: 1,
    active: true,
    predecessor: null,
    reachedBy: [],
  },
  {
    key: 'review',
    names: { de: 'Prüfung', en: 'Review' },
    position: 2,
    active: true,
    predecessor: 'new',
    reachedBy: ['review_started'],
  },
  {
    key: 'work_order',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    position: 3,
    active: true,
    predecessor: 'review',
    reachedBy: ['work_order_set'],
  },
]

const statuses = {
  statuses: [
    {
      key: 'NEW',
      nameDe: 'Neu',
      nameEn: 'New',
      color: '#6b7280',
      position: 1,
      active: true,
      isTerminal: false,
      ticketCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      key: 'IN_REVIEW',
      nameDe: 'In Prüfung',
      nameEn: 'In Review',
      color: '#d97706',
      position: 2,
      active: true,
      isTerminal: false,
      ticketCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      key: 'WORK_ORDER_CREATED',
      nameDe: 'Auftrag angelegt',
      nameEn: 'Work order created',
      color: '#2563eb',
      position: 3,
      active: true,
      isTerminal: false,
      ticketCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

const transitions = {
  transitions: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      fromStatus: 'NEW',
      toStatus: 'IN_REVIEW',
      eventKey: 'review_started',
      condition: null,
      active: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      fromStatus: 'IN_REVIEW',
      toStatus: 'WORK_ORDER_CREATED',
      eventKey: 'work_order_set',
      condition: null,
      active: true,
    },
  ],
}

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'admin@example.com',
      locale: 'de',
      theme: 'auto',
      roles: ['admin'],
      permissions,
    },
  }
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <EscalationTransitions stages={stages} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EscalationTransitions', () => {
  it('shows the transitions in the stages of the chain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['settings.read', 'settings.write']))
        }

        if (url.includes('/v1/admin/transitions')) {
          return Response.json(transitions)
        }

        return Response.json(statuses)
      }),
    )

    renderEditor()

    expect(await screen.findByText('review_started')).toBeTruthy()
    expect(screen.getByText('work_order_set')).toBeTruthy()
    // The first stage owns the status of the arrival, the second the status of
    // the review — the group names both.
    expect(screen.getByText('Neu · Neu')).toBeTruthy()
    expect(screen.getByText('Prüfung · In Prüfung')).toBeTruthy()
    expect(screen.getByText('Auftrag angelegt · Auftrag angelegt')).toBeTruthy()
  })

  it('changes the target status of a transition (the way back is free)', async () => {
    const patches: Record<string, unknown>[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['settings.read', 'settings.write']))
        }

        if (url.includes('/v1/admin/transitions') && init?.method === 'PATCH') {
          patches.push(JSON.parse(String(init.body)))

          return Response.json({
            id: '22222222-2222-4222-8222-222222222222',
            fromStatus: 'IN_REVIEW',
            toStatus: 'NEW',
            eventKey: 'work_order_set',
            condition: null,
            active: true,
          })
        }

        if (url.includes('/v1/admin/transitions')) {
          return Response.json(transitions)
        }

        return Response.json(statuses)
      }),
    )

    renderEditor()

    const select = await screen.findByLabelText('Zielstatus work_order_set')

    fireEvent.change(select, { target: { value: 'NEW' } })

    await waitFor(() => {
      expect(patches).toEqual([{ toStatus: 'NEW' }])
    })
  })

  it('names the error code of a rejected change', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['settings.read', 'settings.write']))
        }

        if (url.includes('/v1/admin/transitions') && init?.method === 'PATCH') {
          return Response.json(
            { code: 'invalid_status_key', params: { fields: ['toStatus'] } },
            { status: 400 },
          )
        }

        if (url.includes('/v1/admin/transitions')) {
          return Response.json(transitions)
        }

        return Response.json(statuses)
      }),
    )

    renderEditor()

    const select = await screen.findByLabelText('Zielstatus work_order_set')

    fireEvent.change(select, { target: { value: 'NEW' } })

    expect(await screen.findByText('Der Status-Schlüssel benennt keinen Status.')).toBeTruthy()
  })

  it('shows the dead end of a stage without a transition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/v1/me')) {
          return Response.json(meResponse(['settings.read', 'settings.write']))
        }

        if (url.includes('/v1/admin/transitions')) {
          return Response.json(transitions)
        }

        return Response.json(statuses)
      }),
    )

    renderEditor()

    expect(
      await screen.findByText('Kein Übergang: Das Ticket kann aus diesem Status nicht wechseln.'),
    ).toBeTruthy()
  })
})
