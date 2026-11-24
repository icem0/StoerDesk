import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STICKER_TEMPLATE,
  STICKER_TEMPLATE_PRESETS,
  stickerGeometryOverflow,
  stickerPresetKeyOf,
  stickerTemplateSchema,
} from '../schemas/sticker'

/**
 * The contracts of the sticker template (ADR-0050, WP-M27-02): every preset of
 * the catalog fits on its sheet, a geometry that does not fit is named, and the
 * key of the catalog follows the geometry.
 */

describe('the catalog of the sheets', () => {
  it.each(STICKER_TEMPLATE_PRESETS.map((preset) => [preset.key, preset] as const))(
    'the sheet %s fits on its sheet',
    (_key, preset) => {
      expect(stickerGeometryOverflow(preset.geometry)).toEqual([])
    },
  )

  it('knows the A4 sheet with four A6 labels', () => {
    const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === 'a4-2x2')

    expect(preset?.geometry).toEqual(DEFAULT_STICKER_TEMPLATE.geometry)
  })
})

describe('stickerGeometryOverflow', () => {
  it('names the columns when the grid is too wide', () => {
    expect(
      stickerGeometryOverflow({ ...DEFAULT_STICKER_TEMPLATE.geometry, columns: 8 }),
    ).toEqual(['geometry.columns'])
  })

  it('names the rows when the grid is too tall', () => {
    expect(
      stickerGeometryOverflow({ ...DEFAULT_STICKER_TEMPLATE.geometry, rows: 4 }),
    ).toEqual(['geometry.rows'])
  })

  it('accepts a grid that fits exactly', () => {
    expect(
      stickerGeometryOverflow({ ...DEFAULT_STICKER_TEMPLATE.geometry, columns: 2, rows: 2 }),
    ).toEqual([])
  })
})

describe('stickerPresetKeyOf', () => {
  it('names the preset of a geometry', () => {
    const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === 'a4-21')

    if (!preset) {
      throw new Error('the catalog has no sheet a4-21')
    }

    expect(stickerPresetKeyOf(preset.geometry)).toBe(preset.key)
  })

  it('names the free grid when no preset matches', () => {
    expect(
      stickerPresetKeyOf({ ...DEFAULT_STICKER_TEMPLATE.geometry, labelWidthMm: 63.5 }),
    ).toBe('custom')
  })
})

describe('stickerTemplateSchema', () => {
  it('accepts the default template', () => {
    expect(stickerTemplateSchema.safeParse(DEFAULT_STICKER_TEMPLATE).success).toBe(true)
  })

  it('refuses a template whose grid does not fit on the sheet', () => {
    const parsed = stickerTemplateSchema.safeParse({
      ...DEFAULT_STICKER_TEMPLATE,
      geometry: { ...DEFAULT_STICKER_TEMPLATE.geometry, columns: 8 },
    })

    expect(parsed.success).toBe(false)
  })

  it('refuses an unknown error correction', () => {
    const parsed = stickerTemplateSchema.safeParse({
      ...DEFAULT_STICKER_TEMPLATE,
      appearance: { ...DEFAULT_STICKER_TEMPLATE.appearance, qrLevel: 'X' },
    })

    expect(parsed.success).toBe(false)
  })
})
