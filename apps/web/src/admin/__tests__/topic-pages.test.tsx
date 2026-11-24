import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import { i18n } from '../../i18n'
import { AccessPage } from '../access-page'
import { WorkflowPage } from '../workflow-page'
import { ReadinessPage } from '../readiness-page'
import { MessagingPage } from '../messaging-page'

function renderPage(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/access']}>
          <Routes>
            <Route path="*" element={element} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('topic pages of the administration', () => {
  it('shows the access page with its modules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json({
            user: { email: 'admin@example.com', roles: ['admin'], permissions: [] },
          })
        }
        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage(<AccessPage />)

    expect(await screen.findByRole('heading', { name: 'Benutzer & Rechte', level: 1 })).toBeTruthy()
    expect(await screen.findByText('Benutzer, Rollen und Gruppen')).toBeTruthy()

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/admin/users')?.textContent).toContain('Benutzer')
    expect(linkOf('/admin/roles')?.textContent).toContain('Rollen')
    expect(linkOf('/admin/groups')?.textContent).toContain('Gruppen')
  })

  it('shows the workflow page with its modules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json({
            user: { email: 'admin@example.com', roles: ['admin'], permissions: [] },
          })
        }
        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage(<WorkflowPage />)

    expect(await screen.findByRole('heading', { name: 'Meldungsablauf', level: 1 })).toBeTruthy()
    expect(await screen.findByText('Status, Störungsarten, Eskalation und Standardwerte')).toBeTruthy()

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/admin/statuses')?.textContent).toContain('Status')
    expect(linkOf('/admin/text-templates')?.textContent).toContain('Störungsarten')
    expect(linkOf('/admin/escalation')?.textContent).toContain('Eskalation')
    expect(linkOf('/admin/defaults')?.textContent).toContain('Standardwerte')
  })

  it('shows the readiness page with its modules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json({
            user: { email: 'admin@example.com', roles: ['admin'], permissions: [] },
          })
        }
        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage(<ReadinessPage />)

    expect(await screen.findByRole('heading', { name: 'Bereitschaft', level: 1 })).toBeTruthy()

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/admin/oncall')?.textContent).toContain('Bereitschaftsplan')
    expect(linkOf('/oncall')?.textContent).toContain('Meine Bereitschaft')
  })

  it('shows the messaging page with its modules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/me')) {
          return Response.json({
            user: { email: 'admin@example.com', roles: ['admin'], permissions: [] },
          })
        }
        return Response.json({ code: 'not_found', params: {} }, { status: 404 })
      }),
    )

    renderPage(<MessagingPage />)

    expect(await screen.findByRole('heading', { name: 'Kanäle & Versand', level: 1 })).toBeTruthy()

    const linkOf = (href: string) =>
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === href)

    expect(linkOf('/admin/channels')?.textContent).toContain('Kanäle')
    expect(linkOf('/admin/delivery')?.textContent).toContain('Zustellungsprobleme')
    expect(linkOf('/admin/email')?.textContent).toContain('Mailbox des Betriebs')
    expect(linkOf('/admin/api-keys')?.textContent).toContain('API-Schlüssel')
  })
})
