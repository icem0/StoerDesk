import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OnCallShift } from '@stoerdesk/shared'

import { i18n } from '../../../i18n'
import { OpenShiftsSection } from '../open-shifts-section'

const poolId = '33333333-3333-4333-8333-333333333333'
const memberId = '44444444-4444-4444-8444-444444444444'

function shiftOf(
  id: string,
  state: OnCallShift['state'],
  daysFromNow: number,
): OnCallShift {
  const startsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)

  return {
    id,
    poolId,
    userId: memberId,
    state,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 8 * 60 * 60 * 1000),
    createdAt: startsAt,
    updatedAt: startsAt,
    technician: {
      id: memberId,
      givenName: 'Erika',
      familyName: 'Example',
      email: 'erika@example.org',
    },
  }
}

function renderSection(shifts: OnCallShift[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <OpenShiftsSection
          pools={[{ id: poolId, name: 'Bereitschaft, Nord' }]}
          shifts={shifts}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenShiftsSection', () => {
  it('lists the shifts that wait for a decision', () => {
    renderSection([
      shiftOf('22222222-2222-4222-8222-222222222222', 'DECLINED', 3),
      shiftOf('33333333-3333-4333-8333-333333333333', 'UNFILLED', 5),
    ])

    expect(screen.getByText('Offene Schichten')).toBeDefined()
    expect(screen.getAllByText('Abgelehnt')).toHaveLength(1)
    expect(screen.getAllByText('Unbesetzt')).toHaveLength(1)
    expect(screen.getAllByText('Bereitschaft, Nord')).toHaveLength(2)
  })

  it('leaves the confirmed and the swapped shifts out', () => {
    renderSection([
      shiftOf('22222222-2222-4222-8222-222222222222', 'CONFIRMED', 3),
      shiftOf('33333333-3333-4333-8333-333333333333', 'SWAP_REQUESTED', 4),
    ])

    expect(screen.getByText('Keine offene Schicht.')).toBeDefined()
  })

  it('leaves the shifts outside the horizon out', () => {
    renderSection([
      shiftOf('22222222-2222-4222-8222-222222222222', 'DECLINED', -60),
      shiftOf('33333333-3333-4333-8333-333333333333', 'DECLINED', 200),
    ])

    expect(screen.getByText('Keine offene Schicht.')).toBeDefined()
  })

  it('opens the dialog of the shift on a click', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/history')) {
          return Response.json({ events: [] })
        }

        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderSection([shiftOf('22222222-2222-4222-8222-222222222222', 'DECLINED', 3)])

    fireEvent.click(screen.getByRole('button', { name: /^\d/ }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    expect(screen.getByText('Schichtdetails')).toBeDefined()
  })
})
