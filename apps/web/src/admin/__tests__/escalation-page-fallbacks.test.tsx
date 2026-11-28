import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const STAGES = [
  {
    key: 'review',
    names: { de: 'Prüfung', en: 'Review' },
    position: 1,
    active: true,
    predecessor: null,
    reachedBy: ['review_started'],
  },
]

const RULE_WITHOUT_TIMER = {
  key: 'review#1',
  stageKey: 'review',
  condition: { all: [] },
  actions: [],
  active: true,
}

type Overrides = {
  deadlines?: () => Promise<Response>
  config?: { stages: unknown[]; rules: unknown[] }
}

function stubApi(overrides: Overrides = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)

      if (path.includes('/v1/me')) {
        return Response.json({
          user: {
            id: 'u1',
            email: 'admin@example.invalid',
            permissions: ['settings.read', 'settings.write'],
          },
        })
      }

      if (path.includes('/v1/settings/deadlines')) {
        return overrides.deadlines === undefined
          ? Response.json({ hours: { low: 168, normal: 72, high: 24, critical: 8 } })
          : overrides.deadlines()
      }

      if (path.includes('/v1/escalation/config')) {
        return Response.json(overrides.config ?? { stages: [], rules: [] })
      }

      if (path.includes('/v1/escalation/channels')) {
        return Response.json({ channels: [] })
      }

      if (path.includes('/v1/admin/statuses')) {
        return Response.json({ statuses: [] })
      }

      if (path.includes('/v1/oncall/pools')) {
        return Response.json({ pools: [] })
      }

      if (path.includes('/v1/groups')) {
        return Response.json({ groups: [] })
      }

      if (path.includes('/v1/users')) {
        return Response.json({ users: [] })
      }

      return Response.json({ webhooks: [] })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/escalation']}>
          <Routes>
            <Route path="/admin/escalation" element={<EscalationPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function valuesOf(inputs: HTMLElement[]) {
  return inputs.map((input) => (input as HTMLInputElement).value)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the fallbacks of the escalation page', () => {
  it('shows the deadline hours of ADR-0008 while the settings are pending', async () => {
    void i18n.changeLanguage('de')
    stubApi({ deadlines: () => new Promise<Response>(() => {}) })

    renderPage()

    const hours = await screen.findByTestId('escalation-hours')

    expect(valuesOf(within(hours).getAllByRole('spinbutton'))).toEqual(['168', '72', '24', '8'])
  })

  it('starts a new timer with the seeded minutes of ADR-0008', async () => {
    void i18n.changeLanguage('de')
    stubApi({ config: { stages: STAGES, rules: [RULE_WITHOUT_TIMER] } })

    renderPage()

    await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Stufen & Regeln' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bedingung hinzufügen' }))
    fireEvent.change(screen.getByLabelText('Feld'), { target: { value: 'timer_expired' } })

    const timer = await screen.findByTestId('escalation-condition-timer')

    expect((within(timer).getByLabelText('Startwert') as HTMLSelectElement).value).toBe(
      'received_at',
    )
    expect((within(timer).getByLabelText('Niedrig (Min.)') as HTMLInputElement).value).toBe('15')
    expect((within(timer).getByLabelText('Normal (Min.)') as HTMLInputElement).value).toBe('15')
    expect((within(timer).getByLabelText('Hoch (Min.)') as HTMLInputElement).value).toBe('15')
    expect((within(timer).getByLabelText('Kritisch (Min.)') as HTMLInputElement).value).toBe('5')
  })

})
