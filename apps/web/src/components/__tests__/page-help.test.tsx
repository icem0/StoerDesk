import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { PageHelp } from '../page-help'
import { pageHelpKey } from '../page-help-map'

/**
 * The explanation of the page (`specs/13-ui.md` §14.13, ADR-0060).
 *
 * Every guarded page carries one ⓘ in the shell; a page that explains itself
 * carries none.
 */

function renderAt(pathname: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[pathname]}>
        <PageHelp />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('pageHelpKey', () => {
  it('names the explanation of the page', () => {
    expect(pageHelpKey('/tickets')).toBe('page.tickets')
    expect(pageHelpKey('/stats')).toBe('page.stats')
    expect(pageHelpKey('/settings')).toBe('page.settings')
  })

  it('takes the longest route, so a sub-page inherits its list', () => {
    expect(pageHelpKey('/tickets/create')).toBe('page.ticketsCreate')
    expect(pageHelpKey('/tickets/4711')).toBe('page.tickets')
    expect(pageHelpKey('/admin/users/new')).toBe('page.adminUsers')
  })

  it('gives a page that explains itself no symbol', () => {
    expect(pageHelpKey('/help/web-push')).toBeNull()
    expect(pageHelpKey('/settings/notifications')).toBeNull()
  })

  it('names every explanation of the map in both languages', () => {
    for (const key of [
      'page.tickets',
      'page.ticketsCreate',
      'page.stats',
      'page.oncall',
      'page.notifications',
      'page.settings',
      'page.settingsMe',
      'page.objects',
      'page.objectCreate',
      'page.objectImport',
      'page.stickers',
      'page.adminUsers',
      'page.adminRoles',
      'page.adminGroups',
      'page.adminApiKeys',
      'page.adminEmail',
      'page.adminChannels',
      'page.adminDelivery',
      'page.adminStatuses',
      'page.adminWebhooks',
      'page.adminBmaSync',
      'page.adminDeadlines',
      'page.adminEscalation',
      'page.adminDefaults',
      'page.adminDetectedErrors',
      'page.adminOncall',
      'page.adminTextTemplates',
      'page.adminBranding',
      'page.adminStickerTemplate',
      'page.adminDashboard',
      'page.adminUpdate',
    ]) {
      expect(i18n.t(key, { ns: 'help' })).not.toBe(key)
    }
  })
})

describe('PageHelp', () => {
  it('opens the explanation of the page on a click', () => {
    renderAt('/tickets')

    expect(screen.queryByRole('note')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Erklärung anzeigen' }))

    expect(screen.getByRole('note').textContent).toContain('Die Meldungen der Installation.')
  })

  it('renders no symbol on a page that explains itself', () => {
    renderAt('/help/web-push')

    expect(screen.queryByRole('button', { name: 'Erklärung anzeigen' })).toBeNull()
  })
})
