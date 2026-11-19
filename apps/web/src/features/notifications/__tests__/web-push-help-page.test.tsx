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

    expect(await screen.findByText(i18n.t('help.webpush.title'))).toBeTruthy()
    expect(screen.getByText(i18n.t('help.webpush.publicKey'))).toBeTruthy()
    expect(screen.getByText(i18n.t('help.webpush.command'))).toBeTruthy()
    expect(
      screen.getByText(i18n.t('help.webpush.secret')),
    ).toBeTruthy()
  })

  it('offers the command in a code field with a copy button', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/help/web-push']}>
          <WebPushHelpPage />
        </MemoryRouter>
      </I18nextProvider>,
    )

    const hostField = screen.getByText(i18n.t('help.webpush.command'))
    expect(hostField.tagName).toBe('CODE')
    expect(
      screen.getByRole('button', {
        name: i18n.t('help.webpush.copyToClipboardCommand', {
          label: i18n.t('help.webpush.commandHostLabel'),
        }),
      }),
    ).toBeTruthy()
  })

  it('offers the command of the Docker stack with a copy button', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/help/web-push']}>
          <WebPushHelpPage />
        </MemoryRouter>
      </I18nextProvider>,
    )

    const dockerField = screen.getByText(i18n.t('help.webpush.commandDocker'))
    expect(dockerField.tagName).toBe('CODE')
    expect(
      screen.getByRole('button', {
        name: i18n.t('help.webpush.copyToClipboardCommand', {
          label: i18n.t('help.webpush.commandDockerLabel'),
        }),
      }),
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
