import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { ObjectListPage } from '../object-list-page'

/**
 * Object list badge of WP-M2-39 (`specs/17-bmacloud-sync.md` §17.4/§17.5): an object whose
 * `external_id` is set carries the quiet "extern gepflegt" badge next to its number, the
 * locally maintained object does not, and the active badge stays independent.
 */
function objectSummary(objectNo: string, externalId: string | null) {
  return {
    id: `11111111-1111-4111-8111-${objectNo
      .replace(/[^0-9a-f]/gi, '')
      .padEnd(12, '0')
      .slice(0, 12)}`,
    objectNo,
    name: `Objekt ${objectNo}`,
    street: 'Beispielstraße',
    houseNumber: '1',
    postalCode: '12345',
    city: 'Beispielstadt',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    externalId,
    externalType: null,
    active: true,
    notes: null,
    qrToken: null,
    systems: [{ id: '22222222-2222-4222-8222-222222222222', type: 'BMA', label: 'Zentrale' }],
  }
}

function renderList() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        objects: [objectSummary('EXT-1', 'aid-7'), objectSummary('LOK-1', null)],
      }),
    ),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects']}>
          <ObjectListPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ObjectListPage', () => {
  it('badges only the externally maintained object and keeps the active badge', async () => {
    renderList()

    const externalRow = (await screen.findByText('EXT-1')).closest('tr')
    const localRow = screen.getByText('LOK-1').closest('tr')

    if (externalRow === null || localRow === null) {
      throw new Error('rows missing')
    }

    expect(
      await within(externalRow).findByText(/extern gepflegt|externally maintained/i),
    ).toBeTruthy()
    expect(within(localRow).queryByText(/extern gepflegt|externally maintained/i)).toBeNull()
    expect(within(externalRow).getByTitle(/BMAcloud/)).toBeTruthy()
    expect(within(externalRow).getByText(/Aktiv|Active/i)).toBeTruthy()
    expect(within(localRow).getByText(/Aktiv|Active/i)).toBeTruthy()
  })
})
