import { z } from 'zod'

/**
 * The sticker template of the installation (ADR-0050, `specs/08-objects-api.md`
 * §9.3).
 *
 * A sticker is a template: a **geometry** (the sheet format, the grid, the size
 * of the label, the margins of the sheet and the distance between two labels)
 * and an **appearance** (the error correction and the size of the QR, the lines
 * that are printed). The template is the settings row `sticker.template`; the
 * catalog of the sheets is data, not a branch in the code.
 *
 * The 112 notice is not part of the appearance: it stays visible on every
 * sticker (`PLAN.md` §2) and cannot be switched off.
 */

/** The sheet format of a sheet: an A4 or an A6 page. */
export const stickerSheetFormatSchema = z.enum(['a4', 'a6'])

export type StickerSheetFormat = z.infer<typeof stickerSheetFormatSchema>

/** The size of the sheet formats in millimetres. */
export const STICKER_SHEET_SIZE_MM: Record<StickerSheetFormat, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a6: { width: 105, height: 148 },
}

export const stickerGeometrySchema = z.object({
  page: stickerSheetFormatSchema,
  columns: z.number().int().min(1).max(20),
  rows: z.number().int().min(1).max(40),
  labelWidthMm: z.number().min(5).max(210),
  labelHeightMm: z.number().min(5).max(297),
  marginTopMm: z.number().min(0).max(50),
  marginRightMm: z.number().min(0).max(50),
  marginBottomMm: z.number().min(0).max(50),
  marginLeftMm: z.number().min(0).max(50),
  gapXMm: z.number().min(0).max(20),
  gapYMm: z.number().min(0).max(20),
})

export type StickerGeometry = z.infer<typeof stickerGeometrySchema>

export const stickerAppearanceSchema = z.object({
  /** The error correction of the QR: `L`, `M`, `Q` or `H`. */
  qrLevel: z.enum(['L', 'M', 'Q', 'H']),
  /** The side of the QR in millimetres; `null` means automatic. */
  qrSizeMm: z.number().min(8).max(120).nullable(),
  showName: z.boolean(),
  showObjectNo: z.boolean(),
  showCallText: z.boolean(),
})

export type StickerAppearance = z.infer<typeof stickerAppearanceSchema>

/**
 * The fields of the geometry that do not fit on the sheet: the columns of the
 * grid are too wide or the rows are too tall. The path names the field that
 * carries the fault, so the answer of the API names it as well.
 */
export function stickerGeometryOverflow(geometry: StickerGeometry): string[] {
  const size = STICKER_SHEET_SIZE_MM[geometry.page]
  const problems: string[] = []

  const width =
    geometry.columns * geometry.labelWidthMm +
    (geometry.columns - 1) * geometry.gapXMm +
    geometry.marginLeftMm +
    geometry.marginRightMm

  if (width > size.width + 0.001) {
    problems.push('geometry.columns')
  }

  const height =
    geometry.rows * geometry.labelHeightMm +
    (geometry.rows - 1) * geometry.gapYMm +
    geometry.marginTopMm +
    geometry.marginBottomMm

  if (height > size.height + 0.001) {
    problems.push('geometry.rows')
  }

  return problems
}

export const stickerTemplateSchema = z
  .object({
    /** The key of the catalog; a template that no longer matches a preset is `custom`. */
    templateKey: z.string().min(1).max(40),
    geometry: stickerGeometrySchema,
    appearance: stickerAppearanceSchema,
  })
  .superRefine((template, ctx) => {
    for (const field of stickerGeometryOverflow(template.geometry)) {
      ctx.addIssue({
        code: 'custom',
        path: field.split('.'),
        message: 'the grid does not fit on the sheet',
      })
    }
  })

export type StickerTemplate = z.infer<typeof stickerTemplateSchema>

export const stickerTemplateResponseSchema = z.object({
  template: stickerTemplateSchema,
})

export type StickerTemplateResponse = z.infer<typeof stickerTemplateResponseSchema>

/**
 * The body of the write: a field that is absent keeps the stored value, so the
 * administration can save the appearance without touching the geometry.
 */
export const updateStickerTemplateRequestSchema = z.object({
  templateKey: z.string().min(1).max(40).optional(),
  geometry: stickerGeometrySchema.partial().optional(),
  appearance: stickerAppearanceSchema.partial().optional(),
})

