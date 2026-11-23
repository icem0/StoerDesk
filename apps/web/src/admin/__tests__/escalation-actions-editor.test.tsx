import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { escalationActionConfigSchema } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const ENDPOINT_ID = '6f1d2c3b-4444-4a44-9444-444444444444'
const POOL_ID = '7a1b2c3d-5555-4a55-9555-555555555555'
const GROUP_ID = '8b2c3d4e-6666-4b66-9666-666666666666'
const USER_ID = '9c3d4e5f-7777-4c77-8777-777777777777'

const NOTIFY_ACTION = {
  key: 'notify_office',
  type: 'notify',
  channels: ['ntfy'],
  condition: { all: [] },
}

const RULE = {
  key: 'review',
  stageKey: 'review',
  reference: 'received_at',
  minutes: { low: 15, normal: 15, high: 15, critical: 5 },
  percent: null,
  condition: { all: [] },
  actions: [NOTIFY_ACTION],
  active: true,
}

const SECOND_ACTION = {
  key: 'notify_management',
  type: 'notify',
  channels: ['ntfy'],
  condition: { all: [] },
}

const CONFIG = {
  stages: [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }],
  rules: [RULE],
}

const TWO_ACTIONS_CONFIG = {
  stages: CONFIG.stages,
  rules: [{ ...RULE, actions: [NOTIFY_ACTION, SECOND_ACTION] }],
}

