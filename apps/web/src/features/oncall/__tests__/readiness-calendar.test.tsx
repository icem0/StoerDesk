import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { ReadinessCalendar } from '../readiness-calendar'

const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'

const member = {
  id: memberId,
  givenName: 'Max',
  familyName: 'Mustermann',
  email: 'max@example.com',
}

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

function renderCalendar(
  shifts: Parameters<typeof ReadinessCalendar>[0]['shifts'] = [],
  showNames?: boolean,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ReadinessCalendar
          pools={[{ id: poolId, name: 'Bereitschaft, Nord' }]}
          shifts={shifts}
          showNames={showNames}
        />
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

  it('colours a day by its shift state and names the technician', () => {
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
        technician: member,
      },
    ])

    const technician = screen.getByText('Max Mustermann')

    expect(technician.closest('td')?.className).toContain('bg-emerald-500/15')
    // the legend names the state and the row of the shift repeats it (WP-M14-87)
    expect(screen.getAllByText('Bestätigt')).toHaveLength(2)
    expect(screen.getByText('Geplant')).toBeDefined()
    expect(screen.getByText('Unbesetzt')).toBeDefined()
  })

  it('names the state and the pool on the row of an unstaffed shift', () => {
    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar([
      {
        id: '22222222-2222-4222-8222-222222222222',
        poolId,
        userId: null,
        state: 'PLANNED',
        startsAt,
        endsAt,
        createdAt: startsAt,
        updatedAt: startsAt,
      },
    ])

    const row = screen.getByText('nicht besetzt')

    expect(screen.getAllByText('Geplant')).toHaveLength(2)
    expect(screen.getByText('Bereitschaft, Nord')).toBeDefined()
    expect(row.closest('td')?.className).toContain('bg-amber-500/15')
  })

  it('names the technician of a shift whose pool has no members (WP-M14-151)', () => {
    const fetchMock = vi.fn(async () => Response.json({ members: [] }))

    vi.stubGlobal('fetch', fetchMock)

    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar([
      {
        id: '22222222-2222-4222-8222-222222222222',
        poolId,
        userId: memberId,
        state: 'PLANNED',
        startsAt,
        endsAt,
        createdAt: startsAt,
        updatedAt: startsAt,
        technician: member,
      },
    ])

    expect(screen.getByText('Max Mustermann')).toBeDefined()
    // the calendar reads the technician of the shift, it never asks for a pool
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hides the name of the technician without the permission (WP-M14-132)', () => {
    const fetchMock = vi.fn(async () => Response.json({ members: [] }))

    vi.stubGlobal('fetch', fetchMock)

    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar(
      [
        {
          id: '22222222-2222-4222-8222-222222222222',
          poolId,
          userId: memberId,
          state: 'CONFIRMED',
          startsAt,
          endsAt,
          createdAt: startsAt,
          updatedAt: startsAt,
          technician: member,
        },
      ],
      false,
    )

    // the row names the state and the pool, but nobody
    expect(screen.getByText('besetzt')).toBeDefined()
    expect(screen.getByText('Bereitschaft, Nord')).toBeDefined()
    expect(screen.queryByText('Max Mustermann')).toBeNull()
    // the browser asks for no member of the pool at all
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the slot without a technician "nicht besetzt" without the permission', () => {
    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar(
      [
        {
          id: '22222222-2222-4222-8222-222222222222',
          poolId,
          userId: null,
          state: 'UNFILLED',
          startsAt,
          endsAt,
          createdAt: startsAt,
          updatedAt: startsAt,
        },
      ],
      false,
    )

    expect(screen.getByText('nicht besetzt')).toBeDefined()
    expect(screen.queryByText('besetzt')).toBeNull()
  })

  it('reads besetzt for a technician without a name in the answer (WP-M14-151)', () => {
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

    expect(screen.getByText('besetzt')).toBeDefined()
    expect(screen.queryByText('nicht besetzt')).toBeNull()
  })

  it('opens the shift dialog with the history of the shift (WP-M14-154b)', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        events: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            type: 'shift_created',
            createdAt: '2024-05-01T08:00:00.000Z',
            actor: { id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' },
            person: null,
            fromState: null,
            toState: null,
            reason: null,
          },
          {
            id: '88888888-8888-4888-8888-888888888888',
            type: 'shift_updated',
            createdAt: '2024-05-02T09:30:00.000Z',
            actor: { id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' },
            person: { id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' },
            fromState: 'UNFILLED',
            toState: 'PLANNED',
            reason: null,
          },
        ],
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    const today = localIsoDate(new Date())
    const startsAt = fromZonedTime(`${today}T08:00:00`, ONCALL_TIMEZONE)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)

    renderCalendar([
      {
        id: '22222222-2222-4222-8222-222222222222',
        poolId,
        userId: memberId,
        state: 'PLANNED',
        startsAt,
        endsAt,
        createdAt: startsAt,
        updatedAt: startsAt,
        technician: member,
      },
    ])

    fireEvent.click(screen.getByText('Max Mustermann'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    await waitFor(() => {
      expect(screen.getByText('Angelegt')).toBeDefined()
    })
    expect(screen.getByText('Zugewiesen')).toBeDefined()
    expect(screen.getByText('Verlauf')).toBeDefined()
  })
});
