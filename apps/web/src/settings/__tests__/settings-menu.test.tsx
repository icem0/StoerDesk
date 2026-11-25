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
      {
        key: 'mySettings',
        path: '/settings/me',
        icon: 'user',
        label: 'Meine Einstellungen',
        helpText: 'Dein eigener Name, die Sprache der Oberfläche und dein Passwort.',
      },
      {
        key: 'notifications',
        path: '/settings/notifications',
        icon: 'bell',
        label: 'Benachrichtigungen',
        helpText: 'Hier stehen die Kanäle, über die das System dich erreicht.',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Verwaltung',
    items: [
      {
        key: 'users',
        path: '/admin/users',
        icon: 'users',
        label: 'Benutzer',
        helpText: 'Die Benutzer der Installation mit ihren Rollen und Gruppen.',
      },
      {
        key: 'channels',
        path: '/admin/channels',
        icon: 'radio',
        label: 'Kanäle',
        helpText: 'Die Meldekanäle der Installation mit ihren Zugangsdaten.',
      },
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

/** The ⓘ of the entry with that name — it sits beside the link of the entry. */
function triggerOf(label: string): HTMLElement {
  const card = screen.getByText(label).closest('a')?.parentElement
  const trigger = card?.querySelector('button')

  if (trigger === null || trigger === undefined) {
    throw new Error(`the entry ${label} carries no ⓘ`)
  }

  return trigger
}

describe('SettingsMenu', () => {
  it('renders every entry with its symbol and its name', async () => {
    renderMenu()

    expect(screen.getByText('Mein Bereich')).toBeTruthy()
    expect(screen.getByText('Meine Einstellungen')).toBeTruthy()
    expect(screen.getByText('Verwaltung')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    for (const label of ['Benutzer', 'Kanäle']) {
      const entry = screen.getByText(label)
      const row = entry.closest('li')?.querySelector('svg')
      expect(row).not.toBeNull()
      expect(row?.getAttribute('aria-hidden')).toBe('true')
      // The symbol keeps its distance to the text (WP-M29-10).
      expect(row?.getAttribute('class')).toContain('h-6')
      expect(entry.closest('a')?.getAttribute('class')).toContain('gap-3')
    }

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/settings/me', '/admin/users', '/admin/channels']),
    )
  })

  it('shows the name alone — no description under it', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    // The office asked for prägnante Namen: the description under the name is
    // gone, the explanation opens in the panel of the ⓘ.
    expect(screen.queryByText('Kanäle, Zustellung, Mailbox')).toBeNull()
    expect(screen.queryByText('Dein eigener Name, die Sprache der Oberfläche und dein Passwort.')).toBeNull()
  })

  it('makes the name bigger than the text of the rest of the interface', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    expect(screen.getByText('Kanäle').closest('a')?.getAttribute('class')).toContain('text-base')
  })

  it('opens the explanation of an entry in the panel of its ⓘ', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    expect(screen.queryByRole('note')).toBeNull()

    fireEvent.click(triggerOf('Kanäle'))

    expect(screen.getByRole('note').textContent).toContain(
      'Die Meldekanäle der Installation mit ihren Zugangsdaten.',
    )
  })

  it('names the ⓘ after the entry, so the list of them is readable', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    expect(
      screen.getByRole('button', { name: 'Erklärung zu Kanäle' }),
    ).toBeTruthy()
  })

  it('keeps the button of the panel beside the link, never inside it', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    expect(triggerOf('Kanäle').closest('a')).toBeNull()
  })

  it('filters by the name and by the explanation of the entry', async () => {
    renderMenu()
    await waitFor(() => expect(screen.getByText('Kanäle')).toBeTruthy())

    const input = screen.getByLabelText('Einstellungen suchen')
    fireEvent.input(input, { target: { value: 'Kanäle' } })

    expect(screen.getByText('Kanäle')).toBeTruthy()
    expect(screen.queryByText('Meine Einstellungen')).toBeNull()
    // „Benachrichtigungen“ passt selbst über seine Erklärung auf „Kanäle“,
    // deshalb bleibt der Abschnitt sichtbar.
    expect(screen.getByText('Mein Bereich')).toBeTruthy()

    fireEvent.input(input, { target: { value: 'Rollen' } })
    expect(screen.getByText('Benutzer')).toBeTruthy()
    expect(screen.queryByText('Kanäle')).toBeNull()
    expect(screen.queryByText('Mein Bereich')).toBeNull()

    // Ein Suchbegriff, der nur im Text der Erklärung steht, findet den Eintrag.
    fireEvent.input(input, { target: { value: 'Zugangsdaten' } })
    expect(screen.getByText('Kanäle')).toBeTruthy()
    expect(screen.queryByText('Benutzer')).toBeNull()

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
