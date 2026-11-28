import { fireEvent, render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import type { EscalationCondition } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import {
  EscalationConditionBuilder,
  conditionFields,
  defaultTimerValue,
  timerConditionValue,
} from '../escalation-condition-builder'

/**
 * The timer leaf of the condition builder (ADR-0064, WP-M45-04): the start
 * value, the minutes per priority or the percentage of the ticket deadline.
 */

const MINUTES = { low: 30, normal: 20, high: 10, critical: 5 }
const TIMER: EscalationCondition = {
  all: [
    {
      field: 'timer_expired',
      operator: 'expired',
      value: { reference: 'review_started', minutes: MINUTES },
    },
  ],
}

function renderBuilder(initial: EscalationCondition, canWrite = true) {
  const onCondition = vi.fn()

  void i18n.changeLanguage('de')
  render(
    <I18nextProvider i18n={i18n}>
      <EscalationConditionBuilder initial={initial} canWrite={canWrite} onCondition={onCondition} />
    </I18nextProvider>,
  )

  return onCondition
}

describe('the timer of the condition builder', () => {
  it('knows the leaf and its operators from the shared contract', () => {
    expect(conditionFields()).toContainEqual({
      field: 'timer_expired',
      operators: ['expired', 'notExpired'],
    })
  })

  it('types the value of a timer', () => {
    expect(timerConditionValue('offered', MINUTES, 50)).toEqual({
      reference: 'offered',
      minutes: MINUTES,
    })
    expect(timerConditionValue('deadline', MINUTES, 80)).toEqual({ percent: 80 })
    expect(defaultTimerValue()).toEqual({
      reference: 'received_at',
      minutes: { low: 15, normal: 15, high: 15, critical: 5 },
    })
  })

  it('edits the start value and the minutes of a priority', () => {
    const onCondition = renderBuilder(TIMER)
    const timer = screen.getByTestId('escalation-condition-timer')

    expect(timer.textContent).toContain('Wartezeit')

    fireEvent.change(within(timer).getByLabelText('Startwert'), { target: { value: 'assigned' } })

    expect(onCondition).toHaveBeenLastCalledWith({
      all: [
        {
          field: 'timer_expired',
          operator: 'expired',
          value: { reference: 'assigned', minutes: MINUTES },
        },
      ],
    })

    fireEvent.change(within(timer).getByLabelText('Hoch (Min.)'), { target: { value: '12' } })

    expect(onCondition).toHaveBeenLastCalledWith({
      all: [
        {
          field: 'timer_expired',
          operator: 'expired',
          value: { reference: 'assigned', minutes: { ...MINUTES, high: 12 } },
        },
      ],
    })
  })

  it('switches to the percentage of the ticket deadline', () => {
    const onCondition = renderBuilder(TIMER)
    const timer = screen.getByTestId('escalation-condition-timer')

    fireEvent.change(within(timer).getByLabelText('Startwert'), { target: { value: 'deadline' } })

    expect(onCondition).toHaveBeenLastCalledWith({
      all: [{ field: 'timer_expired', operator: 'expired', value: { percent: 100 } }],
    })
    expect(within(timer).queryByLabelText('Niedrig (Min.)')).toBeNull()
    expect(within(timer).getByLabelText('Prozent der Frist')).toBeTruthy()
  })

  it('disables the timer in the read-only mode', () => {
    renderBuilder(TIMER, false)

    const timer = screen.getByTestId('escalation-condition-timer')

    expect((within(timer).getByLabelText('Startwert') as HTMLSelectElement).disabled).toBe(true)
    expect((within(timer).getByLabelText('Kritisch (Min.)') as HTMLInputElement).disabled).toBe(
      true,
    )
    expect((screen.getByLabelText('Operator') as HTMLSelectElement).disabled).toBe(true)
  })
})
