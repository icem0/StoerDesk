import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EscalationStageCreatePage } from '../escalation-stage-create-page'

const adminMarker = 'Eskalationsadministration'

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
    key: 'work_order',
    names: { de: 'Auftrag angelegt', en: 'Work order created' },
    position: 2,
    active: true,
    predecessor: 'review',
    reachedBy: ['work_order_set'],
  },
]

const RULE = {
  key: 'review',
  stageKey: 'review',
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
        user: {
          id: 'u1',
          email: 'admin@example.invalid',
          permissions: ['settings.read', 'settings.write'],
        },
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

    return Response.json({ webhooks: [] })
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/escalation/stages/new']}>
          <Routes>
            <Route path="/admin/escalation/stages/new" element={<EscalationStageCreatePage />} />
            <Route path="/admin/escalation" element={<p>{adminMarker}</p>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return writes
}

describe('EscalationStageCreatePage', () => {
  it('shows the form of a new stage on its own page', async () => {
    void i18n.changeLanguage('de')
    renderPage()

    const add = await screen.findByTestId('escalation-stage-add')

    expect(within(add).getByLabelText('Schlüssel')).toBeTruthy()
    expect(within(add).getByLabelText('Name (Deutsch)')).toBeTruthy()
    expect(within(add).getByLabelText('Name (Englisch)')).toBeTruthy()
  })

  it('joins a new stage to the chain instead of opening a second one', async () => {
    void i18n.changeLanguage('de')
    renderPage()

    const add = await screen.findByTestId('escalation-stage-add')
    const predecessor = within(add).getByLabelText('Vorgänger') as HTMLSelectElement

    expect([...predecessor.options].map((option) => option.value)).not.toContain('')
    expect(predecessor.value).toBe('work_order')
  })

  it('does not send a stage set while the key is empty', async () => {
    void i18n.changeLanguage('de')
    const writes = renderPage()

    const add = await screen.findByTestId('escalation-stage-add')

    fireEvent.change(within(add).getByLabelText('Name (Deutsch)'), { target: { value: 'Büro' } })
    fireEvent.change(within(add).getByLabelText('Name (Englisch)'), { target: { value: 'Office' } })
    fireEvent.submit(add)

    await waitFor(() =>
      expect(
        screen.getByText(
          'Schlüssel, beide Namen und eine Position zwischen 1 und 20 sind erforderlich.',
        ),
      ).toBeTruthy(),
    )
    expect(writes).toHaveLength(0)
  })

  it('writes the chain with the new stage and returns to the administration', async () => {
    void i18n.changeLanguage('de')
    const writes = renderPage()

    const add = await screen.findByTestId('escalation-stage-add')

    fireEvent.change(within(add).getByLabelText('Schlüssel'), { target: { value: 'office' } })
    fireEvent.change(within(add).getByLabelText('Name (Deutsch)'), { target: { value: 'Büro' } })
    fireEvent.change(within(add).getByLabelText('Name (Englisch)'), { target: { value: 'Office' } })
    fireEvent.submit(add)

    await waitFor(() => expect(writes).toHaveLength(1))

    expect((writes[0]?.body as { stages: { key: string }[] }).stages.at(-1)?.key).toBe('office')
    expect(await screen.findByText(adminMarker)).toBeTruthy()
  })
})
