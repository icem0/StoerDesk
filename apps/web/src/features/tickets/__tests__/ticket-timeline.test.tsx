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

/** The position of a marker on the axis in percent. */
function markerLeft(marker: Element): number {
  const match = /left:\s*([\d.]+)%/.exec(marker.getAttribute('style') ?? '')
  return match === null ? Number.NaN : Number(match[1])
}

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

    const marker = rendered.container.querySelector('[data-testid="timeline-marker"]')
    expect(marker?.getAttribute('title')).toContain('Meldung eingegangen')
  })

  it('shows the capture time next to the report time of a backdated report', () => {
    const reportedAt = at(-20)
    const receivedAt = at(0)

    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={reportedAt}
          receivedAt={receivedAt}
          deadlineAt={at(52)}
          stoppedAt={null}
          markers={[
            { type: 'reported', at: reportedAt },
            { type: 'created', at: receivedAt },
          ]}
          deadlineHours={72}
          scaleSuffix="Std"
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Erfasst am')).toBeTruthy()
    const marker = rendered.container.querySelector('[data-testid="timeline-marker"]')
    expect(markerLeft(marker as Element)).toBeCloseTo(0, 5)
    expect(marker?.getAttribute('title')).toContain('Meldung gemeldet')
  })

  it('puts the milestone markers on the bar and the report on the start point', () => {
    const reportedAt = at(-2)
    const deadlineAt = at(70)

    const rendered = render(
      <I18nextProvider i18n={i18n}>
        <TicketTimeline
          reportedAt={reportedAt}
          deadlineAt={deadlineAt}
          stoppedAt={null}
          markers={[
            { type: 'created', at: reportedAt },
            { type: 'accepted', at: at(34) },
          ]}
          deadlineHours={72}
          scaleSuffix="Std"
        />
      </I18nextProvider>,
    )

    const markers = rendered.container.querySelectorAll('[data-testid="timeline-marker"]')
    expect(markers).toHaveLength(2)

    const created = markers.item(0)
    // The report marker is a whole dot on the start point of the axis.
    expect(markerLeft(created)).toBeCloseTo(0, 5)
    expect(created.getAttribute('style')).toContain('translate(-50%, -50%)')
    expect(created.closest('.overflow-hidden')).toBeNull()
    expect(created.getAttribute('title')).toContain('Meldung eingegangen')

    const accepted = markers.item(1)
    expect(markerLeft(accepted)).toBeCloseTo(50, 5)
    expect(accepted.getAttribute('title')).toContain('Auftrag angenommen')

    const deadline = rendered.container.querySelector('[data-testid="timeline-deadline"]')
    expect(deadline?.getAttribute('title')).toContain('Frist')
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
