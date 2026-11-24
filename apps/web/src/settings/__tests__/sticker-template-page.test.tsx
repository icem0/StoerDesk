import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { StickerTemplatePage } from '../sticker-template-page'

const A4_21_GEOMETRY = {
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
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/sticker-template']}>
          <Routes>
            <Route path="/admin/sticker-template" element={<StickerTemplatePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubSessionAndTemplate(permissions: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.endsWith('/v1/me')) {
      return Response.json({
        user: { email: 'admin@example.com', roles: ['admin'], permissions },
      })
    }

    if (url.endsWith('/settings/sticker-template')) {
      const request = input as Request

      if (request.method === 'PUT') {
        const body = (await request.json()) as { geometry?: unknown }

        return Response.json({
          template: {
            templateKey: 'a4-21',
            geometry: body.geometry ?? A4_21_GEOMETRY,
            appearance: {
              qrLevel: 'M',
              qrSizeMm: null,
              showName: true,
              showObjectNo: true,
              showCallText: true,
            },
          },
        })
      }

      return Response.json({
        template: {
          templateKey: 'a4-21',
          geometry: A4_21_GEOMETRY,
          appearance: {
            qrLevel: 'M',
            qrSizeMm: null,
            showName: true,
            showObjectNo: true,
            showCallText: true,
          },
        },
      })
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StickerTemplatePage', () => {
  it('shows the stored geometry and the look of the installation', async () => {
    const fetchMock = stubSessionAndTemplate(['settings.read', 'settings.write'])
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const columns = (await screen.findByLabelText(/Spalten|Columns/i)) as HTMLInputElement
    expect(columns.value).toBe('3')

    const labelWidth = (await screen.findByLabelText(
      /Breite des Etiketts|Width of the label/i,
    )) as HTMLInputElement
    expect(labelWidth.value).toBe('63.5')

    const level = (await screen.findByLabelText(
      /Fehlerkorrektur|Error correction/i,
    )) as HTMLSelectElement
    expect(level.value).toBe('M')
  })

  it('takes the geometry of a chosen preset over and saves it', async () => {
    const fetchMock = stubSessionAndTemplate(['settings.read', 'settings.write'])
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const preset = (await screen.findByRole('combobox', {
      name: /Vorlage|Template/i,
    })) as HTMLSelectElement
    fireEvent.change(preset, { target: { value: 'a4-104' } })

    const columns = (await screen.findByLabelText(/Spalten|Columns/i)) as HTMLInputElement
    expect(columns.value).toBe('8')

    fireEvent.click(screen.getByRole('button', { name: /Vorlage speichern|Save the template/i }))

    await expect(
      screen.findByText(/Die Vorlage ist gespeichert|The template is saved/i),
    ).resolves.toBeTruthy()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/settings/sticker-template',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"columns":8'),
      }),
    )
  })

  it('refuses a grid that does not fit on the sheet', async () => {
    const fetchMock = stubSessionAndTemplate(['settings.read', 'settings.write'])
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    const columns = (await screen.findByLabelText(/Spalten|Columns/i)) as HTMLInputElement
    fireEvent.change(columns, { target: { value: '8' } })

    await expect(
      screen.findByText(/Das Raster passt nicht auf das Blatt|grid does not fit/i),
    ).resolves.toBeTruthy()

    const save = screen.getByRole('button', { name: /Vorlage speichern|Save the template/i })
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })

  it('names the 112 notice as a line that cannot be switched off', async () => {
    const fetchMock = stubSessionAndTemplate(['settings.read', 'settings.write'])
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await expect(
      screen.findByText(/Die 112-Hinweiszeile steht auf jedem Aufkleber|112 notice stands on every sticker/i),
    ).resolves.toBeTruthy()
  })
})
