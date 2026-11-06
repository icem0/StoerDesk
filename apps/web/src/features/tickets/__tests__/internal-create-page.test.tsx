import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { InternalCreatePage } from '../internal-create-page'

const OBJECT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ID = '22222222-2222-4222-8222-222222222222'

function stubTicketError(code: string, status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/tickets')) {
        return Response.json({ code, params: {} }, { status })
      }

      if (path.includes('/v1/text-templates')) {
        return Response.json({ templates: [] })
      }

      // Everything else (objects query, etc.) returns the demo object.
      return Response.json({
        objects: [
          {
            id: OBJECT_ID,
            objectNo: '12345_01',
            name: 'Rathaus',
            systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
          },
        ],
      })
    }),
  )
}

function stubMultipleObjects() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/tickets')) {
        return Response.json({ ok: true }, { status: 201 })
      }

      if (path.includes('/v1/text-templates')) {
        return Response.json({ templates: [] })
      }

      return Response.json({
        objects: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            objectNo: '10000_01',
            name: 'Feuerwache',
            systems: [],
          },
          {
            id: OBJECT_ID,
            objectNo: '12345_01',
            name: 'Rathaus',
            systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            objectNo: '90000_01',
            name: 'Schule',
            systems: [],
          },
        ],
      })
    }),
  )
}

function stubNetworkFailure() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/tickets')) {
        throw new TypeError('failed to fetch')
      }

      if (path.includes('/v1/text-templates')) {
        return Response.json({ templates: [] })
      }

      return Response.json({
        objects: [
          {
            id: OBJECT_ID,
            objectNo: '12345_01',
            name: 'Rathaus',
            systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
          },
        ],
      })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/new']}>
          <Routes>
            <Route path="/objects/new" element={<InternalCreatePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function pickObjectAndSubmit() {
  const searchInput = (await screen.findByRole('searchbox')) as HTMLInputElement
  // The picker is closed by default — open it on focus first.
  fireEvent.focus(searchInput)
  await screen.findByText('Rathaus')
  fireEvent.change(searchInput, { target: { value: '1234' } })
  await screen.findByText('Rathaus')
  fireEvent.click(screen.getByText('12345_01'))
  fireEvent.click(screen.getByRole('button', { name: 'Meldung erstellen' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('InternalCreatePage', () => {
  it('shows object_not_found as a specific hint instead of the generic unknown message', async () => {
    stubTicketError('object_not_found', 404)
    renderPage()
    await pickObjectAndSubmit()

    await waitFor(() =>
      expect(
        screen.getByText(
          'Dieses Objekt existiert nicht mehr. Bitte wählen Sie ein anderes Objekt.',
        ),
      ).toBeTruthy(),
    )
  })

  it('shows session_invalid as a specific hint', async () => {
    stubTicketError('session_invalid', 401)
    renderPage()
    await pickObjectAndSubmit()

    await waitFor(() =>
      expect(
        screen.getByText('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.'),
      ).toBeTruthy(),
    )
  })

  it('shows ticket_create_failed as a specific hint', async () => {
    stubTicketError('ticket_create_failed', 500)
    renderPage()
    await pickObjectAndSubmit()

    await waitFor(() =>
      expect(
        screen.getByText(
          'Die Meldung konnte technisch nicht angelegt werden. Bitte versuchen Sie es später erneut.',
        ),
      ).toBeTruthy(),
    )
  })

  it('shows invalid_request as a check-your-inputs hint', async () => {
    stubTicketError('invalid_request', 400)
    renderPage()
    await pickObjectAndSubmit()

    await waitFor(() =>
      expect(screen.getByText('Bitte prüfen Sie die Eingaben.')).toBeTruthy(),
    )
  })

  it('keeps the generic unknown message for a non-ApiError failure', async () => {
    stubNetworkFailure()
    renderPage()
    await pickObjectAndSubmit()

    await waitFor(() =>
      expect(screen.getByText('Die Meldung konnte nicht erstellt werden.')).toBeTruthy(),
    )
  })

  it('shows all objects sorted by default and filters them live while typing', async () => {
    stubMultipleObjects()
    renderPage()

    const searchInput = (await screen.findByRole('searchbox')) as HTMLInputElement

    // The picker is closed by default — opening it on focus shows all objects,
    // sorted by objectNo, inside a bounded scrollable list.
    fireEvent.focus(searchInput)
    await screen.findByText('10000_01')
    await screen.findByText('12345_01')
    await screen.findByText('90000_01')

    fireEvent.change(searchInput, { target: { value: 'schule' } })

    // Live filter: only the matching object remains (debounced).
    await waitFor(() => expect(screen.queryByText('12345_01')).toBeNull())
    await waitFor(() => expect(screen.queryByText('10000_01')).toBeNull())
    await screen.findByText('90000_01')

    // Clearing the search shows all objects again, still sorted.
    fireEvent.change(searchInput, { target: { value: '' } })
    await screen.findByText('10000_01')
    await screen.findByText('12345_01')
    await screen.findByText('90000_01')
  })
})
