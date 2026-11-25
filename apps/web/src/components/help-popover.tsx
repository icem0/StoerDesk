import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from './icon'

/**
 * The explanation of a place (`specs/13-ui.md` §14.13, ADR-0060).
 *
 * One mechanism carries every explanation of the interface: a button with the
 * info symbol that opens a panel beside the place. The panel is **not** a
 * hover: a `title=` tooltip does not exist on a touch, cannot be opened by a
 * keyboard, cannot be zoomed and closes on a timer — the app is a mobile-first
 * PWA (§14.2). The panel therefore lives in the DOM and opens with a tap, with
 * a mouse and with the keyboard.
 *
 * The panel hangs in the body of the document (`position: fixed`, the pattern of
 * `row-menu.tsx`), so neither a sticky header nor a scroll container clips it;
 * it opens upwards when there is no room below the trigger and follows the
 * trigger while the page scrolls. It closes on a second click, on a click
 * beside it and on `Escape` — **never on a timer**.
 *
 * The trigger is at least 44 px high and paints the accent focus ring; the
 * text of the panel is one step above the meta text of the surface, so the
 * explanation is readable without a zoom.
 */

export interface HelpPopoverProps {
  /** The explanation itself — the caller hands over the translated text. */
  text: string
  /** The accessible name of the trigger; the default names the symbol. */
  label?: string
  /** The classes of the trigger, so the row that carries it keeps its look. */
  className?: string
}

const panelWidth = 320
const gap = 8
const margin = 8

type PanelPosition = { left: number; top: number } | { left: number; bottom: number }

export function HelpPopover({ text, label, className }: HelpPopoverProps) {
  const { t } = useTranslation('help')
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const panelId = useId()

  /** Places the panel beside the trigger — downwards, upwards when there is no room. */
  const place = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect()

    if (box === undefined) {
      setOpen(false)

      return
    }

    const width = Math.min(panelWidth, window.innerWidth - margin * 2)
    const left = Math.max(margin, Math.min(box.left, window.innerWidth - width - margin))
    const height = panel.current?.offsetHeight ?? 160
    const room = window.innerHeight - box.bottom
    const next: PanelPosition =
      room < height + gap
        ? { left, bottom: window.innerHeight - box.top + gap }
        : { left, top: box.bottom + gap }

    setPosition((current) =>
      current !== null &&
      'top' in current === 'top' in next &&
      current.left === next.left &&
      ('top' in current ? current.top : current.bottom) ===
        ('top' in next ? next.top : next.bottom)
        ? current
        : next,
    )
  }, [])

  function toggle() {
    if (open) {
      setOpen(false)

      return
    }

    place()
    setOpen(true)
  }

  // The panel knows its own height only after it was rendered — the second
  // placement flips it above the trigger when it does not fit below.
  useLayoutEffect(() => {
    if (open) {
      place()
    }
  }, [open, place, text])

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnClickBeside(event: MouseEvent) {
      const target = event.target as Node
      const insideTrigger = trigger.current?.contains(target) === true
      const insidePanel = panel.current?.contains(target) === true

      if (!insideTrigger && !insidePanel) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
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
    <>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? t('triggerOpen') : (label ?? t('trigger'))}
        className={
          className ??
          'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400'
        }
        id={triggerId}
        onClick={toggle}
        ref={trigger}
        type="button"
      >
        <Icon name="info" className="h-5 w-5" />
      </button>
      {open && position !== null
        ? createPortal(
            <div
              aria-labelledby={triggerId}
              className="fixed z-50 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-slate-200 shadow-xl"
              id={panelId}
              ref={panel}
              role="note"
              style={
                'top' in position
                  ? { left: position.left, top: position.top, width: Math.min(panelWidth, window.innerWidth - margin * 2) }
                  : { bottom: position.bottom, left: position.left, width: Math.min(panelWidth, window.innerWidth - margin * 2) }
              }
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
