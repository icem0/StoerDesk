import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { i18n } from '../../../i18n'
import { InternalCreatePage } from '../internal-create-page'

const DATA_URL = 'data:image/jpeg;base64,AAAA'

vi.mock('../image-compress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../image-compress')>()
  return {
    ...actual,
    compressImage: vi.fn(async () => ({
      dataUrl: DATA_URL,
      width: 10,
      height: 10,
      sizeBytes: 3,
    })),
  }
})

function file(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' })
}

const OBJECT_ID = '11111111-1111-4111-8111-111111111111'

/**
 * Records the body of the create request and answers 201 with a created ticket.
 */
function stubInternalForm(titleEnabled = false) {
  const bodies: Record<string, unknown>[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)

      if (path.includes('/v1/settings/title-switch')) {
        return Response.json({ titleEnabled })
      }

      if (path.includes('/v1/settings/deadline-hours')) {
        return Response.json({ low: 168, normal: 72, high: 24, critical: 8 })
      }

      if (path.includes('/v1/tickets/reporter-users')) {
        return Response.json({
          users: [{ id: '66666666-6666-4666-8666-666666666666', name: 'Rita Ruf', email: 'rita.ruf@example.invalid' }],
        })
      }

      if (path.includes('/v1/tickets') && path.endsWith('/tickets')) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)

        return Response.json(
          {
            ticketId: '55555555-5555-4555-8555-555555555555',
            ticketNo: 'ST-2025-0001',
            status: 'NEW',
            statusToken: 'st-1234',
            reportedAt: '2025-01-01T08:00:00Z',
            receivedAt: '2025-01-01T08:00:00Z',
            deadlineAt: '2025-01-04T08:00:00Z',
          },
          { status: 201 },
        )
      }

      if (path.includes('/v1/text-templates')) {
        return Response.json({ templates: [] })
      }

      return Response.json({
        objects: [
          {
            id: OBJECT_ID,
            objectNo: '12345_01',
            name: 'Rathaus',
            externalType: 'Brandmeldeanlage',
            priority: 'normal',
            systems: [],
          },
        ],
      })
    }),
  )

  return { bodies }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/new']}>
          <Routes>
            <Route path="/objects/new" element={<InternalCreatePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function pickObject() {
  const searchInput = (await screen.findByRole('searchbox')) as HTMLInputElement
  fireEvent.focus(searchInput)
  await screen.findByText('Rathaus')
  fireEvent.change(searchInput, { target: { value: '1234' } })
  await screen.findByText('Rathaus')
  fireEvent.click(screen.getByText('12345_01'))
}

async function selectPhoto() {
  fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [file('a.jpg')] } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  void i18n.changeLanguage('de')
})

describe('InternalCreatePage photos (WP-M2-100)', () => {
  it('renders the photo uploader next to the other fields', async () => {
    stubInternalForm()
    renderPage()
    await pickObject()

    await waitFor(() =>
      expect(screen.getByTestId('photo-input')).toBeTruthy(),
    )
  })

  it('sends the compressed photos in the create request body', async () => {
    const { bodies } = stubInternalForm()
    renderPage()
    await pickObject()
    await selectPhoto()

    await waitFor(() =>
      expect(screen.getAllByTestId('photo-preview')).toHaveLength(1),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Meldung erstellen' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    const body = bodies[0]!
    expect(Array.isArray(body.photos)).toBe(true)
    expect(body.photos).toEqual([DATA_URL])
  })
})
