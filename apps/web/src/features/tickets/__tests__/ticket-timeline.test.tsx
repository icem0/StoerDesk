import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketTimeline } from '../ticket-timeline'

const HOUR = 60 * 60 * 1000

/** A timestamp `hours` hours away from the moment the fixtures were built. */
function at(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString()
}

const originalPrompt = window.prompt

afterEach(() => {
  window.prompt = originalPrompt
  void i18n.changeLanguage('de')
})

describe('TicketTimeline', () => {
  it('renders a green running bar with the remaining time and a pause button', () => {
    const reportedAt = at(-2)
    const deadlineAt = at(70)
    const onPause = vi.fn().mockResolvedValue(undefined)

    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={reportedAt}
          deadlineAt={deadlineAt}
          stoppedAt={null}
          pauses={[]}
          markers={[{ type: 'created', at: reportedAt }]}
          status="NEW"
          onPause={onPause}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Zeitlinie')).toBeTruthy()
    expect(rendered.container.querySelector('.bg-green-500')).toBeTruthy()
    expect(screen.getByText(/Noch \d+ Std\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause starten' })).toBeTruthy()

    const marker = rendered.container.querySelector('[title]')
    expect(marker?.getAttribute('title')).toBe(`created · ${reportedAt}`)
  })

  it('marks an overdue running ticket in red with the overdue time', () => {
    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={at(-80)}
          deadlineAt={at(-8)}
          stoppedAt={null}
          pauses={[]}
          markers={[]}
          status="NEW"
        />
      </I18nextProvider>,
    )

    expect(screen.getByText(/Seit \d+ Std\. überfällig/)).toBeTruthy()
    expect(rendered.container.querySelector('.bg-rose-500')).toBeTruthy()
  })

  it('stops at acknowledgement and hides the pause controls', () => {
    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={at(-72)}
          deadlineAt={at(0)}
          stoppedAt={at(-30)}
          pauses={[]}
          markers={[]}
          status="ACKNOWLEDGED"
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Bei Quittierung angehalten')).toBeTruthy()
    expect(rendered.container.querySelector('.bg-slate-500')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pause starten' })).not.toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pause beenden' })).not.toBeTruthy()
  })

  it('offers resume and shows the reason while a pause is open', () => {
    const onResume = vi.fn().mockResolvedValue(undefined)

    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={at(-2)}
          deadlineAt={at(70)}
          stoppedAt={null}
          pauses={[{ startedAt: at(-1), endedAt: null, reason: 'Spedition at the unloading area' }]}
          markers={[]}
          status="IN_REVIEW"
          onResume={onResume}
        />
      </I18nextProvider>,
    )

    expect(rendered.container.querySelector('.bg-green-500')).toBeTruthy()
    expect(screen.getByText(/Offene Pause: .+/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause beenden' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pause starten' })).not.toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pause beenden' }))
    expect(onResume).toHaveBeenCalled()
  })

  it('sends the trimmed pause reason when the pause button is clicked', () => {
    const onPause = vi.fn().mockResolvedValue(undefined)
    window.prompt = () => 'Spedition at the unloading area '

    render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={at(-2)}
          deadlineAt={at(70)}
          stoppedAt={null}
          pauses={[]}
          markers={[]}
          status="IN_REVIEW"
          onPause={onPause}
        />
      </I18nextProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pause starten' }))
    expect(onPause).toHaveBeenCalledWith('Spedition at the unloading area')
  })
})
