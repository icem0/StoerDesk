import { describe, expect, it } from 'vitest'

import { t } from '../t'

describe('server t()', () => {
  it('resolves a key from the server bundle', () => {
    expect(t('de', 'sample.greeting')).toBe('Server bereit')
    expect(t('en', 'sample.greeting')).toBe('Server ready')
  })

  it('interpolates {{count}} params', () => {
    expect(t('de', 'sample.items', { count: 3 })).toBe('3 Einträge')
    expect(t('en', 'sample.items', { count: 3 })).toBe('3 items')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(t('en', 'sample.items')).toBe('{{count}} items')
  })

  it('returns the key for unknown keys and falls back to de for unknown locales', () => {
    expect(t('en', 'does.not.exist')).toBe('does.not.exist')
    expect(t('fr', 'sample.greeting')).toBe('Server bereit')
  })
})
