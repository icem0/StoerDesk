import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '../../i18n'
import { NotificationBell } from '../notification-bell'

/**
 * The tone of this browser (`specs/10-notifications.md` §11.12): the bell sounds
 * it when the unread count rises. The module is replaced, so the test sees the
 * call of the bell instead of the sound.
 */
const { playAlarmTone, tone } = vi.hoisted(() => ({
  playAlarmTone: vi.fn(),
  tone: { enabled: false },
}))

vi.mock('../../lib/alarm-tone', () => ({
  isAlarmToneEnabled: () => tone.enabled,
  onAlarmToneChange: () => () => undefined,
  playAlarmTone,
}))

/**
 * No backend: the bell reads only the unread count of WP-M14-120c. The fake
 * answers that route, so the badge runs in memory and the inbox page is reached
 * through the link of the bell, never through a request of the bell itself.
 */
function stub(unread = 2) {
  let count = unread

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/unread-count')) {
        return Response.json({ count })
      }

      return Response.json({ messages: [] })
    }),
  )

  return {
    /** The next answer of the API carries another count — a new message arrived. */
    raise(next: number) {
      count = next
    },
  }
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const view = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/']}>
          <NotificationBell />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return { ...view, client }
}

afterEach(() => {
  vi.unstubAllGlobals()
  playAlarmTone.mockClear()
  tone.enabled = false
})

describe('NotificationBell', () => {
  it('shows the number of the unread messages', async () => {
    stub(3)

    renderBell()

    expect(await screen.findByTestId('unread-count')).toBeTruthy()
    expect(screen.getByTestId('unread-count').textContent).toBe('3')
  })

  it('shows no badge when every message is read', async () => {
    stub(0)

    renderBell()

    expect(await screen.findByRole('link', { name: 'Benachrichtigungen' })).toBeTruthy()
    expect(screen.queryByTestId('unread-count')).toBeNull()
  })

  it('is one link that opens the inbox page', async () => {
    stub(1)

    renderBell()

    const link = screen.getByRole('link', { name: 'Benachrichtigungen' })
    expect(link.getAttribute('href')).toBe('/notifications')
    expect(screen.queryByText('ST-2026-0001')).toBeNull()
  })

  it('paints the accent of the instance like an entry of the menu (WP-M16-04)', async () => {
    stub(4)

    renderBell()

    expect(await screen.findByTestId('unread-count')).toBeTruthy()

    const link = screen.getByRole('link', { name: 'Benachrichtigungen' })
    expect(link.getAttribute('class')).toContain('min-h-11')
    expect(link.getAttribute('class')).toContain('text-accent-300')
  })

  it('shows no messages and fetches none by itself', async () => {
    stub(1)

    renderBell()

    expect(screen.queryByText('Zugestellt')).toBeNull()
  })

  it('sounds the tone when the unread count rises (WP-M14-178)', async () => {
    tone.enabled = true
    const counter = stub(1)

    const { client } = renderBell()

    await waitFor(() => expect(screen.getByTestId('unread-count')).toBeTruthy())

    // The first answer is no rise — the tone stays silent.
    expect(playAlarmTone).not.toHaveBeenCalled()

    counter.raise(4)

    await client.invalidateQueries({ queryKey: ['notification-unread-count'] })

    await waitFor(() => expect(playAlarmTone).toHaveBeenCalledTimes(1))
  })

  it('stays silent when the tone is switched off for this browser (WP-M14-178)', async () => {
    tone.enabled = false
    const counter = stub(1)

    const { client } = renderBell()

    await waitFor(() => expect(screen.getByTestId('unread-count')).toBeTruthy())

    counter.raise(4)

    await client.invalidateQueries({ queryKey: ['notification-unread-count'] })

    await waitFor(() => expect(screen.getByTestId('unread-count').textContent).toBe('4'))
    expect(playAlarmTone).not.toHaveBeenCalled()
  })
})
