import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { InternalCreatePage } from '../internal-create-page'

const OBJECT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ID = '22222222-2222-4222-8222-222222222222'
const REPORTER_USER_ID = '66666666-6666-4666-8666-666666666666'

/**
 * The branding title switch (WP-M9-25): the form reads it from
 * `GET /v1/settings/title-switch` before it renders the title field. The stub
 * answers it explicitly, so a test decides whether the field exists.
 */
function stubTicketError(code: string, status: number, titleEnabled = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/settings/title-switch')) {
        return Response.json({ titleEnabled })
      }

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
            externalType: 'Brandmeldeanlage',
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
            externalType: 'Brandmeldeanlage',
            systems: [],
          },
          {
            id: OBJECT_ID,
            objectNo: '12345_01',
            name: 'Rathaus',
            externalType: 'Brandmeldeanlage',
            systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            objectNo: '90000_01',
            name: 'Schule',
            externalType: null,
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
            externalType: 'Brandmeldeanlage',
            systems: [{ id: SYSTEM_ID, type: 'BMA', label: 'BMA Mitte' }],
          },
        ],
      })
    }),
  )
}

function stubTicketCreated(ticketNo: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/tickets') && path.endsWith('/tickets')) {
        return Response.json(
          {
            ticketId: '55555555-5555-4555-8555-555555555555',
            ticketNo,
            status: 'NEW',
            statusToken: 'st-1234',
            reportedAt: '2025-01-01T08:00:00Z',
            receivedAt: '2025-01-01T08:00:00Z',
            deadlineAt: '2025-01-04T08:00:00Z',
          },
          { status: 201 },
        )
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
            externalType: 'Brandmeldeanlage',
            systems: [],
          },
        ],
      })
    }),
  )
}

/**
 * Stubs the whole path of the internal form with a chosen title switch and
 * records the body of the create request (WP-M9-25).
 */
function stubInternalForm(titleEnabled: boolean) {
  const bodies: Record<string, unknown>[] = []
  /** Every answer of the title switch — a test waits for it. */
  const switchCalls: boolean[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/settings/title-switch')) {
        switchCalls.push(titleEnabled)

        return Response.json({ titleEnabled })
      }

      if (path.includes('/v1/settings/deadline-hours')) {
        return Response.json({ low: 168, normal: 72, high: 24, critical: 8 })
      }

      if (path.includes('/v1/tickets/reporter-users')) {
        return Response.json({
          users: [{ id: REPORTER_USER_ID, name: 'Rita Ruf', email: 'rita.ruf@example.invalid' }],
        })
      }

      if (path.includes('/v1/tickets') && path.endsWith('/tickets')) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)

        return Response.json(
          {
            ticketId: '55555555-5555-4555-8555-555555555555',
            ticketNo: 'ST-2025-0001',
            status: 'NEW',
            statusToken: 'st-1234',
            reportedAt: '2025-01-01T08:00:00Z',
            receivedAt: '2025-01-01T08:00:00Z',
            deadlineAt: '2025-01-04T08:00:00Z',
          },
          { status: 201 },
        )
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
            externalType: 'Brandmeldeanlage',
            systems: [],
          },
        ],
      })
    }),
  )

  return { bodies, switchCalls }
}

