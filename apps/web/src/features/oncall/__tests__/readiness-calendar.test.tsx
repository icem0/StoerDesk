import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { ReadinessCalendar } from '../readiness-calendar'

const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'

function localIsoDate(value: Date): string {
  const zoned = toZonedTime(value, ONCALL_TIMEZONE)

  return [
    zoned.getUTCFullYear().toString().padStart(4, '0'),
    (zoned.getUTCMonth() + 1).toString().padStart(2, '0'),
    zoned.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
}

function monthName(offset: number): string {
  const now = new Date()
  const zoned = toZonedTime(now, ONCALL_TIMEZONE)
  const date = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth() + offset, 1, 12))

  return new Intl.DateTimeFormat('de', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function renderCalendar(shifts: Parameters<typeof ReadinessCalendar>[0]['shifts'] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ReadinessCalendar pools={[{ id: poolId, name: 'Bereitschaft, Nord' }]} shifts={shifts} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReadinessCalendar', () => {
  it('renders the current and the following month with one week per row', () => {
    renderCalendar()

    expect(screen.getByText('Bereitschaftskalender')).toBeDefined()
    expect(screen.getByText(monthName(0))).toBeDefined()
    expect(screen.getByText(monthName(1))).toBeDefined()

    const columnHeaders = screen.getAllByRole('columnheader')

    expect(columnHeaders).toHaveLength(16)
    expect(columnHeaders[0]!.textContent).toBe('KW')

    for (const header of screen.getAllByRole('rowheader')) {
      expect(header.textContent).toMatch(/^\d{1,2}$/)
    }
  })

  it('colours a day by its shift state and names the technician', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          members: [
            { id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' },
          ],
        }),
      ),
    )

    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar([
      {
        id: '22222222-2222-4222-8222-222222222222',
        poolId,
        userId: memberId,
        state: 'CONFIRMED',
        startsAt,
        endsAt,
        createdAt: startsAt,
        updatedAt: startsAt,
      },
    ])

    const technician = await screen.findByText('Max Mustermann')

    expect(technician.closest('td')?.className).toContain('bg-emerald-500/15')
    expect(screen.getByText('Bestätigt')).toBeDefined()
    expect(screen.getByText('Geplant')).toBeDefined()
    expect(screen.getByText('Unbesetzt')).toBeDefined()
  })
})
