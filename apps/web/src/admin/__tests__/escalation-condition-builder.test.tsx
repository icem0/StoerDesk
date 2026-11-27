import { fireEvent, render, screen, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { escalationConditionSchema, type EscalationCondition } from '@stoerdesk/shared'
import { i18n } from '../../i18n'
import {
  EscalationConditionBuilder,
  conditionFields,
  defaultTimerValue,
} from '../escalation-condition-builder'

const TIMER = {
  field: 'timer_expired',
  operator: 'expired',
  value: { reference: 'offered', minutes: { low: 20, normal: 20, high: 20, critical: 10 } },
} as unknown as EscalationCondition

function renderBuilder(initial: EscalationCondition, canWrite: boolean) {
  const onCondition = vi.fn()

  void i18n.changeLanguage('de')
  render(
    <I18nextProvider i18n={i18n}>
      <EscalationConditionBuilder initial={initial} canWrite={canWrite} onCondition={onCondition} />
    </I18nextProvider>,
  )

  return onCondition
}

describe('the timer of the condition builder (ADR-0064, WP-M45-03)', () => {
  it('offers the timer leaf of the shared contract with its two operators', () => {
    expect(conditionFields()).toContainEqual({
      field: 'timer_expired',
      operators: ['expired', 'notExpired'],
    })
    expect(
      escalationConditionSchema.safeParse({
        all: [{ field: 'timer_expired', operator: 'expired', value: defaultTimerValue() }],
      }).success,
    ).toBe(true)
  })

  it('shows the start value and the minutes per priority and stays read-only without the permission', () => {
    renderBuilder({ all: [TIMER] }, false)

    const timer = screen.getByTestId('escalation-condition-timer')
    const start = within(timer).getByLabelText('Start-Ereignis') as HTMLSelectElement

    expect(start.value).toBe('offered')
    expect(start.disabled).toBe(true)
    expect(
      ['Niedrig', 'Normal', 'Hoch', 'Kritisch'].map(
        (label) => (within(timer).getByLabelText(label) as HTMLInputElement).value,
      ),
    ).toEqual(['20', '20', '20', '10'])
    expect(within(timer).getByRole('button', { name: /Timer/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Bedingung hinzufügen' })).toBeNull()
  })

  it('starts a leaf that stops being a timer with the first operator of its field', () => {
    const onCondition = renderBuilder({ all: [TIMER] }, true)

    fireEvent.change(screen.getByLabelText('Feld'), { target: { value: 'priority' } })

    expect(screen.queryByTestId('escalation-condition-timer')).toBeNull()
    expect(onCondition).toHaveBeenLastCalledWith({
      all: [{ field: 'priority', operator: 'eq', value: '' }],
    })
  })
})
