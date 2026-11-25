import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EmailPage } from '../email-page'

/**
 * The mailbox of the instance (`specs/10-notifications.md` §11.5a, ADR-0046,
 * WP-M33-01): the templates of the messages carry a standard text.
 *
 * The page offers a reset-to-standard button above every template field; the
 * button fills the standard text of that field in the language of the
 * interface. The standard texts are plain texts with the placeholders of
 * §11.5a — they reach the field as they are, the server fills the values.
 */

const channelBody = {
  channels: [
    {
      kind: 'email',
      name: 'email',
      enabled: false,
      config: {
        host: 'mail.example.org',
        port: '587',
        secure: 'false',
        user: '',
        from: 'stoerdesk@example.org',
        displayName: 'StörDesk',
      },
    },
  ],
}

/**
 * The standard text of a kind of message out of the texts of the page — the
 * test reads the same source the page reads, so the test names the field and
 * the placeholders, not a copy of the text.
 */
function standardText(kind: 'ticket' | 'readiness' | 'test' | 'registration' | 'passwordReset' | 'customerTicket') {
  return i18n.t(`admin.email.standard${kind.charAt(0).toUpperCase()}${kind.slice(1)}`, {
    ns: 'settings',
  })
}

function stubRoutes(
  permissions: string[],
  testResult: { delivered: boolean; code?: string } = { delivered: true },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'admin@example.org',
            locale: 'de',
            roles: ['admin'],
            permissions,
          },
        })
      }

      if (url.includes('/v1/admin/channels/email/test')) {
        return Response.json(testResult)
      }

      if (url.includes('/v1/admin/channels')) {
        return Response.json(channelBody)
      }

      if (url.includes('/v1/admin/notifications/deliveries')) {
        return Response.json({ deliveries: [] })
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
        <MemoryRouter initialEntries={['/admin/email']}>
          <Routes>
            <Route path="/admin/email" element={<EmailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

/** The button of a template field — the buttons carry the same name. */
async function resetButtons() {
  return screen.findAllByRole('button', { name: 'Standard zurücksetzen' })
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('EmailPage', () => {
  it('offers the reset-to-standard button above every template field', async () => {
    stubRoutes(['notification.read', 'notification.write'])
    renderPage()

    const buttons = await resetButtons()

    expect(buttons).toHaveLength(6)
  })

  it('fills the standard text of the field in the German interface', async () => {
    stubRoutes(['notification.read', 'notification.write'])
    renderPage()

    const buttons = await resetButtons()

    fireEvent.click(buttons[0] as HTMLElement)

    const field = document.querySelector('#email-template-ticket') as HTMLTextAreaElement

    expect(field.value).toBe(standardText('ticket'))
    expect(field.value).toContain('{ticket_no}')
    expect(field.value).toContain('{object}')
  })

  it('fills the standard text of the field in the English interface', async () => {
    await i18n.changeLanguage('en')
    stubRoutes(['notification.read', 'notification.write'])
    renderPage()

    const buttons = await screen.findAllByRole('button', { name: 'Reset to standard' })

    fireEvent.click(buttons[1] as HTMLElement)

    const field = document.querySelector('#email-template-readiness') as HTMLTextAreaElement

    expect(field.value).toBe(standardText('readiness'))
    expect(field.value).toContain('{pool}')
  })

  it('keeps the field of the reporter and the link of the portal inside the text', async () => {
    stubRoutes(['notification.read', 'notification.write'])
    renderPage()

    const buttons = await resetButtons()

    fireEvent.click(buttons[5] as HTMLElement)

    const field = document.querySelector('#email-template-customer-ticket') as HTMLTextAreaElement

    expect(field.value).toBe(standardText('customerTicket'))
  })

  it('does not offer the reset without the permission to write', async () => {
    stubRoutes(['notification.read'])
    renderPage()

    expect(await screen.findByText('Für die Verwaltung des Postfachs fehlt dir die Berechtigung.')).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: 'Standard zurücksetzen' })).toHaveLength(0)
  })

  it('names the reason of a failing test send instead of the machine code (WP-M41-01)', async () => {
    stubRoutes(['notification.read', 'notification.write'], { delivered: false, code: 'send_failed' })
    renderPage()

    const field = await screen.findByLabelText('Empfänger der Testnachricht')

    fireEvent.change(field, { target: { value: 'office@example.org' } })

    fireEvent.click(screen.getByRole('button', { name: 'Testnachricht senden' }))

    expect(
      await screen.findByText(
        'Testnachricht fehlgeschlagen: Der Mailserver hat die Nachricht nicht angenommen.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/send_failed/)).toBeNull()
  })
})
