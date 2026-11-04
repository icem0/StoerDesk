import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import type { QueuedAction } from '../../../lib/outbox'
import { OfflineActionBanner } from '../offline-action-banner'

const conflictRow: QueuedAction = {
  id: 1,
  client_uuid: 'uuid-1',
  ticket_no: 'ST-1',
  action: 'acknowledge',
  payload: {},
  status: 'conflict',
  error_code: 'invalid_transition',
  ticket_status: 'ACCEPTED',
  retries: 0,
  created_at: Date.now() - 60000,
}

const queuedRow: QueuedAction = {
  id: 2,
  client_uuid: 'uuid-2',
  ticket_no: 'ST-1',
  action: 'comment',
  payload: { text: 'Leckage am Ventil' },
  status: 'queued',
  retries: 0,
  created_at: Date.now(),
}

function renderBanner(rows: QueuedAction[]) {
  const onRetry = vi.fn().mockResolvedValue(undefined)
  const onDiscard = vi.fn().mockResolvedValue(undefined)

  return {
    onRetry,
    onDiscard,
    rendered: render(
      <I18nextProvider i18n={i18n}>
        <OfflineActionBanner rows={rows} onRetry={onRetry} onDiscard={onDiscard} />
      </I18nextProvider>,
    ),
  }
}

afterEach(() => {
  void i18n.changeLanguage('de')
})

describe('OfflineActionBanner', () => {
  it('renders nothing when there are no rows', () => {
    const { rendered } = renderBanner([])
    expect(rendered.container.firstChild).toBeNull()
  })

  it('renders a conflict row with the error code and the server status', () => {
    const { rendered } = renderBanner([conflictRow])

    expect(rendered.container.firstChild).not.toBeNull()
    expect(screen.getByText('Quittieren')).toBeTruthy()
    expect(screen.getByText('Konflikt')).toBeTruthy()
    expect(
      screen.getByText('Konflikt: invalid_transition – aktueller Status ACCEPTED'),
    ).toBeTruthy()
  })

  it('offers retry and discard for a conflict row', () => {
    const { onRetry, onDiscard } = renderBanner([conflictRow])

    fireEvent.click(screen.getByRole('button', { name: 'Wiederholen' }))
    expect(onRetry).toHaveBeenCalledWith(conflictRow)

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))
    expect(onDiscard).toHaveBeenCalledWith(1)
  })

  it('offers retry but no discard for a queued row', () => {
    const { onRetry, onDiscard } = renderBanner([queuedRow])

    expect(screen.getByText('Kommentar')).toBeTruthy()
    expect(screen.getByText('wartend')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wiederholen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).not.toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Wiederholen' }))
    expect(onRetry).toHaveBeenCalledWith(queuedRow)
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
