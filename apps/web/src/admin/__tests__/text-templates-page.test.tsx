import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { TextTemplatesPage } from '../text-templates-page'

/**
 * Fault catalog administration (WP-M10-20, WP-M10-20b, WP-M16-13).
 *
 * The endpoint is now frequency-ordered to serve the report and office forms, so
 * the management table re-sorts itself and keeps an alphabetical key order. The
 * stub answers `z_frequent` first; the rendered table must show `a_rare` first.
 *
 * A fault type that a ticket still carries cannot be deleted. The delete button
 * is greyed out and explains itself on hover; the reason is no text of its own
 * below the button, because it broke the layout of the row.
 */

const catalogBody = {
  templates: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      key: 'z_frequent',
      archivedAt: null,
      translations: { de: 'Frequent fault', en: 'Frequent fault' },
      usageCount: 2,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'a_rare',
      archivedAt: null,
      translations: { de: 'Rare fault', en: 'Rare fault' },
      usageCount: 1,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      key: 'm_unused',
      archivedAt: null,
      translations: { de: 'Unused fault', en: 'Unused fault' },
      usageCount: 0,
    },
  ],
}

function stubRoutes(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'admin@example.com',
            locale: 'de',
            roles: ['admin'],
            permissions,
          },
        })
      }

      if (url.includes('/v1/text-templates')) {
        return Response.json(catalogBody)
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
        <MemoryRouter initialEntries={['/admin/text-templates']}>
          <Routes>
            <Route path="/admin/text-templates" element={<TextTemplatesPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TextTemplatesPage', () => {
  it('keeps the table alphabetical by key despite the frequency-ordered endpoint', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    const cells = await screen.findAllByRole('cell')
    const keyOrder = cells
      .map((cell: HTMLElement) => cell.textContent)
      .filter((text: string) => text === 'a_rare' || text === 'z_frequent')

    expect(keyOrder).toEqual(['a_rare', 'z_frequent'])
  })

  it('greys out the blocked delete and names the reason on hover', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    const hints = await screen.findAllByTitle('Wird von Vorgängen verwendet')

    expect(hints).toHaveLength(2)

    for (const hint of hints) {
      const blockedButton = within(hint).getByRole('button') as HTMLButtonElement

      expect(blockedButton.disabled).toBe(true)
    }

    // The reason is a hint of the button, no text of its own below it.
    expect(screen.queryByText('Wird von Vorgängen verwendet')).toBeNull()

    const deleteButtons = await screen.findAllByRole('button', { name: 'Löschen' })
    const enabled = deleteButtons.filter(
      (button: HTMLElement) => !(button as HTMLButtonElement).disabled,
    )

    expect(deleteButtons).toHaveLength(3)
    expect(enabled).toHaveLength(1)
  })
})
