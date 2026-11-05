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

  it('marks the groups module as available and deadlines as planned phase 6', async () => {
    renderHome()

    const groupsText = await screen.findByText(/^Gruppen$|^Groups$/i)
    const groups = groupsText.closest('a')
    expect(groups?.getAttribute('href')).toBe('/admin/groups')

    const deadlines = await screen.findByText(/^Fristen$|^Deadlines$/i)
    const card = deadlines.closest('li')
    expect(card?.textContent).toMatch(/Phase 6/)
    expect(card?.textContent).not.toMatch(/Phase 1\b/)
  })
})
