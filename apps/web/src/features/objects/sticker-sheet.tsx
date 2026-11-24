import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

import {
  STICKER_SHEET_SIZE_MM,
  stickerQrSizeMm,
  type ObjectSummary,
  type StickerAppearance,
  type StickerTemplate,
} from '@stoerdesk/shared'

/**
 * The printable sheet of the stickers (ADR-0050, WP-M27-04a).
 *
 * The sheet knows no format of its own: the geometry of the template says the
 * sheet format, the grid, the size of the label, the margins and the distance
 * between the labels, and the appearance says the error correction and the size
 * of the QR and the lines that are printed. The sheet is written in blocks of
 * `columns × rows` labels per page — a block is a page of the sheet, so the
 * grid of the label roll survives the print dialog.
 *
 * The 112 notice is not part of the appearance: it stands on every label
 * (`PLAN.md` §2).
 */

/** The pixels of a millimetre in CSS (96 dpi). */
const PX_PER_MM = 96 / 25.4

/** The margin of the QR around the modules. */
const QR_MARGIN_MODULES = 2

/** The public URL of the object — the QR carries the token, never the object number (§9.2). */
function stickerTarget(token: string): string {
  return `${window.location.origin}/m/${token}`
}

/** The labels of one page of the sheet. */
function chunk(objects: ObjectSummary[], size: number): ObjectSummary[][] {
  const pages: ObjectSummary[][] = []

  for (let index = 0; index < objects.length; index += size) {
    pages.push(objects.slice(index, index + size))
  }

  return pages
}

function StickerLabel({
  object,
  appearance,
  qrSizeMm,
}: {
  object: ObjectSummary
  appearance: StickerAppearance
  qrSizeMm: number
}) {
  const { t } = useTranslation('object')

  return (
    <div className="sticker-label">
      {object.qrToken !== null ? (
        <QRCodeSVG
          className="sticker-label__qr"
          value={stickerTarget(object.qrToken)}
          level={appearance.qrLevel}
          marginSize={QR_MARGIN_MODULES}
          size={Math.max(64, Math.round(qrSizeMm * PX_PER_MM))}
          title={object.objectNo}
        />
      ) : (
        <p className="sticker-label__no-token">{t('sticker.noToken')}</p>
      )}
      {appearance.showName ? (
        <p className="sticker-label__name">{object.name}</p>
      ) : null}
      {appearance.showObjectNo ? (
        <p className="sticker-label__object-no">{object.objectNo}</p>
      ) : null}
      {appearance.showCallText ? (
        <p className="sticker-label__call">{t('sticker.reportCall')}</p>
      ) : null}
      <p className="sticker-label__notice">{t('sticker.emergencyNotice')}</p>
    </div>
  )
}

export function StickerSheet({
  template,
  objects,
}: {
  template: StickerTemplate
  objects: ObjectSummary[]
}) {
  const { geometry, appearance } = template
  const sheet = STICKER_SHEET_SIZE_MM[geometry.page]
  const qrSizeMm = stickerQrSizeMm(geometry, appearance)
  const perPage = geometry.columns * geometry.rows
  const pages = chunk(objects, perPage)

  const style = {
    '--sticker-sheet-width': `${sheet.width}mm`,
    '--sticker-columns': geometry.columns,
    '--sticker-rows': geometry.rows,
    '--sticker-label-width': `${geometry.labelWidthMm}mm`,
    '--sticker-label-height': `${geometry.labelHeightMm}mm`,
    '--sticker-gap-x': `${geometry.gapXMm}mm`,
    '--sticker-gap-y': `${geometry.gapYMm}mm`,
    '--sticker-margin-top': `${geometry.marginTopMm}mm`,
    '--sticker-margin-right': `${geometry.marginRightMm}mm`,
    '--sticker-margin-bottom': `${geometry.marginBottomMm}mm`,
    '--sticker-margin-left': `${geometry.marginLeftMm}mm`,
    '--sticker-qr-size': `${qrSizeMm}mm`,
    '--sticker-label-padding': `${Math.min(3, geometry.labelHeightMm * 0.05)}mm`,
    '--sticker-font-name': `${geometry.labelHeightMm * 0.04}mm`,
    '--sticker-font-object-no': `${geometry.labelHeightMm * 0.027}mm`,
    '--sticker-font-call': `${geometry.labelHeightMm * 0.034}mm`,
    '--sticker-font-notice': `${geometry.labelHeightMm * 0.023}mm`,
  } as CSSProperties

  const pageRule =
    geometry.page === 'a4'
      ? '@page { size: A4; margin: 0; }'
      : '@page { size: 105mm 148mm; margin: 0; }'

  return (
    <div className="sticker-sheet" style={style}>
      <style>{pageRule}</style>
      {pages.map((labels, index) => (
        <div className="sticker-page" key={index}>
          {labels.map((object) => (
            <StickerLabel
              key={object.objectNo}
              object={object}
              appearance={appearance}
              qrSizeMm={qrSizeMm}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
