import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketListPage } from '../ticket-list-page'

const HOUR = 60 * 60 * 1000

/** A timestamp `hours` hours away from the moment the fixtures were built. */
function at(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString()
}

/**
 * Mini timeline of WP-M6-12 (`specs/05-timeline.md` §5.4): every list row renders
 * a small bar from the API fields `percent` and `timelineState` and the deadline
 * column shows the remaining or overdue time with the absolute deadline kept as
 * the `title` attribute.
 */
function renderList() {
  const overdue = {
    id: '11111111-1111-4111-8111-111111111111',
    ticketNo: 'M-4712',
    objectNo: 'OBJ-1',
    objectName: 'Objekt Ein',
    systemType: null,
    status: 'NEW',
    priority: 'high',
    reportedAt: at(-80),
    deadlineAt: at(-8),
    timelineState: 'red',
    percent: 100,
    remainingMs: 0,
  }
  const running = {
    id: '22222222-2222-4222-8222-222222222222',
    ticketNo: 'M-4713',
    objectNo: 'OBJ-2',
    objectName: 'Objekt Zwei',
    systemType: null,
    status: 'NEW',
    priority: 'normal',
    reportedAt: at(-2),
    deadlineAt: at(70),
    timelineState: 'green',
    percent: 8,
    remainingMs: 65 * HOUR,
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        tickets: [overdue, running],
        total: 2,
        limit: 25,
        offset: 0,
      }),
    ),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const rendered = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/tickets']}>
          <TicketListPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return { rendered, overdue, running }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TicketListPage mini timeline', () => {
  it('renders an overdue card in red with the overdue time and the deadline title', async () => {
    const { overdue } = renderList()
    const card = (await screen.findByText('M-4712')).closest<HTMLElement>('[data-testid="ticket-card"]')

    if (card === null) {
      throw new Error('card missing')
    }

    expect(within(card).getByText(/Seit \d+ Std\. überfällig/)).toBeTruthy()
    expect(card.querySelector('.bg-rose-500')).toBeTruthy()
    expect(within(card).getByTitle(new Date(overdue.deadlineAt).toLocaleString('de-DE'))).toBeTruthy()
  })

  it('renders a green running card with a partial bar and the remaining time', async () => {
    renderList()
    const card = (await screen.findByText('M-4713')).closest<HTMLElement>('[data-testid="ticket-card"]')

    if (card === null) {
      throw new Error('card missing')
    }

    expect(within(card).getByText(/Noch \d+ Std\./)).toBeTruthy()
    expect(card.querySelector('.bg-green-500')).toBeTruthy()
  })

  it('shows the localized status and priority labels', async () => {
    renderList()

    expect(await screen.findByText('Neu')).toBeTruthy()
    expect(await screen.findByText('Hoch')).toBeTruthy()
  })
})
