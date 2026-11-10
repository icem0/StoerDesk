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
  evaluations: {
    windowDays: 30,
    tickets: 4,
    averageReviewMinutes: 60,
    averageFirstResponseMinutes: null,
    averageAcknowledgeMinutes: 90,
    averageProcessingMinutes: 360,
  },
  topFault: { key: 'feueralarm_ausloesung', count: 3 },
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

/**
 * Start page (WP-M9-14, WP-M10-32): the statistics first — the fault-free
 * counter, the four tiles and the evaluation averages — and below them the
 * list of the open tickets with the mini timeline and the last entry of the
 * history. The readiness has its own page, so no on-call tile is left.
 */
function renderPage(data: DashboardSnapshot = snapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/v1/text-templates')) {
        return Response.json({
          templates: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              key: 'feueralarm_ausloesung',
              archivedAt: null,
              translations: { de: 'Feueralarm ausgelöst', en: 'Fire alarm triggered' },
              usageCount: 3,
            },
          ],
        })
      }

      return Response.json(data)
    }),
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

  it('renders the evaluation averages, averages only', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.getByText('Auswertungen (4 Meldungen, 30 Tage)')).toBeTruthy()
    expect(screen.getByText('Ø Zeit bis Prüfung')).toBeTruthy()
    expect(screen.getByText('60 min')).toBeTruthy()
    expect(screen.getByText('Ø Zeit bis Rückmeldung')).toBeTruthy()
    expect(screen.getByText('keine Daten')).toBeTruthy()
    expect(screen.getByText('Ø Bearbeitungszeit')).toBeTruthy()
    expect(screen.getByText('360 min')).toBeTruthy()
    expect(screen.queryByText(/P90|Median|Maximum|höchste/i)).toBeNull()
  })

  it('omits the evaluation block for an older snapshot', async () => {
    const withoutEvaluations: DashboardSnapshot = { ...snapshot }
    delete withoutEvaluations.evaluations

    renderPage(withoutEvaluations)

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByText(/Auswertungen/)).toBeNull()
    expect(screen.getByRole('link', { name: /offen/ })).toBeTruthy()
  })

  it('shows the open tickets below the statistics', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    const list = screen.getByRole('heading', { name: 'Offene Tickets' })
    const tile = screen.getByRole('link', { name: /offen/ })

    expect(tile.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Feuerwache Nord')).toBeTruthy()
    expect(screen.getByText('ST-2026-0042')).toBeTruthy()
    expect(screen.getByText('noch 6 h')).toBeTruthy()
    expect(screen.getByText(/In Prüfung gesetzt/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ST-2026-0042' }).getAttribute('href')).toBe(
      '/tickets/ST-2026-0042',
    )
  })

  it('has no on-call tile and no "Brennt jetzt" any more', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByText('Anna Bereitschaft')).toBeNull()
    expect(screen.queryByText(/Bereitschaft/)).toBeNull()
    expect(screen.queryByText('Brennt jetzt')).toBeNull()
  })

  it('keeps the channel warning as text', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.getByText('Zustellung gestört')).toBeTruthy()
  })
  it('renders the most frequent fault with its localized label and count', async () => {
    renderPage()

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.getByText('Frequentest fault')).toBeTruthy()
    expect(screen.getByText('Feueralarm ausgelöst')).toBeTruthy()
    expect(screen.getByText('3-mal in the last 30 days')).toBeTruthy()
  })

  it('omits the top fault for a snapshot without it', async () => {
    const withoutTopFault: DashboardSnapshot = { ...snapshot }
    delete withoutTopFault.topFault

    renderPage(withoutTopFault)

    await screen.findByText('12 Tag(e) ohne Störung')

    expect(screen.queryByText('Frequentest fault')).toBeNull()
  })

})
