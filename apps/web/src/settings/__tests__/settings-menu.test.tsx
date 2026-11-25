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
    items: [
      { key: 'users', path: '/admin/users', icon: 'users', label: 'Benutzer', description: 'Benutzer, Rollen und Gruppen' },
      { key: 'channels', path: '/admin/channels', icon: 'radio', label: 'Kanäle', description: 'Kanäle, Zustellung, Mailbox' },
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

    expect(screen.getByText('Mein Bereich')).toBeTruthy()
    expect(screen.getByText('Meine Einstellungen')).toBeTruthy()
    expect(screen.getByText('Name, Sprache, Thema und Passwort')).toBeTruthy()
    expect(screen.getByText('Verwaltung')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    for (const label of ['Benutzer', 'Kanäle']) {
      const entry = screen.getByText(label)
      const row = entry.closest('li')?.querySelector('svg')
      expect(row).not.toBeNull()
      expect(row?.getAttribute('aria-hidden')).toBe('true')
      // The symbol keeps its distance to the text (WP-M29-10).
      expect(row?.getAttribute('class')).toContain('h-5')
      expect(entry.closest('a')?.getAttribute('class')).toContain('gap-3')
    }

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/settings/me', '/admin/users', '/admin/channels']),
    )
  })

  it('filters by label and description', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    const input = screen.getByLabelText('Einstellungen suchen')
    fireEvent.input(input, { target: { value: 'Kanäle' } })

    expect(screen.getByText('Kanäle')).toBeTruthy()
    expect(screen.queryByText('Meine Einstellungen')).toBeNull()
    // „Benachrichtigungen“ passt selbst über seine Beschreibung auf „Kanäle“,
    // deshalb bleibt der Abschnitt sichtbar.
    expect(screen.getByText('Mein Bereich')).toBeTruthy()

    fireEvent.input(input, { target: { value: 'Rollen' } })
    expect(screen.getByText('Benutzer')).toBeTruthy()
    expect(screen.queryByText('Kanäle')).toBeNull()
    expect(screen.queryByText('Mein Bereich')).toBeNull()

    fireEvent.input(input, { target: { value: 'nichts davon' } })
    expect(screen.getByText('Keine Einstellung gefunden.')).toBeTruthy()
  })

  it('keeps every section visible', async () => {
    renderMenu()

    // Kein Abschnitt klappt zu: die Abschnitte stehen als Überschrift da und
    // ihre Einträge stehen darunter — die Suche filtert, nicht ein Aufklappen.
    expect(screen.getByRole('heading', { level: 2, name: 'Mein Bereich' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Verwaltung' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Benutzer')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())
  })
})
