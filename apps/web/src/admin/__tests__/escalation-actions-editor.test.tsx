import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { escalationActionConfigSchema } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const ENDPOINT_ID = '6f1d2c3b-4444-4a44-9444-444444444444'

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

const CONFIG = {
  stages: [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }],
  rules: [RULE],
}

function renderPage(permissions: string[]) {
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

      return Response.json(CONFIG)
    }

    if (path.includes('/v1/escalation/channels')) {
      return Response.json({ channels: ['ntfy', 'matrix'] })
    }

    if (path.includes('/v1/webhooks')) {
      return Response.json({ webhooks: [{ id: ENDPOINT_ID }] })
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

  it('stays read-only without settings.write', async () => {
    const saved = renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-action-list')).toBeTruthy())

    expect(screen.queryByRole('button', { name: 'Action add' })).toBeNull()
    expect(saved).toHaveLength(0)
  })
})
