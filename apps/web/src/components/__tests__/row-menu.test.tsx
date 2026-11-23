import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../i18n'
import { RowMenu } from '../row-menu'

/**
 * The menu of the actions of a row (`specs/13-ui.md` §14.8, ADR-0043).
 *
 * The menu is the one place where the actions of a row live: it opens with the
 * `…` button, it closes on a click beside it, on `Escape` and after an action
 * was chosen, and a blocked action runs nothing.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

function renderMenu(items: Parameters<typeof RowMenu>[0]['items']) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RowMenu items={items} />
    </I18nextProvider>,
  )
}

describe('RowMenu', () => {
  it('opens the actions of the row with the … button', () => {
    renderMenu([
      { key: 'edit', label: 'Bearbeiten', onSelect: vi.fn() },
      { key: 'delete', label: 'Löschen', onSelect: vi.fn(), tone: 'danger' },
    ])

    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Bearbeiten' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Löschen' })).toBeTruthy()
  })

  it('runs the chosen action and closes the menu', () => {
    const onSelect = vi.fn()

    renderMenu([{ key: 'edit', label: 'Bearbeiten', onSelect }])

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the menu on a click beside it and on Escape', () => {
    renderMenu([{ key: 'edit', label: 'Bearbeiten', onSelect: vi.fn() }])

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('runs nothing when the action is blocked and names the reason', () => {
    const onSelect = vi.fn()

    renderMenu([
      {
        key: 'delete',
        label: 'Löschen',
        onSelect,
        disabled: true,
        title: 'Wird von Vorgängen verwendet',
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    const item = screen.getByRole('menuitem', { name: 'Löschen' }) as HTMLButtonElement

    expect(item.disabled).toBe(true)
    expect(item.getAttribute('title')).toBe('Wird von Vorgängen verwendet')

    fireEvent.click(item)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('hangs in the body of the document, so no scroll container clips it', () => {
    renderMenu([{ key: 'edit', label: 'Bearbeiten', onSelect: vi.fn() }])

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen' }))

    const menu = screen.getByRole('menu')

    expect(menu.parentElement).toBe(document.body)
  })
})
