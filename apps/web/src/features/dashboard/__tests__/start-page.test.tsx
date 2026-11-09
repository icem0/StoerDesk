import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { StartPage } from '../start-page'

/**
 * Start page (WP-M9-19): the page ends with the count tiles and every tile is one
 * link over its whole area, not a link on the text only.
 */
function renderPage() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const total = url.includes('open=true')
        ? 2
        : url.includes('overdue=true')
          ? 1
          : url.includes('status=NEW')
            ? 4
            : 3

      return Response.json({ tickets: [], total, limit: 1, offset: 0 })
    }),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/']}>
          <StartPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StartPage tiles', () => {
  it('renders the four count tiles as links over their whole area', async () => {
    renderPage()

    await screen.findByText('3')

    const total = screen.getByRole('link', { name: /Meldungen gesamt/ })
    expect(total.getAttribute('href')).toBe('/tickets')
    expect(total.textContent).toContain('3')

    const open = screen.getByRole('link', { name: /offen/ })
    expect(open.getAttribute('href')).toBe('/tickets?open=true')
    expect(open.textContent).toContain('2')

    const overdue = screen.getByRole('link', { name: /überfällig/ })
    expect(overdue.getAttribute('href')).toBe('/tickets?overdue=true')
    expect(overdue.textContent).toContain('1')

    const unreviewed = screen.getByRole('link', { name: /ohne Prüfung/ })
    expect(unreviewed.getAttribute('href')).toBe('/tickets?status=NEW')
    expect(unreviewed.textContent).toContain('4')

    // The whole tile belongs to the link, so the tile is a block and not only
    // the text of the label.
    expect(total.className).toContain('block')
  })

  it('has no burning-now list any more', async () => {
    renderPage()

    await screen.findByText('3')

    expect(screen.queryByText('Brennt jetzt')).toBeNull()
  })
})
