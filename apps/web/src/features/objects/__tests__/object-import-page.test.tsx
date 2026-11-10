import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { ObjectImportPage } from '../object-import-page'

/**
 * CSV import page (WP-M10-14): the file text of the browser, the header mapping
 * controls, the preview rows with their inline errors and the commit summary
 * (WP-M10-12, WP-M10-13).
 */

const csvText = 'objektnummer;bezeichnung;ort;stand\n12345_01;Teich;Beispielstadt;Beispielufer\n;no number;X;Y\n'

const previewAnswer = {
  rows: [
    {
      line: 2,
      objectNo: '12345_01',
      action: 'new',
      errors: [],
      changed: [] as string[],
    },
    {
      line: 3,
      objectNo: '',
      action: 'error',
      errors: [{ code: 'invalid_request', params: { fields: ['objectNo', 'name'] } }],
      changed: [] as string[],
    },
  ],
  summary: { new: 1, changed: 0, unchanged: 0, error: 1 },
}

const commitAnswer = {
  ...previewAnswer,
  applied: { created: 1, updated: 0, unchanged: 0, failed: 1 },
}

const posts: { url: string; body: Record<string, unknown> }[] = []

function stubFetch(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'office@example.com',
            locale: 'de',
            roles: ['office'],
            permissions,
          },
        })
      }

      if (typeof init?.body === 'string') {
        posts.push({ url, body: JSON.parse(init.body) })
      }

      if (url.includes('/v1/objects/import/preview')) {
        return Response.json(previewAnswer)
      }

      if (url.includes('/v1/objects/import')) {
        return Response.json(commitAnswer)
      }

      return Response.json({ code: 'not_found', params: {} }, { status: 404 })
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/objects/import']}>
          <Routes>
            <Route element={<ObjectImportPage />} path="/objects/import" />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function selectFile() {
  const input = (await screen.findByTestId('csv-file')) as HTMLInputElement
  fireEvent.change(
    input,
    { target: { files: [new File([csvText], 'objekte.csv', { type: 'text/csv' })] } },
  )

  await waitFor(() => expect(screen.getAllByTestId('csv-map')).toHaveLength(4))
}

afterEach(() => {
  vi.unstubAllGlobals()
  posts.length = 0
})

describe('ObjectImportPage', () => {
  it('reads the file and maps every header column', async () => {
    stubFetch(['object.import'])
    renderPage()
    await selectFile()

    expect(screen.getAllByText(/Objektnummer|Object number/i).length).toBeGreaterThan(1)
  })

  it('posts the file text and the chosen mapping to the preview route', async () => {
    stubFetch(['object.import'])
    renderPage()
    await selectFile()

    const selects = screen.getAllByTestId('csv-map')
    fireEvent.change(selects[3]!, { target: { value: 'street' } })

    fireEvent.click(screen.getByRole('button', { name: /Preview|Preview/i }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toContain('/v1/objects/import/preview')
    expect(posts[0]?.body).toEqual({ csv: csvText, mapping: { stand: 'street' } })
  })

  it('shows the preview rows, their actions and the inline row error', async () => {
    stubFetch(['object.import'])
    renderPage()
    await selectFile()

    fireEvent.click(screen.getByRole('button', { name: /Preview|Preview/i }))

    await waitFor(() => expect(screen.getAllByText('12345_01')).toHaveLength(1))
    expect(await screen.findByText(/invalid or missing/i)).toBeTruthy()
  })

  it('commits the preview and shows the applied counters', async () => {
    stubFetch(['object.import'])
    renderPage()
    await selectFile()

    fireEvent.click(screen.getByRole('button', { name: /Preview|Preview/i }))
    await waitFor(() => expect(posts).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: /Import|Import/i }))

    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]?.url).toContain('/v1/objects/import')
    expect(
      await screen.findByText(/written to the database|written to the database/i),
    ).toBeTruthy()
  })

  it('stays read-only without object.import and sends no file', async () => {
    stubFetch(['object.read'])
    renderPage()

    expect(await screen.findByText(/Read-only|read-only/i)).toBeTruthy()

    const input = (await screen.findByTestId('csv-file')) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(posts).toHaveLength(0)
  })
})
