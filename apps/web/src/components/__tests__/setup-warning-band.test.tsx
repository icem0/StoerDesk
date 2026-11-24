import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { SetupWarningBand } from '../setup-warning-band'

/**
 * The warning of the setup (`specs/10-notifications.md` §11.9, §11.17,
 * ADR-0048): a user who does not fulfil the rule of the administration carries
 * a large band on every internal page — and the band has no button that
 * removes it.
 */
function renderBand() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SetupWarningBand />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function stubCompliance(options: { compliant: boolean; missing: string[] }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.endsWith('/v1/notifications/compliance')) {
      return Response.json({
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Nora Reich',
        channels: [
          { channel: 'ntfy', state: 'ready' },
          { channel: 'webpush', state: 'missing' },
        ],
        missing: options.missing,
        channelCount: 1,
        compliant: options.compliant,
      })
    }

    return Response.json({ code: 'not_found', params: {} }, { status: 404 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SetupWarningBand', () => {
  it('shows nothing for a user who fulfils the rule', async () => {
    vi.stubGlobal('fetch', stubCompliance({ compliant: true, missing: [] }))

    const { container } = renderBand()

    await Promise.resolve()

    expect(container.querySelector('[data-testid="setup-warning-band"]')).toBeNull()
  })

  it('names the missing channels and links to the setup', async () => {
    vi.stubGlobal('fetch', stubCompliance({ compliant: false, missing: ['webpush'] }))

    renderBand()

    const band = await screen.findByTestId('setup-warning-band')

    expect(band.textContent).toContain('Web Push')
    expect(band.textContent).toContain('die Vorgabe der Administration')

    const link = screen.getByRole('link', { name: 'Zur Einrichtung der Kanäle' })

    expect(link.getAttribute('href')).toBe('/settings/notifications')
  })

  it('has no button that removes the warning', async () => {
    vi.stubGlobal('fetch', stubCompliance({ compliant: false, missing: ['webpush'] }))

    renderBand()

    await screen.findByTestId('setup-warning-band')

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
