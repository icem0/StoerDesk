import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { escalationRuleConfigSchema } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const RULE = {
  key: 'review',
  stageKey: 'review',
  reference: 'received_at',
  minutes: { low: 15, normal: 15, high: 15, critical: 5 },
  percent: null,
  condition: { all: [] },
  actions: [],
  active: true,
}

const CONFIG = {
  stages: [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }],
  rules: [RULE],
}

function writes(): { url: string; body: unknown }[] {
  return []
}

function renderPage(permissions: string[]) {
  const saved = writes()

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'admin@example.invalid', permissions },
      })
    }

    if (path.includes('/v1/escalation/config')) {
      if (init?.method === 'PUT') {
        saved.push({ url: '/v1/escalation/config', body: JSON.parse(String(init.body)) })
      }

      return Response.json(CONFIG)
    }

    if (path.includes('/v1/settings/deadlines')) {
      return Response.json({ hours: { low: 168, normal: 72, high: 24, critical: 8 } })
    }

    if (path.includes('/v1/escalation/channels')) {
      return Response.json({ channels: ['ntfy'] })
    }

    return Response.json({ webhooks: [] })
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

describe('the rule editor of the escalation page', () => {
  it('edits the minutes of a rule and saves with one request', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    const minutesInput = screen.getByLabelText('Niedrig', { exact: false }) as HTMLInputElement
    fireEvent.change(minutesInput, { target: { value: '20' } })

    await waitFor(() =>
      expect(saved).toHaveLength(1)
    )
    const first = saved[0] ?? { url: '', body: {} as unknown }

    expect(first.url).toBe('/v1/escalation/config')
    expect((first.body as Record<string, unknown>).rules).toEqual([
      { ...RULE, minutes: { ...RULE.minutes, low: 20 } },
    ])
  })

  it('builds a condition and refuses an invalid value', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Condition add' }))

    await waitFor(() =>
      expect(saved).toHaveLength(1)
    )
    const firstBody = (saved[0] ?? { body: {} as unknown }).body as Record<string, unknown>
    const condition = firstBody.rules as unknown[]
    const edited = condition[0] as Record<string, unknown>

    expect(edited.key).toBe(RULE.key)
    expect(edited.condition).toEqual({
      all: [{ field: 'priority', operator: 'eq', value: 'normal' }],
    })

    const minutesInput = screen.getByLabelText('Niedrig', { exact: false }) as HTMLInputElement
    fireEvent.change(minutesInput, { target: { value: '0' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(escalationRuleConfigSchema.safeParse({ ...RULE, minutes: { ...RULE.minutes, low: 0 } }).success).toBe(false)
  })

  it('stays read-only without settings.write', async () => {
    const saved = renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    expect(screen.queryByRole('button', { name: 'Condition add' })).toBeNull()
    expect(saved).toHaveLength(0)
  })
})