function TicketDetailStub() {
  const { ticketNo } = useParams()
  return <p data-testid="ticket-detail">{ticketNo ?? '-'}</p>
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

function renderPageWithRoutes() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/new']}>
          <Routes>
            <Route path="/objects/new" element={<InternalCreatePage />} />
            <Route path="/tickets/:ticketNo" element={<TicketDetailStub />} />
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

    await waitFor(() => expect(screen.getByText('Bitte prüfen Sie die Eingaben.')).toBeTruthy())
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

  it('shows number, name and type in the list and keeps the pick inside the field', async () => {
    stubMultipleObjects()
    renderPage()

    const searchInput = (await screen.findByRole('searchbox')) as HTMLInputElement
    fireEvent.focus(searchInput)
    await screen.findByText('12345_01')

    // The type of the object is part of every option.
    expect(screen.getAllByText('BMA')).toHaveLength(2)

    fireEvent.click(screen.getByText('12345_01'))

    // The pick replaces the search text inside the field and closes the overlay.
    expect(searchInput.value).toBe('12345_01 — Rathaus (BMA)')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('navigates to the ticket detail after a successful creation', async () => {
    stubTicketCreated('ST-2025-0001')
    renderPageWithRoutes()
    await pickObjectAndSubmit()

    await waitFor(() => expect(screen.getByText('ST-2025-0001')).toBeTruthy())
  })

  it('offers no title field while the branding title switch is off', async () => {
    const { switchCalls } = stubInternalForm(false)
    renderPage()

    // The form asks the switch before it renders the title field.
    await waitFor(() => expect(switchCalls.length).toBeGreaterThan(0))

    // The title input never reaches the DOM, so the office cannot fill in a
    // title the installation does not keep.
    expect(screen.queryByLabelText('Titel')).toBeNull()
    expect(screen.queryByDisplayValue('Rauchmelder 2. OG')).toBeNull()
  })

  it('shows the configured deadline next to every priority', async () => {
    stubInternalForm(false)
    renderPage()

    await screen.findByRole('option', { name: 'Niedrig (168h)' })
    await screen.findByRole('option', { name: 'Normal (72h)' })
    await screen.findByRole('option', { name: 'Hoch (24h)' })
    await screen.findByRole('option', { name: 'Kritisch (8h)' })
  })

  it('offers the title field and sends it while the switch is on', async () => {
    const { bodies, switchCalls } = stubInternalForm(true)
    renderPage()

    await waitFor(() => expect(switchCalls.length).toBeGreaterThan(0))

    const titleField = (await screen.findByLabelText('Titel')) as HTMLInputElement
    fireEvent.change(titleField, { target: { value: 'Rauchmelder 2. OG' } })

    await pickObjectAndSubmit()

    await waitFor(() => expect(bodies.length).toBe(1))
    expect(bodies[0]?.title).toBe('Rauchmelder 2. OG')
  })

  it('defaults the report time to now and sends channel and reporter kind', async () => {
    const { bodies } = stubInternalForm(false)
    renderPage()

    const reportTime = (await screen.findByLabelText('Gemeldet am')) as HTMLInputElement
    expect(reportTime.value).not.toBe('')
    fireEvent.change(reportTime, { target: { value: '2026-11-09T20:00' } })

    expect((screen.getByRole('radio', { name: 'Telefon' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'E-Mail' }))

    await pickObjectAndSubmit()

    await waitFor(() => expect(bodies.length).toBe(1))
    expect(bodies[0]?.reporterChannel).toBe('email')
    expect(bodies[0]?.reporterKind).toBe('external')
    expect(new Date(String(bodies[0]?.reportedAt)).getTime()).not.toBeNaN()
  })

  it('lets an internal reporter be picked from the user list', async () => {
    const { bodies } = stubInternalForm(false)
    renderPage()

    fireEvent.click(screen.getByRole('radio', { name: 'Mitarbeiter (intern)' }))

    const select = (await screen.findByLabelText('Mitarbeiter auswählen')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1))
    fireEvent.change(select, { target: { value: REPORTER_USER_ID } })

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rita Ruf')

    await pickObjectAndSubmit()

    await waitFor(() => expect(bodies.length).toBe(1))
    expect(bodies[0]?.reporterKind).toBe('internal')
    expect(bodies[0]?.reportedByUserId).toBe(REPORTER_USER_ID)
  })

  it('warns about a future report time and never sends the blind report', async () => {
    const { bodies } = stubInternalForm(false)
    renderPage()

    // Pick an object first so the submit button is enabled.
    const searchInput = (await screen.findByRole('searchbox')) as HTMLInputElement
    fireEvent.focus(searchInput)
    await screen.findByText('Rathaus')
    fireEvent.click(screen.getByText('12345_01'))

    // A report time far in the future is rejected by the API (§7 rule 1, WP-M2-98b).
    const reportTime = (await screen.findByLabelText('Gemeldet am')) as HTMLInputElement
    fireEvent.change(reportTime, { target: { value: '2099-01-01T00:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Meldung erstellen' }))

    // The form warns immediately and the create request never reaches the server,
    // so the office cannot forward to a ticket that was never created.
    await waitFor(() =>
      expect(
        screen.getByText('Die reported time must not be in the future. Please choose now or a past time.'),
      ).toBeTruthy(),
    )
    expect(bodies.length).toBe(0)
  })
})
