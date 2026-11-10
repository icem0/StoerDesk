import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { StartPage } from '../start-page'

const snapshot: DashboardSnapshot = {
  generatedAt: '2026-03-10T08:00:00.000Z',
  faultFree: { since: '2026-02-26T08:00:00.000Z', days: 12, recordDays: 30 },
  tiles: {
    open: 2,
    openByStatus: {
      NEW: 4,
      IN_REVIEW: 0,
      WORK_ORDER_CREATED: 0,
      OFFERED: 0,
      ASSIGNED: 0,
      ACCEPTED: 0,
      ACKNOWLEDGED: 2,
      CLOSED: 0,
      CANCELLED: 0,
    },
    overdue: 1,
    unreviewed: 4,
    poolSize: 3,
    onCall: {
      kind: 'confirmed',
      name: 'Anna Bereitschaft',
      phone: null,
      endsAt: '2026-03-10T18:00:00.000Z',
      warning: null,
    },
    channels: [
      {
        name: 'E-Mail',
        lastSentAt: null,
        lastFailedAt: null,
        pending: 0,
        failed: 2,
      },
    ],
  },
  burningNow: [],
}

/**
 * Start page of phase 9 (WP-M9-14): the fault-free counter, the four tiles, the
 * on-call tile and the channel tile render from the dashboard snapshot. Every
 * tile is one link over its whole area; the burning-now list is not on the page.
 */
function renderPage() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot)),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/']}>
          <StartPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StartPage dashboard', () => {
  it('renders the fault-free counter with the record', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')
    expect(screen.getByText('Rekord: 30 Tag(e)')).toBeTruthy()
  })

  it('renders the four tiles as links over their whole area', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    const open = screen.getByRole('link', { name: /offen/ })
    expect(open.getAttribute('href')).toBe('/tickets?open=true')
    expect(open.textContent).toContain('2')
    expect(open.className).toContain('block')

    const overdue = screen.getByRole('link', { name: /überfällig/ })
    expect(overdue.getAttribute('href')).toBe('/tickets?overdue=true')
    expect(overdue.textContent).toContain('1')

    const unreviewed = screen.getByRole('link', { name: /ohne Prüfung/ })
    expect(unreviewed.getAttribute('href')).toBe('/tickets?status=NEW')
    expect(unreviewed.textContent).toContain('4')

    const pool = screen.getByRole('link', { name: /im Pool/ })
    expect(pool.getAttribute('href')).toBe('/tickets?status=OFFERED')
    expect(pool.textContent).toContain('3')
  })

  it('renders the on-call name without the phone and the channel warning as text', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.getByRole('link', { name: /Bereitschaft/ }).textContent).toContain(
      'Anna Bereitschaft',
    )
    expect(screen.getByText('Zustellung gestört')).toBeTruthy()
  })

  it('has no burning-now list any more', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByText('Brennt jetzt')).toBeNull()
  })
})
