import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { ShiftAdminActions } from '../shift-admin-actions'
import type { OnCallShift } from '@stoerdesk/shared'

const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'
const otherMemberId = '55555555-5555-4555-8555-555555555555'

const shift = {
  id: '22222222-2222-4222-8222-222222222222',
  poolId,
  userId: memberId,
  state: 'DECLINED' as const,
  startsAt: new Date('2026-11-30T08:00:00.000Z'),
  endsAt: new Date('2026-11-30T16:00:00.000Z'),
  createdAt: new Date('2026-11-01T08:00:00.000Z'),
  updatedAt: new Date('2026-11-01T08:00:00.000Z'),
}

/**
 * The stub of the API: `/v1/me` answers the permissions, the members of the
 * pool answer the candidates of the assignment, and the writes of the shift
 * answer the calls of the test.
 */
function stubRoutes(
  permissions: string[],
  calls: { method: string; url: string; body: unknown }[] = [],
  write?: { status: number; code?: string; params?: Record<string, unknown> },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))

      calls.push({ method, url, body })

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'admin@example.org',
            locale: 'de',
            roles: ['admin'],
            permissions,
          },
        })
      }

      if (url.includes('/members')) {
        return Response.json({
          members: [
            {
              id: memberId,
              givenName: 'Erika',
              familyName: 'Example',
              email: 'erika@example.org',
            },
            {
              id: otherMemberId,
              givenName: 'Max',
              familyName: 'Mustermann',
              email: 'max@example.org',
            },
          ],
        })
      }

      if (write !== undefined) {
        return Response.json(
          { code: write.code ?? 'unknown', params: write.params ?? {} },
          { status: write.status },
        )
      }

      return Response.json({ ok: true })
    }),
  )
}

function renderActions(
  state: OnCallShift['state'] = 'DECLINED',
  startsAt: Date = new Date('2026-11-30T08:00:00.000Z'),
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ShiftAdminActions shift={{ ...shift, state, startsAt }} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ShiftAdminActions', () => {
  it('shows nothing for a role without oncall.admin', () => {
    stubRoutes(['oncall.read'])
    renderActions()

    expect(screen.queryByText('Aktionen der Bereitschaftsleitung')).toBeNull()
  })

  it('assigns a technician of the pool again', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    stubRoutes(['oncall.admin'], calls)
    renderActions()

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    // the candidates of the assignment arrive with the members of the pool
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Max Mustermann' })).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('Techniker'), {
      target: { value: otherMemberId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Neu zuweisen' }))

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH')

      expect(patch?.body).toEqual({ userId: otherMemberId, publish: true })
    })
  })

  it('deletes the shift after a confirmation', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    stubRoutes(['oncall.admin'], calls)
    renderActions()

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true)
    })
  })

  it('names the reason of a refused delete', async () => {
    stubRoutes(['oncall.admin'], [], {
      status: 409,
      code: 'oncall_shift_locked',
      params: { reason: 'confirmed' },
    })
    renderActions()

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

    await waitFor(() => {
      expect(
        screen.getByText('Die Schicht hat die Bereitschaft gehalten und bleibt im Verlauf.'),
      ).toBeDefined()
    })
  })

  it('reminds the technician of the shift by hand (WP-M23-09f)', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    stubRoutes(['oncall.admin'], calls)
    renderActions()

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Erinnern' }))

    await waitFor(() => {
      const call = calls.find((entry) => entry.url.includes('/remind'))

      expect(call?.method).toBe('POST')
    })
  })

  it('locks the reminder of a shift that started (WP-M23-09f)', async () => {
    stubRoutes(['oncall.admin'])
    renderActions('PLANNED', new Date('2020-01-01T08:00:00.000Z'))

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    const button = screen.getByRole('button', { name: 'Erinnern' }) as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe(
      'Die Schicht hat schon begonnen oder hat keinen Techniker.',
    )
  })

  it('hands a confirmed shift over to another technician (WP-M23-10)', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    stubRoutes(['oncall.admin'], calls)
    renderActions('CONFIRMED')

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    // the handover carries its own words
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Max Mustermann' })).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('Neuer Techniker'), {
      target: { value: otherMemberId },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Übergeben' }))

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH')

      expect(patch?.body).toEqual({ userId: otherMemberId, publish: true })
    })
  })

  it('locks the delete of a confirmed shift that started (ADR-0058)', async () => {
    stubRoutes(['oncall.admin'])
    renderActions('CONFIRMED', new Date('2020-01-01T08:00:00.000Z'))

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    const button = screen.getByRole('button', { name: 'Löschen' }) as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe(
      'Die Schicht hat schon begonnen und bleibt im Verlauf.',
    )
  })

  it('deletes a confirmed shift that has not started (ADR-0058)', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    stubRoutes(['oncall.admin'], calls)
    renderActions('CONFIRMED')

    await waitFor(() => {
      expect(screen.getByText('Aktionen der Bereitschaftsleitung')).toBeDefined()
    })

    const button = screen.getByRole('button', { name: 'Löschen' }) as HTMLButtonElement

    expect(button.disabled).toBe(false)

    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true)
    })
  })
})
