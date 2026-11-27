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
  condition: { all: [{
        field: 'timer_expired',
        operator: 'expired',
        value: { reference: 'work_order_set', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
      }, { field: 'priority', operator: 'eq', value: 'critical' }] },
  actions: [{ key: 'notify_office', type: 'notify', channels: ['ntfy', 'email'], condition: { all: [] } }],
  active: true,
}

const STATUS_RULE = {
  key: 'status_rule',
  stageKey: 'review',
  condition: { all: [{
        field: 'timer_expired',
        operator: 'expired',
        value: { reference: 'received_at', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
      }, { field: 'status', operator: 'eq', value: 'NEW' }] },
  actions: [],
  active: true,
}

const STAGE_REACHED_RULE = {
  key: 'stage_rule',
  stageKey: 'review',
  condition: { all: [{
        field: 'timer_expired',
        operator: 'expired',
        value: { reference: 'received_at', minutes: { low: 15, normal: 15, high: 15, critical: 5 } },
      }, { field: 'stageReached', operator: 'eq', value: 'review' }] },
  actions: [],
  active: true,
}

const CONFIG = {
  stages: [{ key: 'review', names: { de: 'Prüfung', en: 'Review' }, position: 1, active: true }],
  rules: [RULE, STATUS_RULE, STAGE_REACHED_RULE],
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
}

function helpText(key: string): string {
  return i18n.t(`escalation.${key}More`, { ns: 'help' })
}

function triggerName(section: string): string {
  return i18n.t('triggerFor', { ns: 'help', name: section })
}

function panelText(name: string): string {
  fireEvent.click(screen.getByRole('button', { name }))

  const panel = screen.getByRole('note')

  return panel.textContent ?? ''
}

function optionTexts(): string[] {
  const page = screen.getByTestId('escalation-tabs').parentElement

  return page === null ? [] : [...page.querySelectorAll('option')].map((option) => option.textContent ?? '')
}

describe('the escalation administration speaks the language of the interface', () => {
  it('labels the closed vocabularies in German', async () => {
    await renderPage('de', 'Stufen & Regeln')
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    expect(screen.queryByRole('note')).toBeNull()

    expect(panelText(triggerName(i18n.t('admin.escalation.tabs.stages', { ns: 'settings' })))).toContain(
      helpText('stages'),
    )

    const options = optionTexts()

    expect(screen.getByTestId('escalation-stage-list').textContent).toContain('Prüfung')

    for (const expected of ['Auftrag angelegt', 'Priorität', 'Status', 'gleich', 'Benachrichtigung', 'E-Mail', 'Kritisch', 'Neu', 'Prüfung']) {
      expect(options).toContain(expected)
    }

    for (const raw of ['work_order_set', 'notify', 'eq', 'priority', 'email', 'critical']) {
      expect(options.some((text) => text === raw)).toBe(false)
    }
  })

  it('keeps the deadline help of the Fristen tab behind the ⓘ', async () => {
    await renderPage('de', 'Fristen')
    await waitFor(() => expect(screen.getByTestId('escalation-hours')).toBeTruthy())

    expect(screen.queryByText(helpText('deadlines'))).toBeNull()

    expect(panelText(triggerName(i18n.t('admin.escalation.tabs.fristen', { ns: 'settings' })))).toContain(
      helpText('deadlines'),
    )
  })

  it('labels the closed vocabularies in English', async () => {
    await renderPage('en', 'Stages & rules')
    await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())

    expect(screen.queryByRole('note')).toBeNull()

    expect(panelText(triggerName(i18n.t('admin.escalation.tabs.stages', { ns: 'settings' })))).toContain(
      helpText('stages'),
    )

    const options = optionTexts()

    expect(screen.getByTestId('escalation-stage-list').textContent).toContain('Review')

    for (const expected of ['Work order created', 'Priority', 'Status', 'equals', 'Notification', 'Email', 'Critical', 'New', 'Review']) {
      expect(options).toContain(expected)
    }

    for (const raw of ['work_order_set', 'notify', 'eq', 'priority', 'critical']) {
      expect(options.some((text) => text === raw)).toBe(false)
    }
  })

  it('keeps the deadline help of the Deadlines tab behind the ⓘ', async () => {
    await renderPage('en', 'Deadlines')
    await waitFor(() => expect(screen.getByTestId('escalation-hours')).toBeTruthy())

    expect(screen.queryByText(helpText('deadlines'))).toBeNull()

    expect(panelText(triggerName(i18n.t('admin.escalation.tabs.fristen', { ns: 'settings' })))).toContain(
      helpText('deadlines'),
    )
  })
})
