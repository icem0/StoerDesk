import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { MyShiftsPage } from '../../../features/oncall/my-shifts-page'

const techId = '11111111-1111-4111-8111-111111111111'
const shiftId = '22222222-2222-4222-8222-222222222222'
const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'

const now = new Date()
const plannedIso = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
const pastIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()

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
            members: [{ id: memberId, givenName: 'Max', familyName: 'Mustermann', email: 'max@example.com' }],
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
      screen.getByText(text)
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
    await waitForCount('Bereitschaft, Nord', 2)
    await waitForText('Geplant')
    await waitForText('Bestätigt')
    await waitForText('Tausch anfragen')
    await waitForText('Ablehnen')
  })

  it('declines a shift with a reason and shows the error inline', async () => {
    renderPage(['oncall.read', 'oncall.confirm'])

    await waitForText('Bestätigt')
    fireEvent.click(screen.getByText('Ablehnen')!)

    const reason = screen.getByLabelText('Grund')
    fireEvent.change(reason, { target: { value: 'kr' } })
    const submitButtons = screen.getAllByRole('button', { name: 'Ablehnen' })
    fireEvent.click(submitButtons[submitButtons.length - 1]!)

    await waitForText('Bitte einen Grund von mindestens 5 Zeichen angeben.')
  })

  it('hides confirm and decline for roles without oncall.confirm', async () => {
    renderPage(['oncall.read'])

    await waitForText('Bestätigt')
    expect(screen.queryByText('Bestätigen')).toBeNull()
    expect(screen.queryByText('Ablehnen')).toBeNull()
  })

  it('shows the iCal URL with a copy button', async () => {
    renderPage(['oncall.read', 'oncall.confirm', 'oncall.swap'])

    await waitForText('Kalender-URL')
    await waitForText('Kopieren')
    expect(screen.getByDisplayValue('/api/v1/oncall/ical/token.ics')).toBeDefined()
  })
})
