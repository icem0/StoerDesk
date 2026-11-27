import { type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'

import { HelpPopover } from '../components/help-popover'
import { Icon, type IconName } from '../components/icon'

export interface SettingsMenuItem {
  key: string
  path?: string
  icon?: IconName
  label: string
  /** The explanation — it opens in the panel of the ⓘ of the entry. */
  helpText?: string
  onClick?: () => void
}

export interface SettingsMenuSection {
  key: string
  label: string
  icon?: IconName
  items: SettingsMenuItem[]
}

interface SettingsMenuProps {
  sections: SettingsMenuSection[]
}

/**
 * The one-column menu of the settings (WP-M29-03, specs/13-ui.md §14.10).
 * Every entry wears its symbol and **its name** — nothing else; a search
 * field filters the name and the explanation of the entry; **every section is
 * always visible** — no section folds away, so every path of the administration
 * stands there without a second click. The search field is what makes the long
 * list manageable. The component renders nothing a search term hides.
 *
 * The explanation of an entry opens in the **panel of its ⓘ**
 * (`specs/13-ui.md` §14.13, ADR-0060): the entry is a **row**, not a link
 * that wraps the button — a `<button>` inside an `<a>` is invalid markup and
 * unreachable for a screen reader. The menu shows **only the name**: the
 * description under the name is gone, so the name can be bigger and the list
 * stays scannable. The search still matches the text of the panel — an
 * explanation the user cannot see is no explanation for the search.
 */
export function SettingsMenu({ sections }: SettingsMenuProps) {
  const { t } = useTranslation('common')
  const [query, setQuery] = useState('')

  const visible = (item: SettingsMenuItem): boolean => {
    const text = `${item.label} ${item.helpText ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
  }

  const visibleSections = sections.map((section) => ({
    ...section,
    items: section.items.filter(visible),
  }))
  const hasResult = visibleSections.some((section) => section.items.length > 0)

  const itemClass = (isActive: boolean): string =>
    `flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
      isActive
        ? 'border-accent-500/40 bg-accent-600/10'
        : 'border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/60'
    }`

  if (!hasResult) {
    return (
      <section className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm text-slate-300">{t('app.settings.empty')}</p>
      </section>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-300" htmlFor="settings-search">
          {t('app.settings.searchLabel')}
        </label>
        <input
          id="settings-search"
          className="min-h-11 rounded border border-slate-700 bg-slate-900/60 px-4 text-sm text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          placeholder={t('app.settings.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {visibleSections.map((section) => {
        const items = section.items
        if (items.length === 0) {
          return null
        }

        const heading = (
          <>
            {section.icon && (
              <Icon name={section.icon} className="h-5 w-5 shrink-0" />
            )}
            {section.label}
          </>
        )

        return (
          <section key={section.key} className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-300">
              {heading}
            </h2>
            <ul className="grid gap-2">
              {items.map((item) => (
                <li key={item.key}>
                  <SettingsMenuEntry item={item} itemClass={itemClass} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

interface SettingsMenuEntryProps {
  item: SettingsMenuItem
  itemClass: (isActive: boolean) => string
}

/**
 * The entry of the menu is a **row**: the name carries the link and the ⓘ
 * sits beside it as a sibling (`specs/13-ui.md` §14.13, ADR-0060). The button
 * of the panel may not live inside the link — a `<button>` inside an `<a>` is
 * invalid markup and a screen reader never reaches it.
 *
 * The entry shows **the name only** — the office asked for prägnante Namen
 * („keine zusätzlichen Infos“). Because the line is short now, the name is
 * bigger than the text of the rest of the interface.
 */
function SettingsMenuEntry({ item, itemClass }: SettingsMenuEntryProps): ReactElement {
  const location = useLocation()
  const { t } = useTranslation('common')
  const active = item.path !== undefined && location.pathname.startsWith(item.path)

  const linkClass = `flex min-h-11 flex-1 items-center gap-3 rounded-lg px-2 text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
    active ? 'text-accent-300' : 'text-slate-100'
  }`

  const content = (
    <>
      {item.icon && <Icon name={item.icon} className="h-6 w-6 shrink-0" />}
      <span className="leading-tight truncate">{item.label}</span>
    </>
  )

  return (
    <div className={itemClass(active)}>
      {item.path ? (
        <NavLink className={linkClass} key={item.key} to={item.path} onClick={item.onClick}>
          {content}
        </NavLink>
      ) : (
        <button className={linkClass} type="button" onClick={item.onClick}>
          {content}
        </button>
      )}
      {item.helpText ? (
        <HelpPopover
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          label={t('help:triggerFor', { name: item.label })}
          text={item.helpText}
        />
      ) : null}
    </div>
  )
}
