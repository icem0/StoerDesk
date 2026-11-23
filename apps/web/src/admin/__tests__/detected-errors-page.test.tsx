import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { DetectedErrorsPage } from '../detected-errors-page'

/**
 * The catalog of the detected errors (`specs/13-detected-errors.md` §13.5,
 * WP-M16-17).
 *
 * Since WP-M16-17 the list follows the rule of `specs/13-ui.md` §14.8: the row
 * shows the name of the language of the interface only and the actions of the
 * row sit behind the `…` button. An archived entry cannot be deleted — the
 * delete in the menu is blocked and names the reason on hover.
 */

const catalogBody = {
  detectedErrors: [
    {
      key: 'cable_damage',
      labelDe: 'Kabel beschädigt',
      labelEn: 'Damaged cable',
      archivedAt: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    {
      key: 'sensor_defect',
      labelDe: 'Sensor defekt',
      labelEn: 'Defective sensor',
      archivedAt: '2026-11-02T10:00:00.000Z',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
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

      if (url.includes('/v1/detected-errors')) {
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
        <MemoryRouter initialEntries={['/admin/detected-errors']}>
          <Routes>
            <Route path="/admin/detected-errors" element={<DetectedErrorsPage />} />
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

describe('DetectedErrorsPage', () => {
  it('shows the name of the interface language and no second name', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    expect(await screen.findByText('Kabel beschädigt')).toBeTruthy()
    expect(screen.queryByText('Damaged cable')).toBeNull()
    expect(screen.queryByText('cable_damage')).toBeNull()
  })

  it('shows the English name in the English interface', async () => {
    await i18n.changeLanguage('en')
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    expect(await screen.findByText('Damaged cable')).toBeTruthy()
    expect(screen.queryByText('Kabel beschädigt')).toBeNull()
  })

  it('carries the actions of the row in the menu', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    await openRowMenu(0)

    expect(screen.getByRole('menuitem', { name: 'Bearbeiten' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Archivieren' })).toBeTruthy()
  })

  it('blocks the delete of an archived entry and names the reason', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    // The rows are sorted by key: `cable_damage`, `sensor_defect` (archived).
    await openRowMenu(1)

    const blocked = screen.getByRole('menuitem', { name: 'Löschen' }) as HTMLButtonElement

    expect(blocked.disabled).toBe(true)
    expect(blocked.getAttribute('title')).toBe('Wird von Vorgängen verwendet')
  })

  it('shows the key and every translation in the edit', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    await openRowMenu(0)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    expect(await screen.findByLabelText('Schlüssel')).toHaveProperty('value', 'cable_damage')
    expect(screen.getByLabelText('Deutscher Text')).toHaveProperty('value', 'Kabel beschädigt')
    expect(screen.getByLabelText('Englischer Text')).toHaveProperty('value', 'Damaged cable')
  })
})
