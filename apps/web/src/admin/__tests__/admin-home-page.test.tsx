import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { i18n } from '../../i18n'
import { AdminHomePage } from '../admin-home-page'

/**
 * Administration home (`PLAN.md` §14, WP-M2-24, WP-M2-38): an available module renders a
 * link card, a module without a page keeps the planned badge. The BMAcloud sync card sits
 * directly after the roles card.
 */
function renderHome() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminHomePage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('AdminHomePage', () => {
  it('links the BMAcloud sync card directly after the roles card', async () => {
    renderHome()

    const roles = await screen.findByRole('link', {
      name: /Rollenverwaltung|Role administration/i,
    })
    const sync = screen.getByRole('link', { name: /BMAcloud/i })

    expect(sync.getAttribute('href')).toBe('/admin/bma-sync')
    expect(roles.closest('li')?.nextElementSibling).toBe(sync.closest('li'))
  })

  it('keeps a module without a route as a planned card', async () => {
    renderHome()

    expect(await screen.findByText(/Bereitschaftsplan|On-call roster/i)).toBeTruthy()
    expect(screen.getAllByText(/geplant|planned/i).length).toBeGreaterThan(0)
  })
})
