import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { StickerPage } from '../sticker-page'
import type { ObjectListResponse, ObjectSummary } from '@stoerdesk/shared'

const NOTICE = 'Bei Brand oder Gefahr: Notruf 112. Dieses Formular ersetzt keinen Notruf.'

function object(
  objectNo: string,
  name: string,
  qrToken: string | null,
  city = 'Beispielstadt',
): ObjectSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    objectNo,
    name,
    street: 'Bahnhofstrasse',
    houseNumber: '12',
    postalCode: '12345',
    city,
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

const LIST: ObjectListResponse = {
  objects: [
    object('12345_01', 'Rathaus', 'Zx8Q_-3vLm2pQ7tYw4KdBe'),
    object('B-2', 'Klinik Nord', 'Ab3dEf6gHij2pQr7tYw4Kd', 'Nordstadt'),
    object('C-3', 'Alte Werkskasse', null),
  ],
}

const TEMPLATE = {
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

function stubRequests(template: unknown = TEMPLATE) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')

      if (url.pathname.endsWith('/v1/objects/cities')) {
        return Response.json({ cities: ['Beispielstadt', 'Nordstadt'] })
      }

      if (url.pathname.endsWith('/v1/objects')) {
        const needle = (url.searchParams.get('search') ?? '').toLowerCase()
        const city = url.searchParams.get('city')
        const objects = LIST.objects.filter((object) => {
          const matchesSearch =
            needle === '' ||
            [object.objectNo, object.name, object.city ?? ''].some((value) =>
              value.toLowerCase().includes(needle),
            )
          const matchesCity = city === null || city === '' || object.city === city

          return matchesSearch && matchesCity
        })

        return Response.json({ objects })
      }

      if (url.pathname.endsWith('/v1/settings/sticker-template')) {
        return Response.json({ template })
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })

  vi.stubGlobal('fetch', mock)

  return mock
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/stickers']}>
          <StickerPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('StickerPage', () => {
  it('renders one label per active object with the 112 notice', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const labels = [...container.querySelectorAll('.sticker-label')]

    expect(labels).toHaveLength(3)

    for (const label of labels) {
      expect(label.textContent).toContain(NOTICE)
      expect(label.textContent).toContain('Störung melden: QR-Code scannen')
    }

    expect(labels[0]?.textContent).toContain('12345_01')
    expect(labels[0]?.textContent).toContain('Rathaus')
    expect(labels[1]?.textContent).toContain('Klinik Nord')
  })

  it('renders a QR code per token and a notice instead for a missing token', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    expect(container.querySelectorAll('.sticker-label svg')).toHaveLength(2)
    expect(container.querySelectorAll('.sticker-label__no-token')).toHaveLength(1)
  })

  it('filters the list on the server and deselects the objects', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'klinik' } })

    expect(
      await screen.findByText('1 von 1 Objekten ausgewählt', {}, { timeout: 3000 }),
    ).toBeTruthy()
    expect(container.querySelectorAll('.sticker-label')).toHaveLength(1)
    expect(container.querySelector('.sticker-label')?.textContent).toContain('Klinik Nord')

    fireEvent.click(screen.getByRole('checkbox'))

    expect(await screen.findByText('0 von 1 Objekten ausgewählt')).toBeTruthy()
    expect(container.querySelectorAll('.sticker-label')).toHaveLength(0)
    expect(screen.getByText('Kein Objekt ausgewählt — es wird nichts gedruckt.')).toBeTruthy()
  })

  it('asks the server for the places and the activity', async () => {
    const fetchMock = stubRequests()
    renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const city = screen.getByRole('combobox', { name: /Ort|City/i }) as HTMLSelectElement
    fireEvent.change(city, { target: { value: 'Nordstadt' } })

    const activity = screen.getByRole('combobox', { name: /Aktivität|Activity/i }) as HTMLSelectElement
    fireEvent.change(activity, { target: { value: 'all' } })

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))

    expect(urls.some((url) => url.includes('city=Nordstadt'))).toBe(true)
    expect(urls.some((url) => url.includes('active=all'))).toBe(true)
  })

  it('selects all objects and none of them', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    fireEvent.click(screen.getByRole('button', { name: /Keine auswählen|Select none/i }))

    expect(await screen.findByText('0 von 3 Objekten ausgewählt')).toBeTruthy()
    expect(container.querySelectorAll('.sticker-label')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Alle auswählen|Select all/i }))

    expect(await screen.findByText('3 von 3 Objekten ausgewählt')).toBeTruthy()
    expect(container.querySelectorAll('.sticker-label')).toHaveLength(3)
  })

  it('prints the sheet of the template of the installation', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const sheet = container.querySelector('.sticker-sheet')
    const style = sheet?.getAttribute('style') ?? ''

    expect(style).toContain('--sticker-columns: 2')
    expect(style).toContain('--sticker-label-width: 105mm')
    expect(container.textContent).toContain('@page { size: A4; margin: 0; }')
  })

  it('lets the printer choose the sheet of the job', async () => {
    stubRequests()
    const { container } = renderPage()

    await screen.findAllByText('Störung melden: QR-Code scannen')

    fireEvent.change(screen.getByRole('combobox', { name: /Blatt|Sheet/i }), {
      target: { value: 'a4-104' },
    })

    await screen.findAllByText('Störung melden: QR-Code scannen')

    const style = container.querySelector('.sticker-sheet')?.getAttribute('style') ?? ''

    expect(style).toContain('--sticker-columns: 8')
    expect(style).toContain('--sticker-label-width: 25.7mm')
  })

  it('prints the look of the installation', async () => {
    stubRequests({
      ...TEMPLATE,
      appearance: { ...TEMPLATE.appearance, showName: false, showCallText: false },
    })
    const { container } = renderPage()

    await screen.findAllByText(NOTICE)

    const labels = [...container.querySelectorAll('.sticker-label')]

    expect(labels[0]?.textContent).not.toContain('Rathaus')
    expect(labels[0]?.textContent).not.toContain('Störung melden: QR-Code scannen')
    expect(labels[0]?.textContent).toContain(NOTICE)
  })
})
