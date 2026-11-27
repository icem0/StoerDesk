import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { escalationRuleConfigSchema } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

/** The seed timer of §7.2 for the stage `review` (ADR-0064). */
const TIMER = {
  field: 'timer_expired',
  operator: 'expired',
  value: { reference: 'received_at', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
}

/** A rule as the server answers it since WP-M45-02: the clock is the timer of its condition. */
const RULE = {
  key: 'review',
  stageKey: 'review',
  reference: null,
  minutes: null,
  percent: null,
  condition: { all: [TIMER] },
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

function renderPage(permissions: string[], pools: { id: string; name: string }[] = []) {
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
  it('edits the minutes of the timer in the condition and saves with one request', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-timer')).toBeTruthy())

    const timer = screen.getByTestId('escalation-condition-timer')
    const minutesInput = within(timer).getByLabelText('Niedrig') as HTMLInputElement

    expect(minutesInput.value).toBe('15')
    fireEvent.change(minutesInput, { target: { value: '20' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    const first = saved[0] ?? { url: '', body: {} as unknown }

    expect(first.url).toBe('/v1/escalation/config')
    expect((first.body as Record<string, unknown>).rules).toEqual([
      {
        ...RULE,
        condition: {
          all: [
            {
              ...TIMER,
              value: { reference: 'received_at', minutes: { ...TIMER.value.minutes, low: 20 } },
            },
          ],
        },
      },
    ])
  })

  it('switches the timer to another start value and to the percentage of the deadline', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-timer')).toBeTruthy())

    const timer = screen.getByTestId('escalation-condition-timer')
    const start = within(timer).getByLabelText('Start-Ereignis') as HTMLSelectElement

    expect(within(start).getByText('Meldung eingegangen')).toBeTruthy()
    fireEvent.change(start, { target: { value: 'review_started' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(
      ((saved[0]?.body as { rules: { condition: unknown }[] }).rules[0]?.condition as {
        all: { value: unknown }[]
      }).all[0]?.value,
    ).toEqual({ reference: 'review_started', minutes: TIMER.value.minutes })

    fireEvent.change(start, { target: { value: 'percent' } })

    await waitFor(() => expect(saved).toHaveLength(2))
    expect(within(timer).getByLabelText('Prozent der Frist')).toBeTruthy()
    expect(within(timer).queryByLabelText('Niedrig')).toBeNull()
    expect(
      ((saved[1]?.body as { rules: { condition: unknown }[] }).rules[0]?.condition as {
        all: { value: unknown }[]
      }).all[0]?.value,
    ).toEqual({ percent: 80 })
  })

  it('offers the timer as a field of a new condition with its own operators', async () => {
    const saved = renderPage(['settings.read', 'settings.write'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

    const fields = screen.getAllByLabelText('Feld') as HTMLSelectElement[]

    fireEvent.change(fields[1] as HTMLSelectElement, { target: { value: 'timer_expired' } })

    const operators = screen.getAllByLabelText('Operator') as HTMLSelectElement[]
    const operator = operators[1] as HTMLSelectElement

    expect([...operator.options].map((option) => option.textContent)).toEqual([
      'abgelaufen',
      'noch nicht abgelaufen',
    ])
    fireEvent.change(operator, { target: { value: 'notExpired' } })

    await waitFor(() => expect(saved.length).toBeGreaterThan(1))
    const body = (saved.at(-1) ?? { body: {} as unknown }).body as {
      rules: { condition: unknown }[]
    }

    expect(body.rules[0]?.condition).toEqual({
      all: [
        TIMER,
        {
          field: 'timer_expired',
          operator: 'notExpired',
          value: { reference: 'received_at', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
        },
      ],
    })
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
      all: [TIMER, { field: 'priority', operator: 'eq', value: 'normal' }],
    })

    const timer = screen.getByTestId('escalation-condition-timer')
    const minutesInput = within(timer).getByLabelText('Niedrig') as HTMLInputElement
    fireEvent.change(minutesInput, { target: { value: '0' } })

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(
      escalationRuleConfigSchema.safeParse({
        ...RULE,
        condition: {
          all: [{ ...TIMER, value: { ...TIMER.value, minutes: { ...TIMER.value.minutes, low: 0 } } }],
        },
      }).success,
    ).toBe(false)
  })

  it('offers the readiness pool in the condition of a rule', async () => {
    const pool = { id: '11111111-1111-4111-8111-111111111111', name: 'Bereitschaft Haustechnik' }
    const saved = renderPage(['settings.read', 'settings.write'], [pool])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-condition-leaves')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung hinzufügen' }))

    const field = screen.getAllByLabelText('Feld')[1] as HTMLSelectElement

    fireEvent.change(field, { target: { value: 'shift' } })

    const value = (await screen.findByLabelText('Wert')) as HTMLSelectElement

    expect(within(value).getByText('Bereitschaft Haustechnik')).toBeTruthy()

    fireEvent.change(value, { target: { value: pool.id } })

    await waitFor(() => expect(saved.length).toBeGreaterThan(1))

    const body = (saved.at(-1) ?? { body: {} as unknown }).body as Record<string, unknown>
    const rules = body.rules as unknown[]
    const edited = rules[0] as Record<string, unknown>

    expect(edited.condition).toEqual({
      all: [TIMER, { field: 'shift', operator: 'eq', value: pool.id }],
    })
  })

  it('shows the condition and the actions of a rule without the frame of the clock', async () => {
    renderPage(['settings.read'])

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    openStagesTab()
    await waitFor(() => expect(screen.getByTestId('escalation-rule-condition')).toBeTruthy())

    expect(screen.queryByTestId('escalation-rule-timeline')).toBeNull()
    expect(screen.queryByText('Zeitliche Abfolge')).toBeNull()

    // The seed timer of §7.2 opens in the condition — read-only without the permission.
    const timer = screen.getByTestId('escalation-condition-timer')
    const start = within(timer).getByLabelText('Start-Ereignis') as HTMLSelectElement

    expect(start.value).toBe('received_at')
    expect(start.disabled).toBe(true)
    expect((within(timer).getByLabelText('Kritisch') as HTMLInputElement).value).toBe('5')
    expect((within(timer).getByLabelText('Kritisch') as HTMLInputElement).disabled).toBe(true)
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
    await waitFor(() => expect(screen.getByTestId('escalation-rule-condition')).toBeTruthy())

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

    expect(screen.getByLabelText('Bedingung')).toBeTruthy()

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

    fireEvent.change(operators[2] as HTMLSelectElement, { target: { value: 'ne' } })

    fireEvent.click(screen.getByRole('button', { name: 'Bedingung #2 entfernen' }))

    await waitFor(() => expect(saved.length).toBeGreaterThan(2))
    const body = ((saved.at(-1) ?? {}) as { body?: { rules?: { condition?: unknown }[] } }).body

    expect(body?.rules?.[0]?.condition).toEqual({
      all: [TIMER, { field: 'priority', operator: 'ne', value: 'normal' }],
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
