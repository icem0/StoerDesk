import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '../../../i18n'
import { TicketTimeline } from '../ticket-timeline'

const HOUR = 60 * 60 * 1000

/** A timestamp `hours` hours away from the moment the fixtures were built. */
function at(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString()
}

afterEach(() => {
  void i18n.changeLanguage('de')
})

describe('TicketTimeline', () => {
  it('renders a green running bar with the remaining time', () => {
    const reportedAt = at(-2)
    const deadlineAt = at(70)

    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={reportedAt}
          deadlineAt={deadlineAt}
          stoppedAt={null}
          markers={[{ type: 'created', at: reportedAt }]}
          deadlineHours={72}
          scaleSuffix="Std"
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Zeitlinie')).toBeTruthy()
    expect(rendered.container.querySelector('.bg-green-500')).toBeTruthy()
    expect(screen.getByText(/Noch \d+ Std\./)).toBeTruthy()

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
          markers={[]}
          deadlineHours={72}
          scaleSuffix="Std"
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
          markers={[]}
          deadlineHours={72}
          scaleSuffix="Std"
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Bei Quittierung angehalten')).toBeTruthy()
    expect(rendered.container.querySelector('.bg-slate-500')).toBeTruthy()
  })
})
