import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/**
 * The menu of the actions of a row (`specs/13-ui.md` §14.8, ADR-0043).
 *
 * Every list of the administration that names an entry shows one name and one
 * `…` button; the button opens the actions of that row (edit, archive, delete
 * …). The menu is beside the button and does not change the height of the row.
 * It closes on a click beside it, on `Escape` and after an action was chosen.
 *
 * The menu hangs in the body of the document and positions itself over the
 * button (`position: fixed`): a table in a scroll container clips an absolutely
 * positioned menu — the menu of the last row of a list would be cut off. The
 * menu opens upwards when there is no room below the button and follows the
 * button while the page scrolls.
 */

export interface RowMenuItem {
  /** The stable key of the action inside the menu. */
  key: string
  /** The label of the action in the language of the interface. */
  label: string
  /** What the action does. */
  onSelect: () => void
  /** A destructive action wears the rose of the interface. */
  tone?: 'default' | 'danger'
  /** A blocked action names its reason in the panel of the menu (§14.13). */
  disabled?: boolean
  reason?: string
}

const menuWidth = 176
const itemHeight = 40

type MenuPosition = { left: number; top: number } | { left: number; bottom: number }

export function RowMenu({ items, label }: { items: RowMenuItem[]; label?: string }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  /** Places the menu over the button — downwards, upwards when there is no room. */
  const place = useCallback(() => {
    const box = button.current?.getBoundingClientRect()

    if (box === undefined) {
      setOpen(false)

      return
    }

    const room = window.innerHeight - box.bottom
    const height = items.length * itemHeight + 8
    const left = Math.max(8, Math.min(box.right - menuWidth, window.innerWidth - menuWidth - 8))
    const next: MenuPosition =
      room < height
        ? { left, bottom: window.innerHeight - box.top + 4 }
        : { left, top: box.bottom + 4 }

    setPosition((current) =>
      current !== null &&
      'top' in current === 'top' in next &&
      current.left === next.left &&
      ('top' in current ? current.top : current.bottom) === ('top' in next ? next.top : next.bottom)
        ? current
        : next,
    )
  }, [items.length])

  function toggle() {
    if (open) {
      setOpen(false)

      return
    }

    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnClickBeside(event: MouseEvent) {
      const target = event.target as Node
      const insideButton = button.current?.contains(target) === true
      const insideMenu = menu.current?.contains(target) === true

      if (!insideButton && !insideMenu) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnClickBeside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)

    return () => {
      document.removeEventListener('mousedown', closeOnClickBeside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <div className="relative inline-block">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label ?? t('rowMenu.label')}
        className="min-h-11 min-w-11 rounded border border-slate-600 px-2 text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        onClick={toggle}
        ref={button}
        type="button"
      >
        {t('rowMenu.glyph')}
      </button>
      {open && position !== null
        ? createPortal(
            <div
              className="fixed z-50 flex flex-col rounded border border-slate-700 bg-slate-900 py-1 shadow-lg"
              ref={menu}
              role="menu"
              style={
                'top' in position
                  ? { left: position.left, top: position.top, width: menuWidth }
                  : { bottom: position.bottom, left: position.left, width: menuWidth }
              }
            >
              {items.map((item) => (
                <div className="flex flex-col gap-1 items-start" key={item.key}>
                  <button
                    className={`w-full rounded px-3 py-2 text-left text-sm ${
                      item.tone === 'danger'
                        ? 'text-rose-300 hover:bg-rose-950/40 disabled:opacity-40'
                        : 'text-slate-200 hover:bg-slate-800 disabled:opacity-40'
                    }`}
                    disabled={item.disabled === true}
                    onClick={() => {
                      setOpen(false)
                      item.onSelect()
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {item.label}
                  </button>
                  {item.reason !== undefined && item.reason !== '' ? (
                    <span className="text-xs text-slate-400">{item.reason}</span>
                  ) : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