function renderPage(permissions: string[], config: unknown = CONFIG) {
  const saved: unknown[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'admin@example.invalid', permissions },
      })
    }

    if (path.includes('/v1/escalation/config')) {
      if (init?.method === 'PUT') {
        saved.push(JSON.parse(String(init.body)))
      }

      return Response.json(config)
    }

    if (path.includes('/v1/escalation/channels')) {
      return Response.json({ channels: ['ntfy', 'matrix'] })
    }

    if (path.includes('/v1/webhooks')) {
      return Response.json({ webhooks: [{ id: ENDPOINT_ID }] })
    }

    if (path.includes('/v1/oncall/pools')) {
      return Response.json({
        pools: [
          { id: POOL_ID, name: 'Bereitschaft Alpha', groupId: null, active: true, shiftCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: '00000000-0000-4000-8000-000000000000', name: '  ', groupId: null, active: true, shiftCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      })
    }

    if (path.includes('/v1/users')) {
      return Response.json({
        users: [
          {
            id: USER_ID,
            email: 'nora.notify@example.invalid',
            givenName: 'Nora',
            familyName: 'Notify',
            locale: 'de',
            theme: 'auto',
            active: true,
            roleKeys: [],
          },
        ],
      })
    }

    if (path.includes('/v1/groups')) {
      return Response.json({
        groups: [
          { id: GROUP_ID, name: 'Verteilergruppe', userCount: 0 },
          { id: '00000000-0000-4000-8000-000000000001', name: '', userCount: 0 },
        ],
      })
    }

    if (path.includes('/v1/admin/statuses')) {
      return Response.json({
        statuses: [
          { key: 'NEW', nameDe: 'Neu', nameEn: 'New', color: '#6b7280', position: 0, active: true, isTerminal: false, ticketCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { key: 'IN_REVIEW', nameDe: 'In Prüfung', nameEn: 'In Review', color: '#6b7280', position: 1, active: true, isTerminal: false, ticketCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { key: 'DORMANT', nameDe: 'Inaktive', nameEn: 'Dormant', color: '#6b7280', position: 2, active: false, isTerminal: false, ticketCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      })
    }

    return Response.json({ hours: { low: 168, normal: 72, high: 24, critical: 8 } })
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={ ['/admin/escalation'] }>
          <Routes>
            <Route path="/admin/escalation" element={<EscalationPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return saved
}

function openStagesTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Stufen & Regeln' }))
}

describe('the action editor of the escalation page', () => {
  it('changes an action to a webhook action and saves it', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'webhook' } })

    const endpoints = screen.getByTestId('escalation-action-list').querySelector('select[multiple]') as HTMLSelectElement
    fireEvent.change(endpoints, { target: { value: [ENDPOINT_ID] } })

    await waitFor(() => expect(saved).toHaveLength(1))
    const firstBody = (saved[0] ?? {}) as { rules?: unknown[] }
    const firstRule = { ...((firstBody.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(firstRule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'webhook',
        endpointIds: [ENDPOINT_ID],
        condition: { all: [] },
      },
    ])
  })

  it('changes an action to a status_change action and saves it with its target', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'status_change' } })

    const targetSelect = screen.getByTestId('escalation-action-status-target') as unknown as HTMLSelectElement
    const offered = Array.from(targetSelect.options).map((option) => (option as { value: string }).value)
    expect(offered).toEqual(['NEW', 'IN_REVIEW'])
    fireEvent.change(targetSelect, { target: { value: 'IN_REVIEW' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    const body = (saved[0] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'status_change',
        toStatus: 'IN_REVIEW',
        condition: { all: [] },
      },
    ])
  })

  it('shows the number of an action at the left of its row', async () => {
    renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const list = screen.getByTestId('escalation-action-list')

    expect(within(list).getByText('Aktion #1')).toBeTruthy()
    expect(within(list).queryByLabelText('Schlüssel')).toBeNull()
    expect(within(list).queryByLabelText('Aktion')).toBeNull()
  })

  it('deletes a chosen action and keeps the other one', async () => {
    const saved = renderPage(['settings.read', 'settings.write'], TWO_ACTIONS_CONFIG)

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Aktion #1 entfernen' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    const body = (saved[0] ?? {}) as { rules?: { actions?: unknown[] }[] }

    expect(body.rules?.[0]?.actions).toEqual([
      {
        key: SECOND_ACTION.key,
        type: 'notify',
        channels: ['ntfy'],
        condition: { all: [] },
      },
    ])
  })

  it('hides the key of a note action and saves no key', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const list = screen.getByTestId('escalation-action-list')
    const typeSelect = list.querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'history' } })

    expect(within(list).queryByLabelText('Schlüssel')).toBeNull()

    fireEvent.change(within(list).getByLabelText('Text'), {
      target: { value: 'Das Büro wurde informiert.' },
    })

    await waitFor(() => {
      const latest = (saved.at(-1) ?? {}) as {
        rules?: { actions?: { type?: string; text?: string }[] }[]
      }
      expect(latest.rules?.[0]?.actions?.[0]?.text).toBe('Das Büro wurde informiert.')
    })
    const body = (saved.at(-1) ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }

    expect(rule.actions).toEqual([
      {
        type: 'history',
        text: 'Das Büro wurde informiert.',
        condition: { all: [] },
      },
    ])
  })

  it('refuses a status_change action without a target status', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'status_change' } })

    await waitFor(() => expect(saved).toHaveLength(0))
    expect(
      escalationActionConfigSchema.safeParse({ key: NOTIFY_ACTION.key, type: 'status_change', toStatus: '', condition: { all: [] } }).success,
    ).toBe(false)
  })

  it('offers the ticket to a readiness pool and saves its target', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'offer' } })

    const kindSelect = screen.getByTestId('escalation-action-target-kind') as unknown as HTMLSelectElement
    expect(Array.from(kindSelect.options).map((option) => (option as { value: string }).value)).toEqual(['pool', 'group', 'user'])

    const targetSelect = screen.getByTestId('escalation-action-target') as unknown as HTMLSelectElement
    const offered = Array.from(targetSelect.options).map((option) => (option as { value: string }).value)
    expect(offered).toEqual(['', POOL_ID])
    fireEvent.change(targetSelect, { target: { value: POOL_ID } })

    await waitFor(() => expect(saved).toHaveLength(1))
    const body = (saved[0] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'offer',
        target: { kind: 'pool', id: POOL_ID },
        condition: { all: [] },
      },
    ])
  })

  it('assigns the ticket from the pool of the office (WP-M19-05)', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'assign' } })

    const modeSelect = screen.getByTestId('escalation-assign-mode') as unknown as HTMLSelectElement
    expect(Array.from(modeSelect.options).map((option) => (option as { value: string }).value)).toEqual([
      'pool',
      'user',
    ])
    expect(modeSelect.value).toBe('pool')

    const acceptance = screen.getByTestId('escalation-assign-acceptance') as unknown as HTMLInputElement
    expect(acceptance.checked).toBe(true)

    await waitFor(() => expect(saved.length).toBeGreaterThan(0))
    const body = (saved[saved.length - 1] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'assign',
        mode: 'pool',
        acceptance: true,
        condition: { all: [] },
      },
    ])
  })

  it('assigns the ticket to one fixed technician (WP-M19-05)', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'assign' } })

    const modeSelect = screen.getByTestId('escalation-assign-mode') as unknown as HTMLSelectElement
    fireEvent.change(modeSelect, { target: { value: 'user' } })

    const userSelect = screen.getByTestId('escalation-assign-user') as unknown as HTMLSelectElement
    const offered = Array.from(userSelect.options).map((option) => (option as { value: string }).value)
    expect(offered).toEqual(['', USER_ID])
    fireEvent.change(userSelect, { target: { value: USER_ID } })

    await waitFor(() => expect(saved.length).toBeGreaterThan(0))
    const body = (saved[saved.length - 1] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'assign',
        mode: 'user',
        user: USER_ID,
        acceptance: true,
        condition: { all: [] },
      },
    ])
  })

  it('notifies the technician of the ticket with the target assigned', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const kindSelect = screen.getByTestId('escalation-notify-target-kind') as unknown as HTMLSelectElement
    const kinds = Array.from(kindSelect.options).map((option) => (option as { value: string }).value)
    expect(kinds).toEqual(['user', 'pool', 'assigned', 'assigner'])
    fireEvent.change(kindSelect, { target: { value: 'assigned' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    const body = (saved[0] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'notify',
        target: { kind: 'assigned' },
        condition: { all: [] },
      },
    ])
  })

  it('separates the target of a notification from the way (ADR-0037)', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const list = screen.getByTestId('escalation-action-list')

    // Without a target the action is the broadcast of the installation.
    expect(within(list).getByText('Kein Ziel — Rundsendung an die Kanäle der Installation')).toBeTruthy()
    expect(list.querySelector('select[multiple]')).toBeTruthy()

    const target = screen.getByTestId('escalation-notify-target') as unknown as HTMLSelectElement
    fireEvent.change(target, { target: { value: USER_ID } })

    // With a target the channels of the installation disappear and the hint
    // names the way of the recipient.
    await waitFor(() => expect(list.querySelector('select[multiple]')).toBeNull())
    expect(within(list).getByText(/die Kanäle, die es selbst ausgewählt hat/)).toBeTruthy()

    await waitFor(() => expect(saved).toHaveLength(1))
    const body = (saved[0] ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'notify',
        target: { kind: 'user', id: USER_ID },
        condition: { all: [] },
      },
    ])
  })

  it('refuses an offer action without a target', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const typeSelect = screen.getByTestId('escalation-action-list').querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'offer' } })

    await waitFor(() => expect(saved).toHaveLength(0))
    expect(
      escalationActionConfigSchema.safeParse({ key: NOTIFY_ACTION.key, type: 'offer', target: { kind: 'pool', id: '' }, condition: { all: [] } }).success,
    ).toBe(false)
  })

  it('refuses a notify action without a channel', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const channelsSelect = screen.getByTestId('escalation-action-list').querySelector('select[multiple]') as HTMLSelectElement
    fireEvent.change(channelsSelect, { target: { value: [] } })

    await waitFor(() => expect(saved).toHaveLength(0))
    expect(
      escalationActionConfigSchema.safeParse({ ...NOTIFY_ACTION, channels: [] }).success,
    ).toBe(false)
  })

  it('notifies a user with the selected ntfy priority', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    const target = screen.getByTestId('escalation-notify-target') as unknown as HTMLSelectElement
    const offered = Array.from(target.options).map((option) => (option as { value: string }).value)
    expect(offered).toContain(USER_ID)
    fireEvent.change(target, { target: { value: USER_ID } })

    const priority = screen.getByTestId('escalation-notify-priority') as unknown as HTMLSelectElement
    const levels = Array.from(priority.options).map((option) => (option as { value: string }).value)
    expect(levels).toEqual(['', 'min', 'low', 'default', 'high', 'urgent'])
    fireEvent.change(priority, { target: { value: 'urgent' } })

    await waitFor(() => {
      const latest = (saved.at(-1) ?? {}) as { rules?: { actions?: { priority?: string }[] }[] }
      expect(latest.rules?.[0]?.actions?.[0]?.priority).toBe('urgent')
    })
    const body = (saved.at(-1) ?? {}) as { rules?: unknown[] }
    const rule = { ...((body.rules ?? [])[0] ?? {}) as Record<string, unknown> }
    expect(rule.actions).toEqual([
      {
        key: NOTIFY_ACTION.key,
        type: 'notify',
        target: { kind: 'user', id: USER_ID },
        priority: 'urgent',
        condition: { all: [] },
      },
    ])
  })

  it('stays read-only without settings.write', async () => {
    const saved = renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    expect(screen.queryByRole('button', { name: 'Action add' })).toBeNull()
    expect(saved).toHaveLength(0)
  })
})
