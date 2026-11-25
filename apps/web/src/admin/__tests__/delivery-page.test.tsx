import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { DeliveryPage } from '../delivery-page'

/**
 * The page of the delivery problems (`specs/10-notifications.md` §11.8,
 * WP-M14-161b): the admin sees the failing channels and the lost messages and
 * quits the problem.
 */

const problems = {
  problems: [
    {
      channel: 'ntfy',
      failed: 3,
      unacknowledged: 2,
      lastFailureAt: '2026-11-18T09:00:05.000Z',
      lastSuccessAt: null,
      lastError: 'http_error',
      acknowledgedAt: null,
      acknowledgedBy: null,
      open: true,
    },
    {
      channel: 'matrix',
      failed: 1,
      unacknowledged: 0,
      lastFailureAt: '2026-11-17T08:00:00.000Z',
      lastSuccessAt: null,
      lastError: 'send_failed',
      acknowledgedAt: '2026-11-17T09:00:00.000Z',
      acknowledgedBy: 'Delivery, Ada',
      open: false,
    },
  ],
  failures: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      channel: 'webpush',
      eventType: 'ticket.created',
      failedAt: '2026-11-18T09:00:05.000Z',
      attempts: 3,
      error: 'send_failed',
      ticketNo: 'ST-0001',
    },
  ],
}

function meResponse(permissions: string[]) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.com',
      locale: 'de',
      roles: ['admin'],
      permissions,
    },
  }
}

/**
 * The protocol of the delivery (`specs/10-notifications.md` §11.16, ADR-0052):
 * one entry per delivery attempt with its recipient, its event, its channel and
 * its state.
 */
const attempts = {
  attempts: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      recipient: { userId: '44444444-4444-4444-8444-444444444444', name: 'Rita Receiver' },
      eventType: 'ticket.assigned',
      channel: 'ntfy',
      state: 'SENT',
      title: 'ST-0007',
      errorCode: null,
      attempts: 1,
      createdAt: '2026-11-19T09:00:00.000Z',
      updatedAt: '2026-11-19T09:00:01.000Z',
    },
  ],
  recipients: [{ userId: '44444444-4444-4444-8444-444444444444', name: 'Rita Receiver', count: 1 }],
}

function stub(options: {
  me: unknown
  delivery?: unknown
  attempts?: unknown
  acknowledge?: { status: number; body: unknown }
}) {
  const calls: Array<{ url: string; body: string }> = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) return Response.json(options.me)

      if (url.includes('/v1/notifications/delivery/acknowledge')) {
        calls.push({ url, body: String(init?.body ?? '') })

        if (options.acknowledge !== undefined) {
          return Response.json(options.acknowledge.body, { status: options.acknowledge.status })
        }

        return Response.json({
          acknowledgedAt: '2026-11-19T10:00:00.000Z',
          channels: ['ntfy'],
        })
      }

      if (url.includes('/v1/admin/notifications/attempts')) {
        return Response.json(options.attempts ?? attempts)
      }

      if (url.includes('/v1/notifications/delivery')) {
        return Response.json(options.delivery ?? problems)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )

  return calls
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/delivery']}>
          <DeliveryPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeliveryPage', () => {
  it('names the failing channels with their last failure and the lost messages', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Gestörte Zustellungen' })).toBeTruthy()
    expect(await screen.findByText('ntfy')).toBeTruthy()
    expect(screen.getByText('Matrix')).toBeTruthy()
    expect(screen.getByText('Web Push')).toBeTruthy()
    expect(screen.getByText('3 fehlgeschlagene Zustellungen')).toBeTruthy()
    expect(screen.getByText('2 nicht quittiert')).toBeTruthy()
    expect(screen.getAllByText(/Letzter Fehler:/)).toHaveLength(2)
    expect(screen.getByText('Verlorene Nachrichten')).toBeTruthy()
    expect(screen.getByText('3 Versuche')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Vorgang ST-0001' }).getAttribute('href')).toBe(
      '/tickets/ST-0001',
    )
  })

  it('names the event of a lost message in the interface language', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    expect(await screen.findByText('Verlorene Nachrichten')).toBeTruthy()
    expect(screen.getByText('Neuer Vorgang')).toBeTruthy()
    expect(screen.queryByText('ticket.created')).toBeNull()
  })

  it('names the reason of the failure and the machine code beside it', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    expect(await screen.findByText('Verlorene Nachrichten')).toBeTruthy()
    expect(screen.getByText('Der Push-Dienst hat die Zustellung nicht angenommen.')).toBeTruthy()
    expect(screen.getAllByText('Fehlercode: send_failed')).toHaveLength(2)
  })

  it('quits an open problem and names the user that quit it', async () => {
    const calls = stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    const button = await screen.findByRole('button', { name: 'Quittieren' })

    fireEvent.click(button)

    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })
    expect(calls[0]?.body).toBe(JSON.stringify({ channels: ['ntfy'] }))
    expect(await screen.findByText('Das Problem ist quittiert.')).toBeTruthy()
  })

  it('offers the quittature only with the permission to write', async () => {
    stub({ me: meResponse(['notification.read']) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Gestörte Zustellungen' })).toBeTruthy()
    expect(await screen.findByText('Quittiert von Delivery, Ada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Quittieren' })).toBeNull()
  })

  it('shows the empty state when no channel failed', async () => {
    stub({ me: meResponse(['notification.read']), delivery: { problems: [], failures: [] } })
    renderPage()

    expect(
      await screen.findByText('Keine gestörte Zustellung: alle Kanäle liefern.'),
    ).toBeTruthy()
  })

  it('shows the protocol of the delivery beside the problems', async () => {
    stub({
      me: meResponse(['notification.read', 'notification.write', 'notification.read_all']),
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Zustellprotokoll' })).toBeTruthy()
    expect(await screen.findByText('Rita Receiver')).toBeTruthy()
    expect(screen.getByText('ST-0007')).toBeTruthy()
    expect(screen.getAllByText('zugestellt').length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: 'Empfänger' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Kanal' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Ereignis' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Zustand' })).toBeTruthy()
  })

  it('hides the protocol without the right to read the messages of other users', async () => {
    stub({ me: meResponse(['notification.read', 'notification.write']) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Gestörte Zustellungen' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Zustellprotokoll' })).toBeNull()
  })
})
