import { describe, expect, it } from 'vitest'

import { languageRecord, languagesOf, localizedName } from '../localized-name'

/**
 * The name of an entry in the language of the interface
 * (`specs/13-ui.md` §14.8, ADR-0043).
 */

describe('localizedName', () => {
  it('answers the name of the given language', () => {
    expect(localizedName({ de: 'Rauchmelder', en: 'Smoke detector' }, 'en', 'key')).toBe(
      'Smoke detector',
    )
    expect(localizedName({ de: 'Rauchmelder', en: 'Smoke detector' }, 'de', 'key')).toBe(
      'Rauchmelder',
    )
  })

  it('falls back to German and then to the key', () => {
    expect(localizedName({ de: 'Rauchmelder' }, 'en', 'key')).toBe('Rauchmelder')
    expect(localizedName({}, 'en', 'key')).toBe('key')
    expect(localizedName({ de: '  ' }, 'en', 'key')).toBe('key')
  })
})

describe('languageRecord', () => {
  it('turns the flat answer of the API into the record of the languages', () => {
    expect(languageRecord({ de: 'Rauchmelder', en: 'Smoke detector' })).toEqual({
      de: 'Rauchmelder',
      en: 'Smoke detector',
    })
  })

  it('drops an empty text — it is no language', () => {
    expect(languageRecord({ de: 'Rauchmelder', en: '' })).toEqual({ de: 'Rauchmelder' })
  })
})

describe('languagesOf', () => {
  it('names German first and the rest in alphabetical order', () => {
    expect(languagesOf({ fr: 'Détecteur', de: 'Rauchmelder', en: 'Smoke detector' })).toEqual([
      'de',
      'en',
      'fr',
    ])
  })
})
