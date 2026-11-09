import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { ObjectListPage } from '../object-list-page'

function objectSummary(objectNo: string) {
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
    externalId: null,
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
        objects: [objectSummary('EXT-1'), objectSummary('LOK-1')],
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
  it('renders object number, name, address and active badge per row', async () => {
    renderList()

    await screen.findByText('EXT-1')

    const firstRow = screen.getByText('EXT-1').closest('tr')
    expect(firstRow).toBeTruthy()
    expect(within(firstRow!).getByText('Objekt EXT-1')).toBeTruthy()
    expect(within(firstRow!).getByText('Beispielstraße, 1, 12345, Beispielstadt')).toBeTruthy()
    expect(within(firstRow!).getByText(/Aktiv|Active/i)).toBeTruthy()
  })

  it('shows edit and delete buttons side by side in the actions cell', async () => {
    renderList()

    await screen.findByText('EXT-1')

    const row = screen.getByText('EXT-1').closest('tr')
    expect(row).toBeTruthy()
    const lastCell = row!.querySelector('td:last-child') as HTMLElement
    expect(lastCell).toBeTruthy()
    expect(within(lastCell!).getByText(/Bearbeiten|Edit/i)).toBeTruthy()
    expect(within(lastCell!).getByText(/Löschen|Delete/i)).toBeTruthy()
  })

  it('has no external badge or type column', async () => {
    renderList()

    await screen.findByText('EXT-1')

    expect(screen.queryByText(/extern gepflegt|externally maintained/i)).toBeNull()
    expect(screen.queryByText(/Brandmeldeanlage|BMA/i)).toBeNull()
    expect(screen.queryByText(/Typ|Type/i)).toBeNull()
  })
})
