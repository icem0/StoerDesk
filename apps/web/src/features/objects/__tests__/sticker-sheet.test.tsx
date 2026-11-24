import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { StickerSheet } from '../sticker-sheet'
import {
  DEFAULT_STICKER_TEMPLATE,
  STICKER_TEMPLATE_PRESETS,
  stickerQrSizeMm,
  type ObjectSummary,
  type StickerTemplate,
} from '@stoerdesk/shared'

const NOTICE = 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.'

function object(objectNo: string, name: string, qrToken: string | null): ObjectSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    objectNo,
    name,
    street: 'Bahnhofstrasse',
    houseNumber: '12',
    postalCode: '12345',
    city: 'Beispielstadt',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    externalId: null,
    externalType: null,
    active: true,
    notes: null,
    qrToken,
    priority: 'normal',
    priorityOverride: null,
    pinned: false,
  }
}

const OBJECTS: ObjectSummary[] = [
  object('12345_01', 'Rathaus', 'Zx8Q_-3vLm2pQ7tYw4KdBe'),
  object('B-2', 'Klinik Nord', 'Ab3dEf6gHij2pQr7tYw4Kd'),
  object('C-3', 'Alte Werkskasse', null),
]

function preset(key: string): StickerTemplate {
  const found = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === key)

  if (found === undefined) {
    throw new Error(`the catalog has no sheet ${key}`)
  }

  return { ...DEFAULT_STICKER_TEMPLATE, templateKey: found.key, geometry: found.geometry }
}

function renderSheet(template: StickerTemplate, objects: ObjectSummary[] = OBJECTS) {
  return render(
    <I18nextProvider i18n={i18n}>
      <StickerSheet template={template} objects={objects} />
    </I18nextProvider>,
  )
}

describe('StickerSheet', () => {
  it('writes one label per object with the QR, the lines and the 112 notice', () => {
    const { container } = renderSheet(preset('a4-21'))

    const labels = [...container.querySelectorAll('.sticker-label')]

    expect(labels).toHaveLength(3)

    for (const label of labels) {
      expect(label.textContent).toContain(NOTICE)
      expect(label.textContent).toContain('Störung melden: QR-Code scannen')
    }

    expect(labels[0]?.textContent).toContain('Rathaus')
    expect(labels[0]?.textContent).toContain('12345_01')
    expect(container.querySelectorAll('.sticker-label svg')).toHaveLength(2)
    expect(container.querySelectorAll('.sticker-label__no-token')).toHaveLength(1)
  })

  it('writes the measures of the geometry into the sheet', () => {
    const { container } = renderSheet(preset('a4-21'))

    const sheet = container.querySelector('.sticker-sheet')
    const style = sheet?.getAttribute('style') ?? ''

    expect(style).toContain('--sticker-label-width: 63.5mm')
    expect(style).toContain('--sticker-label-height: 38.1mm')
    expect(style).toContain('--sticker-columns: 3')
    expect(style).toContain('--sticker-sheet-width: 210mm')
  })

  it('writes the page rule of the sheet format', () => {
    const { container } = renderSheet(preset('a4-21'))

    expect(container.textContent).toContain('@page { size: A4; margin: 0; }')

    const a6 = renderSheet(preset('a6'))

    expect(a6.container.textContent).toContain('@page { size: 105mm 148mm; margin: 0; }')
  })

  it('writes the labels in blocks of the grid', () => {
    const template = preset('a4-2x2')
    const { container } = renderSheet(
      { ...template, geometry: { ...template.geometry, columns: 2, rows: 1 } },
      [
        ...OBJECTS,
        object('D-4', 'Werkhalle', 'Ab3dEf6gHij2pQr7tYw4Kd'),
        object('E-5', 'Pflegheim', 'Ab3dEf6gHij2pQr7tYw4Kd'),
      ],
    )

    const pages = [...container.querySelectorAll('.sticker-page')]

    expect(pages).toHaveLength(3)
    expect(pages[0]?.querySelectorAll('.sticker-label')).toHaveLength(2)
    expect(pages[2]?.querySelectorAll('.sticker-label')).toHaveLength(1)
  })

  it('leaves out the lines that the appearance switches off', () => {
    const template = preset('a4-21')
    const { container } = renderSheet({
      ...template,
      appearance: { ...template.appearance, showName: false, showCallText: false },
    })

    expect(container.textContent).not.toContain('Rathaus')
    expect(container.textContent).not.toContain('Störung melden: QR-Code scannen')
    expect(container.textContent).toContain(NOTICE)
  })

  it('takes the size of the QR from the appearance or from the label', () => {
    const template = preset('a4-21')

    expect(stickerQrSizeMm(template.geometry, template.appearance)).toBe(
      Math.min(63.5 - 4, 38.1 * 0.45),
    )
    expect(
      stickerQrSizeMm(template.geometry, { ...template.appearance, qrSizeMm: 25 }),
    ).toBe(25)
  })

  it('names the object of every label', async () => {
    renderSheet(preset('a4-21'))

    await screen.findAllByText(NOTICE)

    expect(screen.getAllByText(NOTICE)).toHaveLength(3)
  })
})
