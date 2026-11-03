import { describe, expect, it } from 'vitest'

import {
  bmaAnlageSchema,
  bmaAnlagentypSchema,
  externalTypeCategory,
} from '../schemas/bmacloud.js'

const anlage = {
  aid: 1,
  nr: '10372_01',
  firma: 'Musterfirma GmbH',
  anlagenort: 'Haus A',
  str: 'Musterweg 1',
  plz: '10115',
  ort: 'Berlin',
  status: 'active',
}

describe('bmaAnlageSchema', () => {
  it('accepts the integer aid of the live wire format and normalises it', () => {
    const parsed = bmaAnlageSchema.parse(anlage)

    expect(parsed.aid).toBe('1')
    expect(parsed.nr).toBe('10372_01')
  })

  it('still accepts a string aid and trims it', () => {
    const parsed = bmaAnlageSchema.parse({ ...anlage, aid: ' aid-1 ' })

    expect(parsed.aid).toBe('aid-1')
  })

  it('rejects a missing, empty or non-integer aid', () => {
    expect(bmaAnlageSchema.safeParse({ ...anlage, aid: undefined }).success).toBe(false)
    expect(bmaAnlageSchema.safeParse({ ...anlage, aid: '' }).success).toBe(false)
    expect(bmaAnlageSchema.safeParse({ ...anlage, aid: 1.5 }).success).toBe(false)
  })

  it('keeps the typ id of the wire payload and drops the other unmapped fields', () => {
    const parsed = bmaAnlageSchema.parse({
      ...anlage,
      gid: 0,
      typ: 4,
      sst: 44,
      ppmail: 'name@kundendomain.de',
      notizen: 'Testnotiz',
    })

    expect(parsed.typ).toBe(4)
    expect(Object.keys(parsed).sort()).toEqual(
      ['aid', 'anlagenort', 'firma', 'nr', 'ort', 'plz', 'status', 'str', 'typ'].sort(),
    )
  })

  it('accepts a missing or null typ as no type', () => {
    expect(bmaAnlageSchema.parse(anlage).typ).toBeUndefined()
    expect(bmaAnlageSchema.parse({ ...anlage, typ: null }).typ).toBeNull()
    expect(bmaAnlageSchema.safeParse({ ...anlage, typ: 'four' }).success).toBe(false)
  })
})

describe('bmaAnlagentypSchema', () => {
  it('parses one reference row of GET /anlagentypen', () => {
    const parsed = bmaAnlagentypSchema.parse({
      typid: 4,
      descr: 'Brandmeldeanlage',
      herstellername: 'Honeywell',
    })

    expect(parsed).toEqual({ typid: 4, descr: 'Brandmeldeanlage', herstellername: 'Honeywell' })
  })

  it('accepts a row without a manufacturer and rejects an id or description gap', () => {
    expect(bmaAnlagentypSchema.parse({ typid: 7, descr: 'RWA' }).herstellername).toBeUndefined()
    expect(bmaAnlagentypSchema.safeParse({ typid: 7, descr: '' }).success).toBe(false)
    expect(bmaAnlagentypSchema.safeParse({ descr: 'RWA' }).success).toBe(false)
  })
})

describe('externalTypeCategory', () => {
  it('classifies the German keywords case-insensitively', () => {
    expect(externalTypeCategory('Brandmeldeanlage')).toBe('BMA')
    expect(externalTypeCategory('BMA 2000')).toBe('BMA')
    expect(externalTypeCategory('Lichtrufsystem')).toBe('LICHTRUF')
    expect(externalTypeCategory('Sprachalarmierungsanlage')).toBe('SPRACHALARM')
    expect(externalTypeCategory('Sprechanlage EG')).toBe('SPRACHALARM')
    expect(externalTypeCategory('RWA')).toBe('RWA')
    expect(externalTypeCategory('rauchabzug')).toBe('RWA')
    expect(externalTypeCategory('Wärmeabzug')).toBe('RWA')
    expect(externalTypeCategory('Druckbelüftung Treppenhaus')).toBe('RWA')
    expect(externalTypeCategory('Einbruchmeldeanlage')).toBe('EMA')
    expect(externalTypeCategory('Überfallmeldeanlage')).toBe('EMA')
  })

  it('reads the manufacturer name as a second source', () => {
    expect(externalTypeCategory('Zentrale', 'BMA GmbH')).toBe('BMA')
    expect(externalTypeCategory(null, 'Honeywell')).toBeNull()
  })

  it('keeps BMA before the generic RWA keywords', () => {
    expect(externalTypeCategory('Brandmeldeanlage mit Rauchmeldern')).toBe('BMA')
  })

  it('answers null instead of guessing SONSTIGE', () => {
    expect(externalTypeCategory('Aufzugsanlage')).toBeNull()
    expect(externalTypeCategory(null)).toBeNull()
    expect(externalTypeCategory('   ')).toBeNull()
    expect(externalTypeCategory(undefined, null)).toBeNull()
  })
})
