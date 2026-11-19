import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { OncallPage } from '../oncall-page'

/**
 * The administration of the readiness (ADR-0035, WP-M15-04): the block of the
 * duty windows belongs to the card „Bereitschafts-Einstellungen" and writes the
 * key `oncall.weekly_windows`.
 */

const adminId = '11111111-1111-4111-8111-111111111111'

const settings = {
  weekStartWeekday: 1,
  startTime: '07:00',
  durationDays: 7,
  swapRequiresAdminApproval: true,
  escalateToGroupAfterMin: 10,
  reminderUnconfirmedH: 24,
  unfilledWarningDays: 14,
  defaultPoolId: null,
  weeklyWindows: [] as Array<{ weekday: number; start: string; end: string }>,
}

function stubRoutes(calls?: { method: string; body: unknown }[], windows = settings.weeklyWindows) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))

      calls?.push({ method, body })

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: adminId,
            email: 'admin@example.com',
            locale: 'de',
            roles: ['admin'],
            permissions: [
              'oncall.read',
              'oncall.plan',
              'oncall.admin',
              'settings.read',
              'settings.write',
              'user.read',
            ],
          },
        })
      }

      if (url.includes('/v1/settings/oncall')) {
        if (method === 'PUT') {
          return Response.json({ ...settings, weeklyWindows: windows })
        }

        return Response.json({ ...settings, weeklyWindows: windows })
      }

      if (url.includes('/v1/oncall/pools')) {
        return Response.json({ pools: [] })
      }

      if (url.includes('/v1/oncall/warnings')) {
        return Response.json({ unstaffed: [], unconfirmed: [], defaultPoolId: null })
      }

      if (url.includes('/v1/oncall/swaps')) {
        return Response.json({ swaps: [] })
      }

      if (url.includes('/v1/users')) {
        return Response.json({ users: [] })
      }

      if (url.includes('/v1/groups')) {
        return Response.json({ groups: [] })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/oncall']}>
          <OncallPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OncallPage', () => {
  it('shows a row per weekday in the block of the duty windows', async () => {
    stubRoutes()

    renderPage()

    expect(await screen.findByText('Dienstfenster')).toBeTruthy()

    for (const weekday of [
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Samstag',
      'Sonntag',
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${weekday}$`))).toBeTruthy()
    }
  })

  it('writes the windows of the plan and keeps the continuous plan in the body', async () => {
    const calls: { method: string; body: unknown }[] = []
    stubRoutes(calls)

    renderPage()

    const monday = await screen.findByLabelText('Montag')
    fireEvent.click(monday)

    const from = screen.getByLabelText('von Montag') as HTMLInputElement
    fireEvent.change(from, { target: { value: '07:30' } })

    const to = screen.getByLabelText('bis Montag') as HTMLInputElement
    fireEvent.change(to, { target: { value: '17:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }))

    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT')

      expect(put).toBeDefined()
      expect((put?.body as Record<string, unknown>)['oncall.weekly_windows']).toEqual([
        { weekday: 1, start: '07:30', end: '17:00' },
      ])
      expect((put?.body as Record<string, unknown>)['oncall.duration_days']).toBe(7)
    })
  })

  it('disables the continuous plan when a duty window is set', async () => {
    stubRoutes(undefined, [{ weekday: 1, start: '07:30', end: '17:00' }])

    renderPage()

    const duration = (await screen.findByLabelText('Dauer in Tagen')) as HTMLInputElement

    expect(duration.disabled).toBe(true)
    expect(screen.getByText(/Wochenstart, Startzeit und Dauer nicht/)).toBeTruthy()
  })
})
