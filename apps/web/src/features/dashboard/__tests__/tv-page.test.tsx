import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { TvPage } from '../tv-page'

/**
 * The wall monitor renders the same blocks as the start page (WP-M10-36) and
 * nothing can be clicked there — a display is never interactive.
 */
const snapshot: DashboardSnapshot = {
  generatedAt: '2026-03-10T08:00:00.000Z',
  faultFree: { since: '2026-02-26T08:00:00.000Z', days: 12, recordDays: 30 },
  evaluations: {
    windowDays: 30,
    tickets: 4,
    averageReviewMinutes: 60,
    averageFirstResponseMinutes: null,
    averageAcknowledgeMinutes: 90,
    averageProcessingMinutes: 360,
  },
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
        name: 'ntfy',
        lastSentAt: null,
        lastFailedAt: '2026-03-10T09:30:00.000Z',
        pending: 0,
        failed: 2,
      },
    ],
  },
  burningNow: [
    {
      ticketNo: 'ST-2026-0042',
      objectName: 'Feuerwache Nord',
      status: 'IN_REVIEW',
      priority: 'high',
      deadlineAt: '2026-03-10T14:00:00.000Z',
      reportedAt: '2026-03-09T08:00:00.000Z',
      timelineState: 'yellow',
      percent: 54,
      remainingMs: 3_600_000,
      lastEvent: { type: 'review_started', at: '2026-03-09T09:00:00.000Z' },
    },
  ],
}

function renderTv(data: DashboardSnapshot = snapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(data)),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/tv/wall-token']}>
          <Routes>
            <Route path="/tv/:token" element={<TvPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TvPage wall display', () => {
  it('shows the wall-display not-found state without data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'tv_not_found', params: {} }, { status: 404 })),
    )

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/tv/wall-token']}>
            <Routes>
              <Route path="/tv/:token" element={<TvPage />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Dieser Wandmonitor ist nicht eingerichtet oder wurde zurückgesetzt.')).toBeTruthy()
    expect(screen.queryByText('Offene Tickets')).toBeNull()
  })

  it('renders the same blocks as the start page', async () => {
    renderTv()

    expect(await screen.findByText('12 Tag(e) ohne Störung')).toBeTruthy()
    expect(screen.getByText('Rekord: 30 Tag(e)')).toBeTruthy()
    expect(screen.getByText('Auswertungen (4 Meldungen, 30 Tage)')).toBeTruthy()
    expect(screen.getByText('60 min')).toBeTruthy()
    expect(screen.getByText('keine Daten')).toBeTruthy()

    const heading = screen.getByRole('heading', { name: 'Offene Tickets' })
    expect(heading).toBeTruthy()
    expect(screen.getByText('Feuerwache Nord')).toBeTruthy()
    expect(screen.getByText('ST-2026-0042')).toBeTruthy()
    expect(screen.getByText('noch 6 h')).toBeTruthy()
    expect(screen.getByText(/In Prüfung gesetzt/)).toBeTruthy()

    // The channel tile is visible (the TV snapshot carries it here for the test).
    expect(screen.getByText('Zustellung gestört')).toBeTruthy()
  })

  it('has no active link and no primary action', async () => {
    renderTv()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Neue Störung melden')).toBeNull()
    expect(screen.queryByText(/Brennt jetzt/)).toBeNull()
  })

  it('never shows the readiness', async () => {
    renderTv()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByText('Anna Bereitschaft')).toBeNull()
    expect(screen.queryByText(/Bereitschaft/)).toBeNull()
  })
})
