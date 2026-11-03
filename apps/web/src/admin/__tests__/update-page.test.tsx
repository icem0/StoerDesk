import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { UpdatePage } from '../update-page'

const mocks = vi.hoisted(() => ({
  outboxAvailable: vi.fn(() => true),
  queuedReports: vi.fn(async () => [
    {
      client_uuid: 'client-1',
      payload: {
        clientUuid: 'client-1',
        objectNo: '10372_01',
        description: 'test',
      },
      status: 'queued',
      retries: 0,
      created_at: 1,
    },
  ]),
}))

vi.mock('../../lib/outbox', () => mocks)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/update']}>
          <Routes>
            <Route path="/admin/update" element={<UpdatePage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('UpdatePage', () => {
  it('shows the app version and the clean update actions', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /Aktualisierung|Update/i })).toBeTruthy()
    expect(screen.getByText(/App-Version|App version/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Update prüfen|Check update/i })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Cache leeren & neu laden|Clear cache & reload/i }),
    ).toBeTruthy()
  })

  it('blocks the update actions while an offline report is queued', async () => {
    renderPage()

    expect(await screen.findByText(/Offline-Meldungen|Offline reports/i)).toBeTruthy()

    const checkButton = (await screen.findByRole('button', {
      name: /Update prüfen|Check update/i,
    })) as HTMLButtonElement
    const clearButton = (await screen.findByRole('button', {
      name: /Cache leeren & neu laden|Clear cache & reload/i,
    })) as HTMLButtonElement

    expect(checkButton.disabled).toBe(true)
    expect(clearButton.disabled).toBe(true)
  })
})
