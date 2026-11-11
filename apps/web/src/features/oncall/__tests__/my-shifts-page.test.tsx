import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { MyShiftsPage } from '../../../features/oncall/my-shifts-page'

const techId = '11111111-1111-4111-8111-111111111111'
const shiftId = '22222222-2222-4222-8222-222222222222'
const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'

const now = new Date()
const plannedIso = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
const pastIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()

/** A shift in the middle of the current calendar week — the week the readiness
 *  calendar shows (WP-M10-34). */
function currentWeekIso(): string {
  const zoned = toZonedTime(now, ONCALL_TIMEZONE)
  const weekday = zoned.getUTCDay()
  const offset = (weekday + 6) % 7
  const monday = new Date(
    Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() - offset),
  )
  const wednesday = new Date(monday.getTime() + 2 * 24 * 60 * 60 * 1000)
  const day = [
    wednesday.getUTCFullYear().toString().padStart(4, '0'),
    (wednesday.getUTCMonth() + 1).toString().padStart(2, '0'),
    wednesday.getUTCDate().toString().padStart(2, '0'),
  ].join('-')

  return fromZonedTime(`${day}T08:00:00`, ONCALL_TIMEZONE).toISOString()
}

const calendarIso = currentWeekIso()

function stubRoutes(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: techId,
            email: 'tech@example.com',
            locale: 'de',
            roles: ['oncall'],
            permissions,
          },
        })
      }

      if (url.includes('/v1/oncall/shifts')) {
        return Response.json({
          shifts: [
            {
              id: shiftId,
              poolId,
              userId: techId,
              state: 'CONFIRMED',
              startsAt: plannedIso,
              endsAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: plannedIso,
              updatedAt: plannedIso,
            },
            {
              id: '66666666-6666-4666-8666-666666666666',
              poolId,
              userId: memberId,
              state: 'CONFIRMED',
              startsAt: calendarIso,
              endsAt: new Date(new Date(calendarIso).getTime() + 8 * 60 * 60 * 1000).toISOString(),
              createdAt: calendarIso,
              updatedAt: calendarIso,
            },
            {
              id: '55555555-5555-4555-8555-555555555555',
              poolId,
              userId: techId,
              state: 'PLANNED',
              startsAt: pastIso,
              endsAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: pastIso,
              updatedAt: pastIso,
            },
          ],
        })
      }

      if (url.includes('/v1/oncall/pools')) {
        if (url.includes('/members')) {
          return Response.json({
            members: [
              { id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' },
              { id: techId, givenName: 'Erika', familyName: 'Example', email: 'erika@example.com' },
            ],
          })
        }
        return Response.json({ pools: [{ id: poolId, name: 'Bereitschaft, Nord' }] })
      }

      if (url.includes('/v1/oncall/ical-url')) {
        return Response.json({ url: '/api/v1/oncall/ical/token.ics' })
      }

      if (url.includes('/confirm') || url.includes('/decline') || url.includes('/swap') || url.includes('/cancel')) {
        if (url.includes('/decline')) {
          const body = await (input as Request).clone().text()
          const parsed = JSON.parse(body || '{}')
          if (parsed.reason && parsed.reason.trim().length < 5) {
            return Response.json({ code: 'oncall_decline_reason_required' }, { status: 422 })
          }
        }
        return Response.json({ ok: true })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage(permissions: string[]) {
  stubRoutes(permissions)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/oncall']}>
          <Routes>
            <Route path="/oncall" element={<MyShiftsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function waitForText(text: string, timeout = 10000): Promise<void> {
  const start = Date.now()

  for (;;) {
    try {
      screen.getAllByText(text)
      return
    } catch {
      if (Date.now() - start >= timeout) {
        const body = document.body.innerHTML
        throw new Error(`timed out waiting for text "${text}"; body: ${body.slice(0, 500)}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

async function waitForCount(text: string, count: number, timeout = 10000): Promise<void> {
  const start = Date.now()

  for (;;) {
    try {
      expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThanOrEqual(count)
      return
    } catch {
      if (Date.now() - start >= timeout) {
        throw new Error(`timed out waiting for ${count}x text "${text}"`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MyShiftsPage', () => {
  it('shows upcoming and past shifts with local times and state labels', async () => {
    renderPage(['oncall.read', 'oncall.confirm', 'oncall.swap'])
    await waitForText('Meine Bereitschaftsschichten')
    await waitForText('Kommende Schichten')
    await waitForText('Bisherige Schichten')
    await waitForCount('Bereitschaft, Nord', 3)
    await waitForText('Geplant')
    // The state label is on the shift of the own readiness and on the row of
    // the readiness calendar (WP-M10-34).
    await waitForCount('Bestätigt', 2)
    await waitForText('Tausch anfragen')
    await waitForText('Ablehnen')
  })

  it('declines a shift with a reason and shows the error inline', async () => {
    renderPage(['oncall.read', 'oncall.confirm'])

    await waitForCount('Bestätigt', 2)
    fireEvent.click(screen.getAllByText('Ablehnen')[0]!)

    const reason = screen.getByLabelText('Grund')
    fireEvent.change(reason, { target: { value: 'kr' } })
    const submitButtons = screen.getAllByRole('button', { name: 'Ablehnen' })
    fireEvent.click(submitButtons[submitButtons.length - 1]!)

    await waitForText('Bitte einen Grund von mindestens 5 Zeichen angeben.')
  })

  it('hides confirm and decline for roles without oncall.confirm', async () => {
    renderPage(['oncall.read'])

    await waitForCount('Bestätigt', 2)
    expect(screen.queryByText('Bestätigen')).toBeNull()
    expect(screen.queryByText('Ablehnen')).toBeNull()
  })

  it('shows the readiness calendar of everybody who has the readiness', async () => {
    renderPage(['oncall.read', 'oncall.confirm', 'oncall.swap'])

    await waitForText('Bereitschaftskalender')
    await waitForCount('Max Mustermann', 1)
    await waitForCount('Bestätigt', 2)
  })

  it('shows the button to the readiness settings only for admins', async () => {
    renderPage(['oncall.read', 'oncall.confirm', 'oncall.swap'])

    await waitForText('Bereitschaftskalender')
    expect(screen.queryByText('Einstellungen der Bereitschaft')).toBeNull()
  })

  it('links an admin to the readiness settings', async () => {
    renderPage(['oncall.read', 'oncall.admin'])

    await waitForText('Bereitschaftskalender')

    const link = screen.getByRole('link', { name: 'Einstellungen der Bereitschaft' })
    expect(link.getAttribute('href')).toBe('/admin/oncall')
  })

  it('shows the iCal URL with a copy button', async () => {
    renderPage(['oncall.read', 'oncall.confirm', 'oncall.swap'])

    await waitForText('Kalender-URL')
    await waitForText('Kopieren')
    expect(screen.getByDisplayValue('/api/v1/oncall/ical/token.ics')).toBeDefined()
  })
})
