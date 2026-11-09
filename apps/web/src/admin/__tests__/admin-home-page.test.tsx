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
  it('links the BMAcloud sync card after the groups card', async () => {
    renderHome()

    const roles = await screen.findByRole('link', {
      name: /Rollenverwaltung|Role administration/i,
    })
    const groupsText = await screen.findByText(/^Gruppen$|^Groups$/i)
    const groups = groupsText.closest('a')
    const sync = screen.getByRole('link', { name: /BMAcloud/i })

    expect(groups?.getAttribute('href')).toBe('/admin/groups')
    expect(sync.getAttribute('href')).toBe('/admin/bma-sync')
    expect(roles.closest('li')?.nextElementSibling).toBe(groups?.closest('li'))
    expect(groups?.closest('li')?.nextElementSibling).toBe(sync.closest('li'))
  })

  it('keeps a module without a route as a planned card', async () => {
    renderHome()

    expect(await screen.findByText(/Bereitschaftsplan|On-call roster/i)).toBeTruthy()
    expect(screen.getAllByText(/geplant|planned/i).length).toBeGreaterThan(0)
  })

  it('links the deadlines card to the deadline page as an available module', async () => {
    renderHome()

    const deadlines = await screen.findByRole('link', { name: /Fristen|Deadlines/ })

    expect(deadlines.getAttribute('href')).toBe('/admin/deadlines')
    expect(deadlines.closest('li')?.textContent).not.toMatch(/geplant|planned/)
  })

  it('links the appearance page as an available module', async () => {
    renderHome()

    const branding = await screen.findByRole('link', { name: /Darstellung|Appearance/ })

    expect(branding.getAttribute('href')).toBe('/admin/branding')
    expect(branding.closest('li')?.textContent).not.toMatch(/geplant|planned/)
  })
})
