import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Icon, type IconName } from '../icon'

const NAMES: IconName[] = [
  'user',
  'users',
  'group',
  'bell',
  'palette',
  'monitor',
  'package',
  'qr-code',
  'shield',
  'tag',
  'file-text',
  'alert-triangle',
  'alert-circle',
  'trending-up',
  'sliders',
  'calendar',
  'refresh-cw',
  'radio',
  'mail',
  'key',
  'link',
  'log-out',
  'search',
  'chevron-down',
  'arrow-left',
  'settings',
  'home',
  'plus',
  'ticket',
  'bar-chart',
]

describe('Icon', () => {
  it.each(NAMES)('renders %s as an aria-hidden svg', (name: IconName) => {
    const { container } = render(<Icon name={name} className="h-6 w-6" />)
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('stroke')).toBe('currentColor')
    expect(svg?.getAttribute('stroke-width')).toBe('1.8')
    expect(svg?.getAttribute('class')).toContain('h-6')
    expect(svg?.getAttribute('class')).toContain('w-6')
  })
})
