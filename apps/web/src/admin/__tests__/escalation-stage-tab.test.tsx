import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

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
  {
    key: 'night_shift',
    names: { de: 'Nachtdienst', en: 'Night shift' },
    position: 2,
    active: true,
    predecessor: 'review',
    reachedBy: [],
  },
  {
    key: 'work_order',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    position: 3,
    active: true,
    predecessor: 'night_shift',
    reachedBy: ['work_order_set'],
  },
]

const RULE = {
  key: 'night_shift',
  stageKey: 'night_shift',
  reference: null,
  minutes: { low: 15, normal: 15, high: 15, critical: 5 },
  percent: null,
  condition: { all: [] },
  actions: [],
  active: true,
}

function renderPage() {
  const writes: { url: string; body: unknown }[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: { id: 'u1', email: 'admin@example.invalid', permissions: ['settings.read', 'settings.write'] },
      })
    }

    if (path.includes('/v1/escalation/stages')) {
      if (init?.method === 'PUT') {
        writes.push({ url: '/v1/escalation/stages', body: JSON.parse(String(init.body)) })
      }

      return Response.json({ stages: STAGES, rules: [RULE] })
    }

    if (path.includes('/v1/escalation/config')) {
      return Response.json({ stages: STAGES, rules: [RULE] })
    }

    if (path.includes('/v1/escalation/channels')) {
      return Response.json({ channels: [] })
    }

    return Response.json({ webhooks: [] })
  })

  vi.stubGlobal('fetch', fetchMock)

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

  return writes
}

async function openStagesTab(tabName: string) {
  await waitFor(() => expect(screen.getByTestId('escalation-tabs')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: tabName }))
  await waitFor(() => expect(screen.getByTestId('escalation-stage-list')).toBeTruthy())
}

describe('the stage tab of the escalation administration', () => {
  it('renders the served stages and their predecessors', async () => {
    void i18n.changeLanguage('de')
    renderPage()
    await openStagesTab('Stufen & Regeln')

    const list = screen.getByTestId('escalation-stage-list')
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain('Prüfung')
    expect(items[1]?.textContent).toContain('Nachtdienst')
    expect(items[2]?.textContent).toContain('Auftrag angelegt')

    const predecessor = within(items[1] as HTMLElement).getAllByLabelText('Vorgänger')[0]

    expect(predecessor).toBeTruthy()

    const options = [...(predecessor as HTMLSelectElement).options].map((option) => option.textContent)

    expect(options).toContain('Kein Vorgänger')
    expect(options).toContain('Prüfung')
    expect(options).toContain('Auftrag angelegt')
    expect(options).not.toContain('Nachtdienst')

    const first = items[0] as HTMLElement

    expect((within(first).getByLabelText('Vorgänger') as HTMLSelectElement).disabled).toBe(true)
    expect(within(first).queryByRole('button', { name: 'Stufe entfernen' })).toBeNull()
  })

  it('offers the button of the own page of a new stage and the remove action with the cascade hint', async () => {
    void i18n.changeLanguage('de')
    renderPage()
    await openStagesTab('Stufen & Regeln')

    expect(screen.getByRole('link', { name: 'Stufe hinzufügen' })).toBeTruthy()

    const nightShift = within(screen.getByTestId('escalation-stage-list')).getAllByRole('listitem')[1] as HTMLElement

    fireEvent.click(within(nightShift).getByRole('button', { name: 'Stufe entfernen' }))

    const dialog = screen.getByRole('alertdialog')

    expect(dialog.textContent).toContain(
      'Die Stufe wird aus der Kette entfernt; ihre Regeln werden mit entfernt.',
    )
    expect(dialog.textContent).toContain('night_shift')
  })

  it('names the chain texts in German and English', async () => {
    expect(i18n.getFixedT('de', 'settings')('admin.escalation.stage.predecessor')).toBe('Vorgänger')
    expect(i18n.getFixedT('de', 'settings')('admin.escalation.stage.add')).toBe('Stufe hinzufügen')
    expect(i18n.getFixedT('de', 'settings')('admin.escalation.stage.remove')).toBe('Stufe entfernen')
    expect(i18n.getFixedT('de', 'settings')('admin.escalation.errors.stageChainInvalid')).toBe(
      'Die Stufenkette ist ungültig: Schlüssel, Vorgänger und Position prüfen.',
    )

    expect(i18n.getFixedT('en', 'settings')('admin.escalation.stage.predecessor')).toBe('Predecessor')
    expect(i18n.getFixedT('en', 'settings')('admin.escalation.stage.add')).toBe('Add stage')
    expect(i18n.getFixedT('en', 'settings')('admin.escalation.stage.remove')).toBe('Remove stage')
    expect(i18n.getFixedT('en', 'settings')('admin.escalation.errors.stageChainInvalid')).toBe(
      'The stage chain is invalid: check the keys, the predecessor and the position.',
    )
  })
})
