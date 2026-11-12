import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EscalationPage } from '../escalation-page'

const RULE = {
  key: 'review',
  stageKey: 'review',
  reference: 'work_order_set',
  minutes: { low: 15, normal: 15, high: 15, critical: 5 },
  percent: null,
  condition: { all: [{ field: 'priority', operator: 'eq', value: 'critical' }] },
  actions: [{ key: 'notify_office', type: 'notify', channels: ['ntfy', 'email'], condition: { all: [] } }],
  active: true,
}

const CONFIG = {
  stages: [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }],
  rules: [RULE],
}

function fetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'admin@example.invalid', permissions: ['settings.read'] },
      })
    }

    if (path.includes('/v1/escalation/config')) {
      return Response.json(CONFIG)
    }

    if (path.includes('/v1/escalation/channels')) {
      return Response.json({ channels: ['ntfy', 'email'] })
    }

    return Response.json({ webhooks: [] })
  })
}

async function renderPage(language: string, tabName: string) {
  void i18n.changeLanguage(language)
  vi.stubGlobal('fetch', fetchMock())

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
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

  await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())

  fireEvent.click(screen.getByRole('button', { name: tabName }))

  await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())
}

function optionTexts(): string[] {
  const page = screen.getByTestId('escalation-tabs').parentElement

  return page === null ? [] : [...page.querySelectorAll('option')].map((option) => option.textContent ?? '')
}

describe('the escalation administration speaks the language of the interface', () => {
  it('labels the closed vocabularies in German', async () => {
    await renderPage('de', 'Stufen & Regeln')

    const options = optionTexts()

    expect(screen.getByTestId('escalation-stage-list').textContent).toContain('Prüfung')

    for (const expected of ['Order created', 'Priority', 'equal', 'Notification', 'E-Mail']) {
      expect(options).toContain(expected)
    }

    for (const raw of ['work_order_set', 'notify', 'eq', 'priority', 'email']) {
      expect(options.some((text) => text === raw)).toBe(false)
    }
  })

  it('labels the closed vocabularies in English', async () => {
    await renderPage('en', 'Stages & rules')

    const options = optionTexts()

    expect(screen.getByTestId('escalation-stage-list').textContent).toContain('Review')

    for (const expected of ['Work order created', 'Priority', 'equals', 'Notification', 'Email']) {
      expect(options).toContain(expected)
    }

    for (const raw of ['work_order_set', 'notify', 'eq', 'priority']) {
      expect(options.some((text) => text === raw)).toBe(false)
    }
  })
})