export type UpdateStickerTemplateRequest = z.infer<typeof updateStickerTemplateRequestSchema>

/** A sheet of the catalog: a key and its geometry. */
export interface StickerPreset {
  key: string
  geometry: StickerGeometry
}

/**
 * The catalog of the sheets (ADR-0050 decision 3). The numbers are proposals
 * for the label roll of the office; every one of them fits on its sheet, and
 * the administration may take a preset over into the free grid (`custom`) and
 * adjust it.
 */
export const STICKER_TEMPLATE_PRESETS: readonly StickerPreset[] = [
  {
    key: 'a6',
    geometry: {
      page: 'a6',
      columns: 1,
      rows: 1,
      labelWidthMm: 105,
      labelHeightMm: 148,
      marginTopMm: 0,
      marginRightMm: 0,
      marginBottomMm: 0,
      marginLeftMm: 0,
      gapXMm: 0,
      gapYMm: 0,
    },
  },
  {
    key: 'a4-2x2',
    geometry: {
      page: 'a4',
      columns: 2,
      rows: 2,
      labelWidthMm: 105,
      labelHeightMm: 148,
      marginTopMm: 0,
      marginRightMm: 0,
      marginBottomMm: 0,
      marginLeftMm: 0,
      gapXMm: 0,
      gapYMm: 0,
    },
  },
  {
    key: 'a4-21',
    geometry: {
      page: 'a4',
      columns: 3,
      rows: 7,
      labelWidthMm: 63.5,
      labelHeightMm: 38.1,
      marginTopMm: 12,
      marginRightMm: 8,
      marginBottomMm: 12,
      marginLeftMm: 8,
      gapXMm: 1,
      gapYMm: 1,
    },
  },
  {
    key: 'a4-52',
    geometry: {
      page: 'a4',
      columns: 4,
      rows: 13,
      labelWidthMm: 38.1,
      labelHeightMm: 21.2,
      marginTopMm: 4,
      marginRightMm: 12,
      marginBottomMm: 4,
      marginLeftMm: 12,
      gapXMm: 2,
      gapYMm: 1,
    },
  },
  {
    key: 'a4-104',
    geometry: {
      page: 'a4',
      columns: 8,
      rows: 13,
      labelWidthMm: 25.7,
      labelHeightMm: 20.7,
      marginTopMm: 13,
      marginRightMm: 2,
      marginBottomMm: 13,
      marginLeftMm: 2,
      gapXMm: 0,
      gapYMm: 0,
    },
  },
]

/** The key of the free grid: a geometry that no preset describes. */
export const STICKER_CUSTOM_TEMPLATE_KEY = 'custom'

/** The preset of a geometry: its key, or `custom` when no preset matches. */
export function stickerPresetKeyOf(geometry: StickerGeometry): string {
  const same = (candidate: StickerGeometry): boolean =>
    candidate.page === geometry.page &&
    candidate.columns === geometry.columns &&
    candidate.rows === geometry.rows &&
    candidate.labelWidthMm === geometry.labelWidthMm &&
    candidate.labelHeightMm === geometry.labelHeightMm &&
    candidate.marginTopMm === geometry.marginTopMm &&
    candidate.marginRightMm === geometry.marginRightMm &&
    candidate.marginBottomMm === geometry.marginBottomMm &&
    candidate.marginLeftMm === geometry.marginLeftMm &&
    candidate.gapXMm === geometry.gapXMm &&
    candidate.gapYMm === geometry.gapYMm

  const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => same(candidate.geometry))

  return preset?.key ?? STICKER_CUSTOM_TEMPLATE_KEY
}

/** The template of an installation that has configured nothing yet. */
export const DEFAULT_STICKER_TEMPLATE: StickerTemplate = {
  templateKey: 'a4-2x2',
  geometry: {
    page: 'a4',
    columns: 2,
    rows: 2,
    labelWidthMm: 105,
    labelHeightMm: 148,
    marginTopMm: 0,
    marginRightMm: 0,
    marginBottomMm: 0,
    marginLeftMm: 0,
    gapXMm: 0,
    gapYMm: 0,
  },
  appearance: {
    qrLevel: 'M',
    qrSizeMm: null,
    showName: true,
    showObjectNo: true,
    showCallText: true,
  },
}
