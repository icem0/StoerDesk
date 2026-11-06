import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { DeadlinesPage } from '../deadlines-page'

/**
 * Deadline administration (WP-M6-15): the loaded values are shown, a change is sent with
 * the PUT body, and without `settings.write` the inputs stay read-only.
 *
 * The number inputs are read in document order: four hour inputs (low, normal, high,
 * critical), then the reaction rows with standard and critical per rule.
 */

const settingsBody = {
  hours: { low: 168, normal: 72, high: 24, critical: 8 },
  reactionMinutes: {
    new_without_review: { standard: 15, critical: 5 },
    work_order_without_distribution: { standard: 30, critical: 30 },
    offered_without_claim: { standard: 20, critical: 10 },
    assigned_without_accept: { standard: 15, critical: 15 },
  },
}

const fetchCalls: { url: string; method: string; body?: unknown }[] = []

function stubRoutes(permissions: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      fetchCalls.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })

      if (url.includes('/v1/me')) {
        return Response.json({
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'admin@example.com',
            locale: 'de',
            roles: ['admin'],
            permissions,
          },
        })
      }

      if (url.includes('/v1/settings/deadlines')) {
        if (init?.method === 'PUT') {
          return Response.json(JSON.parse(String(init.body)))
        }

        return Response.json(settingsBody)
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
        <MemoryRouter initialEntries={['/admin/deadlines']}>
          <Routes>
            <Route path="/admin/deadlines" element={<DeadlinesPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls.length = 0
})

describe('DeadlinesPage', () => {
  it('shows the loaded hours and reaction minutes', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    const inputs = (await screen.findAllByRole('spinbutton')) as HTMLInputElement[]

    expect(inputs).toHaveLength(12)
    expect(inputs.slice(0, 4).map((input) => input.value)).toEqual(['168', '72', '24', '8'])
    expect(inputs[4]?.value).toBe('15')
    expect(inputs[5]?.value).toBe('5')
  })

  it('sends the changed values in the PUT body', async () => {
    stubRoutes(['settings.read', 'settings.write'])
    renderPage()

    const inputs = (await screen.findAllByRole('spinbutton')) as HTMLInputElement[]
    fireEvent.change(inputs[1]!, { target: { value: '48' } })
    fireEvent.click(screen.getByRole('button', { name: /Speichern|Save/ }))

    await waitFor(() => {
      const put = fetchCalls.find((call) => call.method === 'PUT')

      expect(put?.url).toContain('/v1/settings/deadlines')
      expect(put?.body).toEqual({
        ...settingsBody,
        hours: { ...settingsBody.hours, normal: 48 },
      })
    })
  })

  it('keeps the inputs read-only without settings.write', async () => {
    stubRoutes(['settings.read'])
    renderPage()

    const inputs = (await screen.findAllByRole('spinbutton')) as HTMLInputElement[]

    expect(inputs.every((input) => input.disabled)).toBe(true)
    expect(screen.queryByRole('button', { name: /Speichern|Save/ })).toBeNull()
  })
})
