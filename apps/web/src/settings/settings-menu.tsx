import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { Icon, type IconName } from '../components/icon'

interface SettingsMenuItem {
  key: string
  path?: string
  icon?: IconName
  label: string
  description?: string
  onClick?: () => void
}

interface SettingsMenuSection {
  key: string
  label: string
  icon?: IconName
  collapsible?: boolean
  items: SettingsMenuItem[]
}

interface SettingsMenuProps {
  sections: SettingsMenuSection[]
}

/**
 * The one-column menu of the settings (WP-M29-03, specs/13-ui.md §14.10).
 * Every entry wears its symbol, its label and a short description; a search
 * field filters label and description; collapsible sections stay open while
 * the page stays short. The component renders nothing a search term hides.
 */
export function SettingsMenu({ sections }: SettingsMenuProps) {
  const { t } = useTranslation('common')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const visible = (item: SettingsMenuItem): boolean => {
    const text = `${item.label} ${item.description ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
  }

  const visibleSections = sections.map((section) => ({
    ...section,
    items: section.items.filter(visible),
  }))
  const hasResult = visibleSections.some((section) => section.items.length > 0)

  const toggle = (key: string): void => {
    const next = new Set(open)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setOpen(next)
  }

  const itemClass = (isActive: boolean): string =>
    `flex min-h-11 items-center rounded-xl border px-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
      isActive
        ? 'border-accent-500/40 bg-accent-600/10 text-accent-300'
        : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:bg-slate-800/60'
    }`

  if (!hasResult) {
    return (
      <section className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm text-slate-500">{t('app.settings.empty')}</p>
      </section>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="settings-search">
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
            {t(`app.settingsGroups.${section.key}`)}
          </>
        )

        if (section.collapsible) {
          const isOpen = open.has(section.key)
          return (
            <details
              key={section.key}
              className="flex flex-col gap-1"
              open={isOpen}
              onToggle={() => toggle(section.key)}
            >
              <summary
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 list-none"
              >
                {heading}
              </summary>
              {isOpen && (
                <ul className="grid gap-2">
                  {items.map((item) => (
                    <li key={item.key}>
                      <SettingsMenuEntry item={item} itemClass={itemClass} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        }

        return (
          <section key={section.key} className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
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

function SettingsMenuEntry({ item, itemClass }: SettingsMenuEntryProps): JSX.Element {
  const renderContent = (): JSX.Element => (
    <>
      {item.icon && <Icon name={item.icon} className="h-5 w-5 shrink-0" />}
      <div className="min-w-0">
        <p className="leading-none truncate">{item.label}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-slate-500 leading-none truncate">
            {item.description}
          </p>
        )}
      </div>
    </>
  )

  if (item.path) {
    return (
      <NavLink
        className={({ isActive }) => itemClass(isActive)}
        key={item.key}
        to={item.path}
        onClick={item.onClick}
      >
        {renderContent()}
      </NavLink>
    )
  }

  return (
    <button
      className={itemClass(false)}
      type="button"
      onClick={item.onClick}
    >
      {renderContent()}
    </button>
  )
}
