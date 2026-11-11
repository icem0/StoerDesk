import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketDetailPage } from '../ticket-detail-page'

const TICKET_NO = 'ST-2026-0001'

function fixture() {
  return {
    ticket: {
      id: '11111111-1111-4111-8111-111111111111',
      ticketNo: TICKET_NO,
      objectNo: '12345_01',
      objectName: 'Rathaus',
      status: 'NEW',
      priority: 'normal',
      title: null,
      description: null,
      faultTemplateKeys: [],
      source: 'INTERNAL',
      reportedAt: '2026-11-09T19:00:00.000Z',
      receivedAt: '2026-11-10T08:00:00.000Z',
      deadlineAt: '2026-11-12T19:00:00.000Z',
      reporterName: 'Erika Extern',
      reporterPhone: null,
      reporterEmail: 'erika@example.invalid',
      recordedBy: 'Max Muster',
      statusToken: null,
    },
    events: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'created',
        actorKind: 'user',
        actorName: 'Max Muster',
        payload: {},
        createdAt: '2026-11-10T08:00:00.000Z',
      },
    ],
    photos: [],
    timeline: {
      reportedAt: '2026-11-09T19:00:00.000Z',
      deadlineAt: '2026-11-12T19:00:00.000Z',
      stoppedAt: null,
      pausedMs: 0,
      totalMs: 259_200_000,
      elapsedMs: 46_800_000,
      remainingMs: 212_400_000,
      percent: 18,
      state: 'green',
      pause: null,
      markers: [{ type: 'created', at: '2026-11-10T08:00:00.000Z' }],
    },
    pauses: [],
  }
}

function renderPage() {
  const comments: unknown[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({ user: { id: 'u1', email: 'max@example.invalid', permissions: [] } })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/comments`)) {
      comments.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ ticketNo: TICKET_NO, at: '2026-11-10T09:00:00.000Z', replayed: false })
    }

    return Response.json(fixture())
  })

  vi.stubGlobal('fetch', fetchMock)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/tickets/${TICKET_NO}`]}>
          <Routes>
            <Route path="/tickets/:ticketNo" element={<TicketDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return { comments }
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText('Beschreibung') as HTMLTextAreaElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('TicketDetailPage comment composer', () => {
  it('warns that a saved comment can no longer be corrected', async () => {
    const { comments } = renderPage()

    const field = await waitFor(() => composer())
    fireEvent.change(field, { target: { value: 'Tür schließt nicht' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kommentar speichern' }))

    await waitFor(() =>
      expect(screen.getByText(/nicht mehr geändert oder gelöscht werden/i)).toBeTruthy(),
    )
    expect(screen.getAllByText('Tür schließt nicht').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(comments).toHaveLength(0)
  })

  it('saves the comment after the warning was confirmed', async () => {
    const { comments } = renderPage()

    const field = await waitFor(() => composer())
    fireEvent.change(field, { target: { value: 'Tür schließt nicht' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kommentar speichern' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(comments).toHaveLength(1))
    expect(comments[0]).toMatchObject({ text: 'Tür schließt nicht' })
  })

  it('checks the spelling with the dictionary of the interface language', async () => {
    renderPage()

    const field = await waitFor(() => composer())

    expect(field.getAttribute('spellcheck')).not.toBeNull()
    expect(field.lang).toBe('de')
    expect(screen.getByText(/Rechtschreibprüfung des Browsers/i)).toBeTruthy()
  })
})
