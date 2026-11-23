import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '../../i18n'
import { EscalationAssigneePool } from '../escalation-assignee-pool'

/**
 * The pool of the office (§7.14, ADR-0039, WP-M19-06): the order of the list
 * is the order of the refusal chain — the buttons _up_ and _down_ move a
 * member, a member is removed and a technician is added at the end.
 */

const ALPHA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Alpha' }
const BETA = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Beta' }
const GAMMA = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Gamma' }

describe('the pool of the office', () => {
  it('moves a member up and down and removes him', () => {
    const saved: { id: string; name: string }[][] = []
    const onPool = vi.fn((next: { id: string; name: string }[]) => {
      saved.push(next)
    })

    render(
      <I18nextProvider i18n={i18n}>
        <EscalationAssigneePool
          pool={[ALPHA, BETA, GAMMA]}
          users={[ALPHA, BETA, GAMMA]}
          canWrite={true}
          onPool={onPool}
        />
      </I18nextProvider>,
    )

    fireEvent.click(screen.getByTestId('escalation-pool-down-0'))
    expect(saved[0]).toStrictEqual([BETA, ALPHA, GAMMA])

    fireEvent.click(screen.getByTestId('escalation-pool-up-2'))
    expect(saved[1]).toStrictEqual([ALPHA, GAMMA, BETA])

    fireEvent.click(screen.getByTestId('escalation-pool-remove-1'))
    expect(saved[2]).toStrictEqual([ALPHA, GAMMA])
  })

  it('adds a technician at the end of the list', () => {
    const saved: { id: string; name: string }[][] = []
    const onPool = vi.fn((next: { id: string; name: string }[]) => {
      saved.push(next)
    })

    render(
      <I18nextProvider i18n={i18n}>
        <EscalationAssigneePool
          pool={[ALPHA]}
          users={[ALPHA, BETA]}
          canWrite={true}
          onPool={onPool}
        />
      </I18nextProvider>,
    )

    fireEvent.change(screen.getByTestId('escalation-pool-add'), {
      target: { value: BETA.id },
    })

    expect(saved[0]).toStrictEqual([ALPHA, BETA])
  })

  it('names the empty pool', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <EscalationAssigneePool pool={[]} users={[ALPHA]} canWrite={false} onPool={vi.fn()} />
      </I18nextProvider>,
    )

    expect(screen.getByTestId('escalation-pool-empty')).toBeTruthy()
  })
})
