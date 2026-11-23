import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { OncallPage } from '../oncall-page'

/**
 * The administration of the readiness (ADR-0035, WP-M15-07): the duty blocks
 * belong to each pool and are written through `PATCH /v1/oncall/pools/:id`
 * (ADR-0040, WP-M20-04).
 */

const adminId = '11111111-1111-4111-8111-111111111111'
const poolId = '22222222-2222-4222-8222-222222222222'

const settings = {
  weekStartWeekday: 1,
  startTime: '07:00',
  durationDays: 7,
  swapRequiresAdminApproval: true,
  escalateToGroupAfterMin: 10,
  reminderUnconfirmedH: 24,
  unfilledWarningDays: 14,
  defaultPoolId: null,
}

type Block = { from_weekday: number; to_weekday: number; start: string; end: string }

function stubRoutes(
  calls?: { method: string; body: unknown }[],
  blocks: Block[] = [],
  shiftCount = 0,
) {
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
        return Response.json(settings)
      }

      if (url.includes('/v1/oncall/pools')) {
        return Response.json({
          pools: [
            {
              id: poolId,
              name: 'Verwaltung',
              groupId: null,
              active: true,
              weeklyWindows: blocks,
              shiftCount,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        })
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
  it('shows a row per duty block of the pool', async () => {
    stubRoutes(undefined, [{ from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' }])

    renderPage()

    expect(await screen.findByText('Dienstzeiten je Pool')).toBeTruthy()

    expect((await screen.findByLabelText('Dienstblock 1 von')) as HTMLSelectElement).toBeTruthy()
    expect((await screen.findByLabelText('Dienstblock 1 bis')) as HTMLSelectElement).toBeTruthy()
    expect((await screen.findByLabelText('Dienstblock 1 Beginn')) as HTMLInputElement).toBeTruthy()
    expect((await screen.findByLabelText('Dienstblock 1 Ende')) as HTMLInputElement).toBeTruthy()
  })

  it('writes the duty blocks of the pool', async () => {
    const calls: { method: string; body: unknown }[] = []
    stubRoutes(calls, [{ from_weekday: 1, to_weekday: 1, start: '07:00', end: '17:00' }])

    renderPage()

    const to = await screen.findByLabelText('Dienstblock 1 bis')
    fireEvent.change(to, { target: { value: '4' } })

    const from = screen.getByLabelText('Dienstblock 1 Beginn') as HTMLInputElement
    fireEvent.change(from, { target: { value: '07:30' } })

    const end = screen.getByLabelText('Dienstblock 1 Ende') as HTMLInputElement
    fireEvent.change(end, { target: { value: '17:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Dienstzeiten speichern' }))

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH')

      expect(patch).toBeDefined()
      expect(patch?.body).toEqual({
        weeklyWindows: [{ from_weekday: 1, to_weekday: 4, start: '07:30', end: '17:00' }],
      })
    })
  })

  it('adds a block, removes a row and fills the presets of the office', async () => {
    const calls: { method: string; body: unknown }[] = []
    stubRoutes(calls, [{ from_weekday: 1, to_weekday: 1, start: '07:00', end: '17:00' }])

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Dienstblock hinzufügen' }))

    expect((await screen.findByLabelText('Dienstblock 2 von')) as HTMLSelectElement).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dienstblock 2 entfernen' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Dienstblock 2 von')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Verwaltung' }))

    expect((await screen.findByLabelText('Dienstblock 2 von')) as HTMLSelectElement).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dienstzeiten speichern' }))

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH')

      expect(patch?.body).toEqual({
        weeklyWindows: [
          { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
          { from_weekday: 5, to_weekday: 5, start: '07:00', end: '12:00' },
        ],
      })
    })
  })

  it('fills the duty around the clock with the preset of the technician', async () => {
    const calls: { method: string; body: unknown }[] = []
    stubRoutes(calls)

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Technik rund um die Uhr' }))

    expect((await screen.findByLabelText('Dienstblock 1 von')) as HTMLSelectElement).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dienstzeiten speichern' }))

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH')

      expect(patch?.body).toEqual({
        weeklyWindows: [{ from_weekday: 1, to_weekday: 0, start: '00:00', end: '24:00' }],
      })
    })
  })

  it('keeps the continuous plan editable beside the pool blocks', async () => {
    stubRoutes(undefined, [{ from_weekday: 1, to_weekday: 4, start: '07:30', end: '17:00' }])

    renderPage()

    const duration = (await screen.findByLabelText('Dauer in Tagen')) as HTMLInputElement

    expect(duration.disabled).toBe(false)
    expect(screen.getByText(/nutzt seine eigenen Dienstblöcke/)).toBeTruthy()
  })

  it('shows the name of the pool and carries its actions in the menu', async () => {
    stubRoutes()

    renderPage()

    expect((await screen.findAllByText('Verwaltung')).length).toBeGreaterThan(0)

    // The editor of a pool opens with „Bearbeiten“ (WP-M16-20d).
    expect(screen.queryByLabelText('Name')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    expect(screen.getByRole('menuitem', { name: 'Bearbeiten' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Deaktivieren' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Löschen' })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Gruppe')).toBeTruthy()
  })

  it('keeps the delete of a pool with shifts blocked and names the reason', async () => {
    stubRoutes(undefined, [], 2)

    renderPage()

    await screen.findAllByText('Verwaltung')

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    const remove = screen.getByRole('menuitem', { name: 'Löschen' }) as HTMLButtonElement

    expect(remove.disabled).toBe(true)
    expect(remove.getAttribute('title')).toBe(
      'Ein Pool mit Schichten kann nicht gelöscht werden.',
    )
  })
})
