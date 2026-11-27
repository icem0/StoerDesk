import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { TextTemplatesPage } from '../text-templates-page'

/**
 * Fault catalog administration (WP-M10-20, WP-M10-20b, WP-M16-13, WP-M16-16).
 *
 * The endpoint is now frequency-ordered to serve the report and office forms, so
 * the management table re-sorts itself and keeps an alphabetical key order. The
 * stub answers `z_frequent` first; the rendered table must show `a_rare` first.
 *
 * Since WP-M16-16 the list follows the rule of `specs/13-ui.md` §14.8: the row
 * shows the name of the language of the interface only — the key and the second
 * name are no columns of the table — and the actions of the row sit behind one
 * `…` button. The edit shows the key beside the translation texts.
 *
 * A fault type that a ticket still carries cannot be deleted. The delete is
 * blocked in the menu and names the reason on hover; the reason is no text of
 * its own in the row, because it broke the layout of the row.
 */

const catalogBody = {
  templates: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      key: 'z_frequent',
      archivedAt: null,
      translations: { de: 'Häufige Störung', en: 'Frequent fault' },
      usageCount: 2,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'a_rare',
      archivedAt: null,
      translations: { de: 'Seltene Störung', en: 'Rare fault' },
      usageCount: 1,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      key: 'm_unused',
      archivedAt: null,
      translations: { de: 'Unbenutzte Störung', en: 'Unused fault' },
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
            email: 'admin@example.org',
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

async function openRowMenu(index: number) {
  const buttons = await screen.findAllByRole('button', { name: 'Aktionen' })

  fireEvent.click(buttons[index] as HTMLElement)
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('TextTemplatesPage', () => {
  it('keeps the table alphabetical by key despite the frequency-ordered endpoint', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    // The rows are sorted by key: `a_rare`, `m_unused`, `z_frequent`.
    // The key stands in the panel of the ⓘ of the row, not in a tooltip.
    const triggers = await screen.findAllByRole('button', { name: /Erklärung zu/ })

    const keysOfRows: string[] = []

    for (const index of [0, 2]) {
      const trigger = triggers[index] as HTMLElement

      fireEvent.click(trigger)
      keysOfRows.push(screen.getByRole('note').textContent ?? '')
      fireEvent.click(trigger)
    }

    expect(keysOfRows[0]).toContain('a_rare')
    expect(keysOfRows[1]).toContain('z_frequent')
  })

  it('shows the name of the interface language and no second name', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    expect(await screen.findByText('Seltene Störung')).toBeTruthy()
    // The English name is no column of the table and the key is no text of its own.
    expect(screen.queryByText('Rare fault')).toBeNull()
    expect(screen.queryByText('a_rare')).toBeNull()
  })

  it('shows the English name in the English interface', async () => {
    await i18n.changeLanguage('en')
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    expect(await screen.findByText('Rare fault')).toBeTruthy()
    expect(screen.queryByText('Seltene Störung')).toBeNull()
  })

  it('carries the actions of the row in the menu and blocks the used delete', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    // The rows are sorted by key: `a_rare` (used by a ticket), `m_unused`,
    // `z_frequent` (used by two tickets).
    await openRowMenu(0)

    expect(screen.getByRole('menuitem', { name: 'Bearbeiten' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Archivieren' })).toBeTruthy()

    const blocked = screen.getByRole('menuitem', { name: 'Löschen' }) as HTMLButtonElement

    expect(blocked.disabled).toBe(true)
    expect(blocked.getAttribute('title')).toBeNull()
    expect(screen.getByText('Wird von Vorgängen verwendet')).toBeTruthy()
  })

  it('shows the key and every translation in the edit', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    await openRowMenu(0)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    expect(await screen.findByLabelText('Schlüssel')).toHaveProperty('value', 'a_rare')
    expect(screen.getByLabelText('Deutscher Text')).toHaveProperty('value', 'Seltene Störung')
    expect(screen.getByLabelText('Englischer Text')).toHaveProperty('value', 'Rare fault')
  })
})
