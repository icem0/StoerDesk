import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { apiBaseUrl } from '../../lib/api'
import { AlarmBanner } from '../alarm-banner'

/**
 * The band of the alarm (`specs/10-notifications.md` §11.17, ADR-0048): it
 * stands while unhandled messages exist, it silences the sound for an hour
 * (the sound only) and it asks for the gesture a browser needs before it may
 * play a tone at all.
 */
function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AlarmBanner />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubApi(options: { count: number; toneEnabled: boolean; mutedUntil?: string | null }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.endsWith('/v1/notifications/items/unread-count')) {
      return Response.json({ count: options.count })
    }

    if (url.endsWith('/v1/notifications/alarm')) {
      return Response.json({ toneEnabled: options.toneEnabled, repeatSeconds: 60 })
    }

    if (url.endsWith('/v1/notifications/mute')) {
      return Response.json({ mutedUntil: options.mutedUntil ?? null })
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AlarmBanner', () => {
  it('shows nothing without unhandled messages', async () => {
    vi.stubGlobal('fetch', stubApi({ count: 0, toneEnabled: true }))

    const { container } = renderBanner()

    await waitFor(() => {
      expect(container.querySelector('[data-testid="alarm-banner"]')).toBeNull()
    })
  })

  it('stands while messages are unhandled and links to the inbox', async () => {
    vi.stubGlobal('fetch', stubApi({ count: 3, toneEnabled: true }))

    renderBanner()

    const band = await screen.findByTestId('alarm-banner')

    expect(band.textContent).toContain('3')
    expect(screen.getByRole('link', { name: 'Zum Postfach' }).getAttribute('href')).toBe(
      '/notifications',
    )
  })

  it('offers the silence of one hour while the sound of the installation is on', async () => {
    vi.stubGlobal('fetch', stubApi({ count: 1, toneEnabled: true }))

    renderBanner()

    expect(await screen.findByRole('button', { name: '1 Stunde stumm' })).toBeTruthy()
  })

  it('names the remaining silence instead of the button', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        count: 1,
        toneEnabled: true,
        mutedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    )

    renderBanner()

    expect(await screen.findByText(/Stumm für noch/)).toBeTruthy()
  })

  it('names the silent installation instead of the button', async () => {
    vi.stubGlobal('fetch', stubApi({ count: 1, toneEnabled: false }))

    renderBanner()

    expect(await screen.findByText('Die Instanz spielt keinen Alarmton.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1 Stunde stumm' })).toBeNull()
  })

  /**
   * The paths of the band carry **no** prefix of the base: `apiFetch` puts the
   * base of the API in front of them. A second prefix would send the request
   * to `/api/api/v1/…` — the API answers `404`, the band never stands and the
   * tone never plays. The stub of the test matched the path with `endsWith`, and
   * a doubled prefix ends with the same path — so the address is asserted
   * exactly here (WP-M25-10).
   */
  it('asks the API without a second prefix', async () => {
    const fetchMock = stubApi({ count: 1, toneEnabled: true })

    vi.stubGlobal('fetch', fetchMock)

    renderBanner()

    await screen.findByTestId('alarm-banner')

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))

    expect(urls).toContain(`${apiBaseUrl}/v1/notifications/items/unread-count`)
    expect(urls).toContain(`${apiBaseUrl}/v1/notifications/alarm`)
    expect(urls).toContain(`${apiBaseUrl}/v1/notifications/mute`)
    expect(urls.some((url) => url.includes(`${apiBaseUrl}${apiBaseUrl}`))).toBe(false)
  })
})
