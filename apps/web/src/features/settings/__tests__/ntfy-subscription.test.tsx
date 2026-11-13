import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { i18n } from '../../../i18n'
import { NtfySubscription, subscriptionValue } from '../NtfySubscription'
import type { NtfySubscriptionOptions } from '../NtfySubscription'

const SUBSCRIBE_DE = 'In der ntfy-App abonnieren'
const HINT_DE = 'mit dem Handy scannen'
const QR_LABEL_DE = 'ntfy-Abo QR-Code'

function renderCard(options: NtfySubscriptionOptions) {
  return render(
    <I18nextProvider i18n={i18n}>
      <NtfySubscription publicUrl={options.publicUrl} topic={options.topic} deepLink={options.deepLink} />
    </I18nextProvider>,
  )
}

afterEach(() => {
  void i18n.changeLanguage('de')
})

describe('subscriptionValue', () => {
  it('builds the public subscription address of the topic', () => {
    expect(subscriptionValue('https://ntfy.sh', 'stoerdesk', false)).toBe('https://ntfy.sh/stoerdesk')
  })

  it('adds the scheme to a bare host and drops a trailing slash', () => {
    expect(subscriptionValue('ntfy.example.org/', 'stoerdesk', false)).toBe('https://ntfy.example.org/stoerdesk')
  })

  it('switches to the host-carrying ntfy app deep link on request (WP-M14-33)', () => {
    expect(subscriptionValue('https://ntfy.sh', 'stoerdesk', true)).toBe('ntfy://ntfy.sh/stoerdesk')
  })

  it('keeps a bare host in the deep link and marks an http server as insecure', () => {
    expect(subscriptionValue('ntfy.example.org', 'stoerdesk', true)).toBe('ntfy://ntfy.example.org/stoerdesk')
    expect(subscriptionValue('http://ntfy.example.org/', 'stoerdesk', true)).toBe('ntfy://ntfy.example.org/stoerdesk?secure=false')
  })
})

describe('NtfySubscription', () => {
  it('renders the label, the hint and one QR code for a configured topic', () => {
    const { container } = renderCard({ publicUrl: 'https://ntfy.sh', topic: 'stoerdesk' })

    expect(screen.getByText(SUBSCRIBE_DE)).toBeTruthy()
    expect(screen.getByText(HINT_DE)).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelector('svg title')?.textContent).toBe(QR_LABEL_DE)
  })

  it('renders nothing while the topic or the server address is empty', () => {
    const { container } = renderCard({ topic: 'stoerdesk' })

    expect(screen.queryByText(SUBSCRIBE_DE)).toBeNull()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  it('renders the english label and hint when the language is en', () => {
    void i18n.changeLanguage('en')
    const { container } = renderCard({ publicUrl: 'https://ntfy.sh', topic: 'stoerdesk', deepLink: true })

    expect(screen.getByText('Subscribe in the ntfy app')).toBeTruthy()
    expect(screen.getByText('scan it with your phone')).toBeTruthy()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
