import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { i18n } from '../../../i18n'
import { WebPushHelpPage } from '../web-push-help-page'

describe('WebPushHelpPage', () => {
  it('names the three VAPID values and the generate command', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/help/web-push']}>
          <WebPushHelpPage />
        </MemoryRouter>
      </I18nextProvider>,
    )

    expect(await screen.findByText('Web Push (VAPID) — Setup Guide')).toBeTruthy()
    expect(screen.getByText('VAPID_PUBLIC_KEY — the public key that the browser receives')).toBeTruthy()
    expect(screen.getByText('npx web-push generate-vapid-keys')).toBeTruthy()
    expect(
      screen.getByText(
        'The private key is a secret: never commit it, never log it, never send it to the browser.',
      ),
    ).toBeTruthy()
  })

  it('links the notification settings and the inbox back', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/help/web-push']}>
          <WebPushHelpPage />
        </MemoryRouter>
      </I18nextProvider>,
    )

    const settings = screen.getByRole('link', { name: i18n.t('help.webpush.settingsLink') })
    expect(settings.getAttribute('href')).toBe('/settings/notifications')
    const inbox = screen.getByRole('link', { name: i18n.t('help.webpush.inboxLink') })
    expect(inbox.getAttribute('href')).toBe('/notifications')
  })
})
