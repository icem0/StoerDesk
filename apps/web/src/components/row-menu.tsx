import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The menu of the actions of a row (`specs/13-ui.md` §14.8, ADR-0043).
 *
 * Every list of the administration that names an entry shows one name and one
 * `…` button; the button opens the actions of that row (edit, archive, delete
 * …). The menu is beside the button and does not change the height of the row.
 * It closes on a click beside it, on `Escape` and after an action was chosen.
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
  /** A blocked action keeps its reason in its tooltip. */
  disabled?: boolean
  title?: string
}

export function RowMenu({ items, label }: { items: RowMenuItem[]; label?: string }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnClickBeside(event: MouseEvent) {
      if (container.current !== null && !container.current.contains(event.target as Node)) {
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

    return () => {
      document.removeEventListener('mousedown', closeOnClickBeside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label ?? t('rowMenu.label')}
        className="min-h-11 min-w-11 rounded border border-slate-600 px-2 text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {t('rowMenu.glyph')}
      </button>
      {open ? (
        <div
          className="absolute right-0 z-30 mt-1 flex min-w-44 flex-col rounded border border-slate-700 bg-slate-900 py-1 shadow-lg"
          role="menu"
        >
          {items.map((item) => (
            <button
              className={
                item.tone === 'danger'
                  ? 'px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40 disabled:opacity-40'
                  : 'px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40'
              }
              disabled={item.disabled === true}
              key={item.key}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              role="menuitem"
              title={item.title}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
