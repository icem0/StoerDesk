import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { HelpPopover } from '../help-popover'

/**
 * The help popover (`specs/13-ui.md` §14.13, ADR-0060).
 *
 * The explanation of a place is a panel that opens beside the place — never a
 * hover: the app is a mobile-first PWA, so a `title=` tooltip would not exist
 * for a finger, for a keyboard or for a screen reader.
 */

function renderPopover(text = 'Die Erklärung der Stelle.', label?: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <HelpPopover label={label} text={text} />
    </I18nextProvider>,
  )
}

describe('HelpPopover', () => {
  it('shows the symbol with the name of the trigger and no panel', () => {
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('opens the panel with the explanation on a click', () => {
    renderPopover('Die Erklärung der Stelle.')

    fireEvent.click(screen.getByRole('button', { name: 'Erklärung anzeigen' }))

    const panel = screen.getByRole('note')

    expect(panel.textContent).toContain('Die Erklärung der Stelle.')
    expect(screen.getByRole('button', { name: 'Erklärung schließen' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('opens the panel with the keyboard and closes it on Escape', () => {
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('note')).toBeNull()
  })

  it('closes the panel on a click beside it', () => {
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'Erklärung anzeigen' }))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('note')).toBeNull()
  })

  it('carries no explanation in a title attribute', () => {
    renderPopover('Die Erklärung der Stelle.')

    const trigger = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    expect(trigger.getAttribute('title')).toBeNull()

    fireEvent.click(trigger)

    expect(screen.getByRole('note').getAttribute('title')).toBeNull()
  })

  it('hangs in the body of the document, so no scroll container clips it', () => {
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'Erklärung anzeigen' }))

    expect(screen.getByRole('note').parentElement).toBe(document.body)
  })

  it('takes the name of the caller', () => {
    renderPopover('Die Erklärung.', 'Was bedeutet das?')

    expect(screen.getByRole('button', { name: 'Was bedeutet das?' })).toBeTruthy()
  })
})
