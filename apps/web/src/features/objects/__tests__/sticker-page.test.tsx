import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { StickerPage } from '../sticker-page'
import type { ObjectListResponse, ObjectSummary } from '@stoerdesk/shared'

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
    active: true,
    notes: null,
    qrToken,
    systems: [{ id: '22222222-2222-4222-8222-222222222222', type: 'BMA', label: 'BMA Mitte' }],
  }
}

const LIST: ObjectListResponse = {
  objects: [
    object('12345_01', 'Rathaus', 'Zx8Q_-3vLm2pQ7tYw4KdBe'),
    object('B-2', 'Klinik Nord', 'Ab3dEf6gHij2pQr7tYw4Kd'),
    object('C-3', 'Alte Werkskasse', null),
  ],
}

function stubObjectList() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(LIST)),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <StickerPage />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('StickerPage', () => {
  it('renders one A6 card per active object with the 112 notice', async () => {
    stubObjectList()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const cards = [...container.querySelectorAll('.sticker-card')]

    expect(cards).toHaveLength(3)

    for (const card of cards) {
      expect(card.textContent).toContain(NOTICE)
      expect(card.textContent).toContain('Störung melden: QR-Code scannen')
    }

    expect(cards[0]?.textContent).toContain('12345_01')
    expect(cards[0]?.textContent).toContain('Rathaus')
    expect(cards[1]?.textContent).toContain('Klinik Nord')
  })

  it('renders a QR code per token and a notice instead for a missing token', async () => {
    stubObjectList()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    expect(container.querySelectorAll('.sticker-card svg')).toHaveLength(2)
    expect(container.querySelectorAll('.sticker-card__no-token')).toHaveLength(1)
  })

  it('filters and deselects objects before printing', async () => {
    stubObjectList()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'klinik' } })

    expect(await screen.findByText('1 von 1 Objekten ausgewählt')).toBeTruthy()
    expect(container.querySelectorAll('.sticker-card')).toHaveLength(1)
    expect(container.querySelector('.sticker-card')?.textContent).toContain('Klinik Nord')

    fireEvent.click(screen.getByRole('checkbox'))

    expect(await screen.findByText('0 von 1 Objekten ausgewählt')).toBeTruthy()
    expect(container.querySelectorAll('.sticker-card')).toHaveLength(0)
    expect(screen.getByText('Kein Objekt ausgewählt — es wird nichts gedruckt.')).toBeTruthy()
  })

  it('writes one page rule for the selected sheet format', async () => {
    stubObjectList()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    expect(container.querySelector('.sticker-sheet--a4')).toBeTruthy()
    expect(container.textContent).toContain('@page { size: A4; margin: 0; }')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a6' } })

    await screen.findAllByText('Störung melden: QR-Code scannen')

    expect(container.querySelector('.sticker-sheet--a6')).toBeTruthy()
    expect(container.querySelector('.sticker-sheet--a4')).toBeFalsy()
    expect(container.textContent).toContain('@page { size: 105mm 148mm; margin: 0; }')
  })
})
