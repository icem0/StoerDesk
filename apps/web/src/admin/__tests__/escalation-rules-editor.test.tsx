import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const RULE = {
  key: 'review',
  stageKey: 'review',
  condition: { all: [] },
  actions: [],
  active: true,
}

/** The seeded clock of the stage review (§7.2): a timer of the condition (ADR-0064). */
const TIMER = {
  field: 'timer_expired',
  operator: 'expired',
  value: { reference: 'received_at', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
}

const TIMED_RULE = { ...RULE, key: 'review#1', condition: { all: [TIMER] } }

const STAGES = [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }]

function writes(): { url: string; body: unknown }[] {
  return []
}

function renderPage(
  permissions: string[],
  pools: { id: string; name: string }[] = [],
  rules: unknown[] = [RULE],
) {
  const saved = writes()
  const CONFIG = { stages: STAGES, rules }

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

    if (path.includes('/v1/oncall/pools')) {
      return Response.json({ pools })
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
  it('edits the minutes of the timer of a rule and saves with one request', async () => {
    const saved = renderPage(['settings.read', 'settings.write'], [], [TIMED_RULE])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-timer')).toBeTruthy())

    const minutesInput = screen.getByLabelText('Niedrig (Min.)') as HTMLInputElement
    fireEvent.change(minutesInput, { target: { value: '20' } })

    await waitFor(() =>
      expect(saved).toHaveLength(1)
    )
    const first = saved[0] ?? { url: '', body: {} as unknown }

    expect(first.url).toBe('/v1/escalation/config')
    expect((first.body as Record<string, unknown>).rules).toEqual([
      {
        ...TIMED_RULE,
        condition: {
          all: [{ ...TIMER, value: { ...TIMER.value, minutes: { ...TIMER.value.minutes, low: 20 } } }],
        },
      },
    ])
  })

  it('shows the condition and the actions of a rule only — no frame „Zeitliche Abfolge“', async () => {
    renderPage(['settings.read'], [], [TIMED_RULE])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-timer')).toBeTruthy())

    expect(screen.queryByTestId('escalation-rule-timeline')).toBeNull()
    expect(screen.queryByText('Zeitliche Abfolge')).toBeNull()
    expect(screen.queryByLabelText('Start-Ereignis')).toBeNull()

    // The seeded timer of the stage review sits in the condition (§7.2).
    const timer = screen.getByTestId('escalation-condition-timer')
    const start = within(timer).getByLabelText('Startwert') as HTMLSelectElement

    expect(start.value).toBe('received_at')
    expect(start.disabled).toBe(true)
    expect((within(timer).getByLabelText('Kritisch (Min.)') as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText('Operator') as HTMLSelectElement).value).toBe('expired')
  })

  it('builds a condition and refuses an invalid value', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

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

    // The timer starts with the seeded clock; a delay of zero minutes is refused.
    fireEvent.change(screen.getByLabelText('Feld'), { target: { value: 'timer_expired' } })

    await waitFor(() => expect(saved).toHaveLength(2))
    expect(((saved[1]?.body as { rules: { condition: unknown }[] }).rules[0])?.condition).toEqual({
      all: [TIMER],
    })

    fireEvent.change(screen.getByLabelText('Niedrig (Min.)'), { target: { value: '0' } })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(saved).toHaveLength(2)
  })

  it('offers the deadline in percent as the start value of a timer', async () => {
    const saved = renderPage(['settings.read', 'settings.write'], [], [TIMED_RULE])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-timer')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Startwert'), { target: { value: 'deadline' } })

    await waitFor(() => expect(saved).toHaveLength(1))

    fireEvent.change(screen.getByLabelText('Prozent der Frist'), { target: { value: '80' } })

    await waitFor(() => expect(saved).toHaveLength(2))
    expect(((saved[1]?.body as { rules: { condition: unknown }[] }).rules[0])?.condition).toEqual({
      all: [{ field: 'timer_expired', operator: 'expired', value: { percent: 80 } }],
    })

    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'notExpired' } })

    await waitFor(() => expect(saved).toHaveLength(3))
    expect(((saved[2]?.body as { rules: { condition: unknown }[] }).rules[0])?.condition).toEqual({
      all: [{ field: 'timer_expired', operator: 'notExpired', value: { percent: 80 } }],
    })
  })

  it('offers the readiness pool in the condition of a rule', async () => {
    const pool = { id: '11111111-1111-4111-8111-111111111111', name: 'Bereitschaft Haustechnik' }
    const saved = renderPage(['settings.read', 'settings.write'], [pool])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

    const field = screen.getByLabelText('Feld') as HTMLSelectElement

    fireEvent.change(field, { target: { value: 'shift' } })

    const value = await screen.findByLabelText('Wert') as HTMLSelectElement

    expect(within(value).getByText('Bereitschaft Haustechnik')).toBeTruthy()

    fireEvent.change(value, { target: { value: pool.id } })

    await waitFor(() => expect(saved.length).toBeGreaterThan(1))

    const body = (saved.at(-1) ?? { body: {} as unknown }).body as Record<string, unknown>
    const rules = body.rules as unknown[]
    const edited = rules[0] as Record<string, unknown>

    expect(edited.condition).toEqual({
      all: [{ field: 'shift', operator: 'eq', value: pool.id }],
    })
  })

  it('shows the key of a stage before its names and its predecessor', async () => {
    renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    const stage = within(screen.getByTestId('escalation-stage-list')).getAllByRole('listitem')[0] as HTMLElement

    // The editor of a stage opens with „Bearbeiten“ (WP-M16-19).
    fireEvent.click(within(stage).getByRole('button', { name: 'Aktionen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    const labels = [...stage.querySelectorAll('label')].map((label) => label.textContent)

    expect(labels.slice(0, 3)).toEqual([
      'Schlüssel',
      'Name (Deutsch)',
      'Name (Englisch)',
    ])
    expect(labels[3]).toContain('Vorgänger')
    expect(labels[4]).toBe('Aktiv')

    const key = within(stage).getAllByLabelText('Schlüssel')[0] as HTMLInputElement

    expect(key.value).toBe('review')
    expect(key.readOnly).toBe(true)
  })

  it('shows no number for the rule of a stage', async () => {
    renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    expect(screen.queryByLabelText('Regel')).toBeNull()

    const stage = within(screen.getByTestId('escalation-stage-list')).getAllByRole('listitem')[0] as HTMLElement

    fireEvent.click(within(stage).getByRole('button', { name: 'Aktionen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    expect(screen.getAllByLabelText('Schlüssel')).toHaveLength(1)
  })

  it('shows the mode of the conditions below them and only with a condition', async () => {
    renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    expect(screen.queryByLabelText('Bedingung')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

    const leaves = screen.getByTestId('escalation-condition-leaves')
    const mode = screen.getByLabelText('Bedingung') as HTMLSelectElement

    expect(mode).toBeTruthy()
    expect(leaves.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('deletes a chosen condition and keeps the other one', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

    const operators = screen.getAllByLabelText('Operator') as HTMLSelectElement[]

    fireEvent.change(operators[1] as HTMLSelectElement, { target: { value: 'ne' } })

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung #1 entfernen' }))

    await waitFor(() => expect(saved.length).toBeGreaterThan(2))
    const body = ((saved.at(-1) ?? {}) as { body?: { rules?: { condition?: unknown }[] } }).body

    expect(body?.rules?.[0]?.condition).toEqual({
      all: [{ field: 'priority', operator: 'ne', value: 'normal' }],
    })
  })

  it('stays read-only without settings.write', async () => {
    const saved = renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    expect(screen.queryByRole('button', { name: 'Bedingung hinzufügen' })).toBeNull()
    expect(saved).toHaveLength(0)
  })
})
