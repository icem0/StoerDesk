import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function renderPage(options: { permissions?: string[]; events?: unknown[] } = {}) {
  const comments: unknown[] = []
  const internalComments: unknown[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)

    if (path.includes('/v1/me')) {
      return Response.json({
        user: {
          id: 'u1',
          email: 'max@example.invalid',
          permissions: options.permissions ?? [],
        },
      })
    }

    if (path.includes('/v1/settings/display')) {
      return Response.json({ internalCommentColor: '#450a0a' })
    }

    if (path.includes('/v1/text-templates')) {
      return Response.json({ templates: [] })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/comments/internal`)) {
      internalComments.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ ticketNo: TICKET_NO, at: '2026-11-10T09:00:00.000Z', replayed: false })
    }

    if (path.includes(`/v1/tickets/${TICKET_NO}/comments`)) {
      comments.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ ticketNo: TICKET_NO, at: '2026-11-10T09:00:00.000Z', replayed: false })
    }

    const data = fixture()

    if (options.events !== undefined) {
      data.events = options.events as typeof data.events
    }

    return Response.json(data)
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

  return { comments, internalComments }
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText('Kommentar') as HTMLTextAreaElement
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

describe('TicketDetailPage — the internal comment', () => {
  it('offers the internal comment only with the key', async () => {
    renderPage({ permissions: [] })

    await waitFor(() => composer())
    expect(screen.queryByLabelText(/Interner Kommentar|Internal comment/i)).toBeNull()

    renderPage({ permissions: ['ticket.comment.internal'] })

    await waitFor(() =>
      expect(screen.getByLabelText(/Interner Kommentar|Internal comment/i)).toBeTruthy(),
    )
  })

  it('writes the internal comment to its own route', async () => {
    const { comments, internalComments } = renderPage({
      permissions: ['ticket.comment.internal'],
    })

    const field = await waitFor(() => composer())
    fireEvent.click(screen.getByLabelText(/Interner Kommentar|Internal comment/i))
    fireEvent.change(field, { target: { value: 'Nur für die Kollegen' } })
    fireEvent.click(screen.getByRole('button', { name: /Internen Kommentar speichern|Save the internal comment/i }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Speichern|Save/i }),
    )

    await waitFor(() => expect(internalComments).toHaveLength(1))
    expect(internalComments[0]).toMatchObject({ text: 'Nur für die Kollegen' })
    expect(comments).toHaveLength(0)
  })

  it('paints the field in the colour of the instance', async () => {
    renderPage({ permissions: ['ticket.comment.internal'] })

    const field = await waitFor(() => composer())
    expect((field as HTMLElement).style.backgroundColor).toBe('')

    fireEvent.click(screen.getByLabelText(/Interner Kommentar|Internal comment/i))

    await waitFor(() =>
      expect((field as HTMLElement).style.backgroundColor).toBe('rgb(69, 10, 10)'),
    )
  })

  it('shows the internal comment of the history in the colour', async () => {
    renderPage({
      permissions: ['ticket.comment.internal'],
      events: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'internal_comment',
          actorKind: 'user',
          actorName: 'Max Muster',
          payload: { text: 'Nur für die Kollegen' },
          createdAt: '2026-11-10T09:30:00.000Z',
        },
      ],
    })

    const entry = await waitFor(() => screen.getByText('Nur für die Kollegen'))

    expect((entry as HTMLElement).style.backgroundColor).toBe('rgb(69, 10, 10)')
  })
})
