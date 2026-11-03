import { describe, expect, it } from 'vitest'

import { bmaAnlageSchema } from '../schemas/bmacloud.js'

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

  it('keeps the unmapped wire fields out of the parsed payload', () => {
    const parsed = bmaAnlageSchema.parse({
      ...anlage,
      gid: 0,
      typ: 4,
      sst: 44,
      ppmail: 'name@kundendomain.de',
      notizen: 'Testnotiz',
    })

    expect(Object.keys(parsed).sort()).toEqual(
      ['aid', 'anlagenort', 'firma', 'nr', 'ort', 'plz', 'status', 'str'].sort(),
    )
  })
})
