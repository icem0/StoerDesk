import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { SettingsMenu, type SettingsMenuSection } from '../settings-menu'

const sections = [
  {
    key: 'personal',
    label: 'Mein Bereich',
    items: [
      { key: 'mySettings', path: '/settings/me', icon: 'user', label: 'Meine Einstellungen', description: 'Name, Sprache, Thema und Passwort' },
      { key: 'notifications', path: '/settings/notifications', icon: 'bell', label: 'Benachrichtigungen', description: 'Kanäle, die dich erreichen' },
    ],
  },
  {
    key: 'administration',
    label: 'Verwaltung',
    collapsible: true,
    items: [
      { key: 'access', path: '/admin/access', icon: 'users', label: 'Benutzer & Rechte', description: 'Benutzer, Rollen und Gruppen' },
      { key: 'messaging', path: '/admin/messaging', icon: 'radio', label: 'Kanäle & Versand', description: 'Kanäle, Zustellung, Mailbox' },
    ],
  },
] satisfies SettingsMenuSection[]

function renderMenu() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <SettingsMenu sections={sections} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('SettingsMenu', () => {
  it('renders every entry with its symbol, its label and its description', async () => {
    renderMenu()
    fireEvent.click(screen.getByText('Verwaltung'))

    expect(screen.getByText('Mein Bereich')).toBeTruthy()
    expect(screen.getByText('Meine Einstellungen')).toBeTruthy()
    expect(screen.getByText('Name, Sprache, Thema und Passwort')).toBeTruthy()
    expect(screen.getByText('Verwaltung')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Kanäle & Versand')).toBeTruthy())

    for (const label of ['Benutzer & Rechte', 'Kanäle & Versand']) {
      const entry = screen.getByText(label)
      const row = entry.closest('li')?.querySelector('svg')
      expect(row).not.toBeNull()
      expect(row?.getAttribute('aria-hidden')).toBe('true')
    }

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/settings/me', '/admin/access', '/admin/messaging']),
    )
  })

  it('filters by label and description', async () => {
    renderMenu()
    fireEvent.click(screen.getByText('Verwaltung'))
    await waitFor(() => expect(screen.getByText('Kanäle & Versand')).toBeTruthy())

    const input = screen.getByLabelText('Einstellungen suchen')
    fireEvent.input(input, { target: { value: 'Kanäle' } })

    expect(screen.getByText('Kanäle & Versand')).toBeTruthy()
    expect(screen.queryByText('Meine Einstellungen')).toBeNull()
    // „Benachrichtigungen“ passt selbst über seine Beschreibung auf „Kanäle“,
    // deshalb bleibt der Abschnitt sichtbar.
    expect(screen.getByText('Mein Bereich')).toBeTruthy()

    fireEvent.input(input, { target: { value: 'Rollen' } })
    expect(screen.getByText('Benutzer & Rechte')).toBeTruthy()
    expect(screen.queryByText('Kanäle & Versand')).toBeNull()
    expect(screen.queryByText('Mein Bereich')).toBeNull()

    fireEvent.input(input, { target: { value: 'nichts davon' } })
    expect(screen.getByText('Keine Einstellung gefunden.')).toBeTruthy()
  })

  it('opens and closes the collapsible sections', async () => {
    renderMenu()

    // Geschlossen zum Start: die Einträge sind noch nicht im DOM.
    expect(screen.queryByText('Benutzer & Rechte')).toBeNull()

    fireEvent.click(screen.getByText('Verwaltung'))
    await waitFor(() => expect(screen.getByText('Benutzer & Rechte')).toBeTruthy())

    fireEvent.click(screen.getByText('Verwaltung'))
    await waitFor(() => expect(screen.queryByText('Benutzer & Rechte')).toBeNull())
  })
})
