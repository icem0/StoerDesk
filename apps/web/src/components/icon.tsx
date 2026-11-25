import { type ReactNode } from 'react'

/**
 * The symbols of the surface (WP-M29-02): one shared component for every icon
 * of the interface. The repo keeps its hand-written inline SVGs (the gear of
 * the settings link, the bell of the inbox) instead of a dependency — every
 * symbol is `aria-hidden`, paints `currentColor` and keeps the feather stroke
 * of the house (`strokeWidth="1.8"`, round joins). The text beside a symbol
 * carries the accessible name.
 */
export type IconName =
  | 'user'
  | 'users'
  | 'group'
  | 'bell'
  | 'palette'
  | 'monitor'
  | 'package'
  | 'qr-code'
  | 'shield'
  | 'tag'
  | 'file-text'
  | 'alert-triangle'
  | 'alert-circle'
  | 'trending-up'
  | 'sliders'
  | 'calendar'
  | 'refresh-cw'
  | 'radio'
  | 'mail'
  | 'key'
  | 'link'
  | 'log-out'
  | 'search'
  | 'chevron-down'
  | 'clock'
  | 'printer'
  | 'arrow-left'
  | 'settings'
  | 'home'
  | 'plus'
  | 'ticket'
  | 'bar-chart'

const ICONS: Record<IconName, ReactNode> = {
  user: [
    <circle cx="12" cy="8" r="7" key="c" />,
    <path d="M5 21a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" key="p" />,
  ],
  users: [
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" key="a" />,
    <circle cx="9" cy="7" r="4" key="b" />,
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" key="c" />,
    <path d="M16 3.13a4 4 0 0 1 0 7.75" key="d" />,
  ],
  group: [
    <path d="M22 16v-2a6 6 0 0 0-6-6H6a6 6 0 0 0-6 6v2" key="a" />,
    <circle cx="9" cy="7" r="4" key="b" />,
    <path d="M22 9.5V16a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2.5" key="c" />,
  ],
  bell: [
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" key="b" />,
    <path d="M13.73 21a2 2 0 0 1-3.46 0" key="a" />,
  ],
  palette: [
    <circle cx="12" cy="2" r="3" key="a" />,
    <circle cx="19.2" cy="13" r="3" key="b" />,
    <circle cx="4.8" cy="17" r="3" key="c" />,
    <path d="M17 10c1.5-1.5 4-1.5 6 0s1.5 4 0 6l-2 2" key="d" />,
  ],
  monitor: [
    <rect x="2" y="3" width="20" height="14" rx="2" key="r" />,
    <line x1="12" y1="17" x2="12" y2="21" key="a" />,
    <polyline points="8 21 12 17 16 21" key="b" />,
  ],
  package: [
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.29" key="a" />,
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16" key="b" />,
    <polyline points="3.29 7 12 12 20.71 7" key="c" />,
    <line x1="12" y1="17" x2="12" y2="23" key="d" />,
    <line x1="2" y1="23" x2="2" y2="18" key="e" />,
    <line x1="22" y1="18" x2="22" y2="23" key="f" />,
  ],
  'qr-code': [
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" key="a" />,
    <rect x="5" y="5" width="3" height="3" key="b" />,
    <rect x="16" y="5" width="3" height="3" key="c" />,
    <rect x="5" y="16" width="3" height="3" key="d" />,
    <rect x="11" y="11" width="2" height="2" key="e" />,
  ],
  shield: [<path d="M12 2L3 6v2a6 6 0 0 0 6 6v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a6 6 0 0 0 6-6V6z" key="a" />],
  tag: [
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 17.59z" key="a" />,
    <path d="M16.62 14.02a2 2 0 0 1 0 2.83l-2.83 2.83a2 2 0 0 1-2.83 0l-7.17-7.17a2 2 0 0 1 0-2.83l7.17-7.17a2 2 0 0 1 2.83 0l2.83 2.83z" key="b" />,
    <line x1="7" y1="7" x2="8.5" y2="8.5" key="c" />,
  ],
  'file-text': [
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" key="a" />,
    <polyline points="13 2 13 9 20 9" key="b" />,
    <line x1="16" y1="13" x2="8" y2="13" key="c" />,
    <line x1="16" y1="17" x2="9" y2="17" key="d" />,
    <line x1="10" y1="21" x2="15" y2="21" key="e" />,
  ],
  'alert-triangle': [
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0" key="a" />,
    <line x1="12" y1="9" x2="12" y2="12" key="b" />,
    <line x1="12" y1="17" x2="12" y2="17" key="c" />,
  ],
  'alert-circle': [
    <circle cx="12" cy="12" r="10" key="a" />,
    <line x1="12" y1="8" x2="12" y2="12" key="b" />,
    <line x1="12" y1="16" x2="12.01" y2="16" key="c" />,
  ],
  'trending-up': [
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" key="a" />,
    <polyline points="17 6 23 6 23 12" key="b" />,
  ],
  sliders: [
    <line x1="1" y1="10" x2="3" y2="10" key="a" />,
    <line x1="7" y1="10" x2="9" y2="10" key="b" />,
    <line x1="16" y1="10" x2="20" y2="10" key="c" />,
    <line x1="1" y1="14" x2="3" y2="14" key="d" />,
    <line x1="7" y1="14" x2="13" y2="14" key="e" />,
    <line x1="16" y1="14" x2="20" y2="14" key="f" />,
    <line x1="21" y1="4" x2="21" y2="8" key="g" />,
    <line x1="21" y1="12" x2="21" y2="16" key="h" />,
  ],
  calendar: [
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" key="a" />,
    <line x1="16" y1="2" x2="16" y2="6" key="b" />,
    <line x1="8" y1="2" x2="8" y2="6" key="c" />,
    <line x1="3" y1="10" x2="21" y2="10" key="d" />,
  ],
  'refresh-cw': [
    <path d="M1 4v4a1 1 0 0 0 1 1h4" key="a" />,
    <path d="M23 20v-4a1 1 0 0 0-1-1h-4" key="b" />,
    <polyline points="3.5 4.5 1 4 3.5 3.5" key="c" />,
    <polyline points="20.5 19.5 23 20 20.5 20.5" key="d" />,
    <polyline points="3.5 15.5 1 15 3.5 14.5" key="e" />,
    <polyline points="20.5 8.5 23 9 20.5 9.5" key="f" />,
  ],
  radio: [
    <circle cx="12" cy="2" r="1" key="a" />,
    <circle cx="12" cy="5" r="1" key="b" />,
    <circle cx="12" cy="8" r="1" key="c" />,
    <circle cx="12" cy="11" r="1" key="d" />,
    <circle cx="12" cy="14" r="1" key="e" />,
    <circle cx="12" cy="17" r="1" key="f" />,
    <circle cx="12" cy="20" r="1" key="g" />,
    <circle cx="12" cy="23" r="1" key="h" />,
  ],
  mail: [
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2" key="a" />,
    <polyline points="22,6 12,13 2,6" key="b" />,
  ],
  key: [
    <path d="M21 2l-2 2" key="a" />,
    <path d="M7.7 7.7a10 10 0 0 1 0 14.1l-4.1 4.1c-1.9 1.9-4.5 2.8-6.6 1.4l-1.1-1.1c-1.4-1.4-0.5-4.7 1.4-6.6l4.1-4.1a10 10 0 0 1 14.1 0l2 2" key="b" />,
    <line x1="15" y1="9" x2="21" y2="15" key="c" />,
  ],
  link: [
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" key="a" />,
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" key="b" />,
  ],
  'log-out': [
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" key="a" />,
    <polyline points="16 17 21 12 16 7" key="b" />,
    <line x1="21" y1="12" x2="9" y2="12" key="c" />,
  ],
  search: [
    <circle cx="11" cy="11" r="8" key="a" />,
    <line x1="21" y1="21" x2="16.65" y2="16.65" key="b" />,
  ],
  'chevron-down': [<polyline points="6 9 12 15 18 9" key="a" />],
  clock: [
    <circle cx="12" cy="12" r="9" key="a" />,
    <polyline points="12 7 12 12 15.5 14" key="b" />,
  ],
  printer: [
    <polyline points="6 9 6 2 18 2 18 9" key="a" />,
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" key="b" />,
    <rect x="6" y="14" width="12" height="8" key="c" />,
  ],
  'arrow-left': [
    <line x1="19" y1="12" x2="5" y2="12" key="a" />,
    <polyline points="12 19 5 12 12 5" key="b" />,
  ],
  settings: [
    <circle cx="12" cy="12" r="3" key="a" />,
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2 2 2 2 0 0 1 2-2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" key="b" />,
  ],
  home: [
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" key="a" />,
    <polyline points="9 22 9 12 15 12 15 22" key="b" />,
  ],
  plus: [<line x1="12" y1="5" x2="12" y2="19" key="a" />, <line x1="5" y1="12" x2="19" y2="12" key="b" />],
  ticket: [
    <path d="M2 11.27l3.72-2.57a1 1 0 0 1 1.16 0l3.72 2.57a1 1 0 0 0 1.16 0l3.72-2.57a1 1 0 0 1 1.16 0l3.72 2.57a1 1 0 0 0 1.16 0l3.72-2.57a1 1 0 0 1 1.16 0L22 18a1 1 0 0 1-1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" key="a" />,
    <line x1="2" y1="16" x2="22" y2="16" key="b" />,
    <line x1="2" y1="12" x2="22" y2="12" key="c" />,
  ],
  'bar-chart': [
    <line x1="18" y1="20" x2="18" y2="10" key="a" />,
    <line x1="12" y1="20" x2="12" y2="4" key="b" />,
    <line x1="6" y1="20" x2="6" y2="14" key="c" />,
  ],
}

export function Icon({
  name,
  className,
}: {
  name: IconName
  className?: string
}): ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      className={className}
    >
      {ICONS[name]}
    </svg>
  )
}
