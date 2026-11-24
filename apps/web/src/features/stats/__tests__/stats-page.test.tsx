import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { StatsPage } from '../stats-page'

/**
 * The statistics page names the readable text of a grouping instead of the
 * machine key (ADR-0049 decision 2): the fault template and the detected error
 * carry their label in the answer, the system type is translated by the web.
 */
const ANSWERS: Record<string, unknown> = {
  '/v1/me': {
    user: { id: '11111111-1111-4111-8111-111111111111', permissions: ['stats.read'] },
  },
  '/v1/stats/reaction-times': {
    review: { count: 3, medianMinutes: 20, averageMinutes: 25, p90Minutes: 40 },
    acknowledge: { count: 2, medianMinutes: 90, averageMinutes: 95, p90Minutes: 120 },
    pausedTickets: 0,
    pauseMinutes: 0,
  },
  '/v1/stats/frequency': {
    series: [{ bucketStart: '2026-03-10T00:00:00.000Z', total: 3 }],
    bySystemType: [{ key: 'BMA', count: 3 }],
    byFaultTemplate: [
      { key: 'bma.detector_fault', labelDe: 'Störung Melder', labelEn: 'Detector fault', count: 3 },
    ],
    bySource: [{ key: 'QR', count: 3 }],
    byDetectedError: [
      { key: 'kabel', labelDe: 'Kabelbruch', labelEn: 'Cable break', count: 2 },
    ],
  },
  '/v1/stats/objects': {
    topObjects: [{ objectNo: 'OBJ-1', objectName: 'Objekt Eins', count: 3, conspicuous: false }],
  },
  '/v1/stats/compliance': {
    acknowledged: 2,
    onTime: 1,
    late: 1,
    openOverdue: 0,
    onTimeRate: 0.5,
  },
  '/v1/stats/declines': { declineRate: 0, topReasons: [] },
}

function renderStats() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const path = url.split('?')[0].replace(/^\/api/, '')
    const answer = ANSWERS[path]

    if (answer === undefined) {
      throw new Error(`unexpected request ${url}`)
    }

    return Response.json(answer)
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/stats']}>
          <StatsPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return { fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the statistics page', () => {
  it('names the fault template, the detected error and the system type in words', async () => {
    renderStats()

    expect(await screen.findByText('Störung Melder')).toBeTruthy()
    expect(screen.getByText('Kabelbruch')).toBeTruthy()
    expect(screen.getByText('Brandmeldeanlage')).toBeTruthy()

    // The machine key is not shown a second time.
    expect(screen.queryByText('bma.detector_fault')).toBeNull()
    expect(screen.queryByText('kabel')).toBeNull()
    expect(screen.queryByText('BMA')).toBeNull()
  })

  it('names the two phases of the reaction times', async () => {
    renderStats()

    expect(await screen.findByText('Beginn der Prüfung')).toBeTruthy()
    expect(screen.getByText('Bestätigung an den Melder')).toBeTruthy()
    expect(screen.queryByText('Erste Rückmeldung')).toBeNull()
  })
})
