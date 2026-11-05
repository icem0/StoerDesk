import { describe, expect, it } from 'vitest'

import { escalationRulesFor } from '../escalation'

const MINUTE = 60 * 1000

function minutesFor(priority: string, key: string): number {
  const rule = escalationRulesFor(priority).find((candidate) => candidate.key === key)

  if (rule === undefined) {
    throw new Error(`missing rule ${key}`)
  }

  return rule.thresholdMs / MINUTE
}

describe('escalationRulesFor', () => {
  it('returns the six documented rules', () => {
    expect(escalationRulesFor('normal').map((rule) => rule.key)).toEqual([
      'new_without_review',
      'work_order_without_distribution',
      'offered_without_claim',
      'assigned_without_accept',
      'deadline_80_percent',
      'deadline_exceeded',
    ])
  })

  it('uses the normal defaults', () => {
    expect(minutesFor('normal', 'new_without_review')).toBe(15)
    expect(minutesFor('normal', 'work_order_without_distribution')).toBe(30)
    expect(minutesFor('normal', 'offered_without_claim')).toBe(20)
    expect(minutesFor('normal', 'assigned_without_accept')).toBe(15)
  })

  it('uses the critical defaults', () => {
    expect(minutesFor('critical', 'new_without_review')).toBe(5)
    expect(minutesFor('critical', 'offered_without_claim')).toBe(10)
  })

  it('applies a positive override and ignores an invalid one', () => {
    expect(
      minutesFor(
        'normal',
        'new_without_review',
      ),
    ).toBe(15)

    const overridden = escalationRulesFor('normal', {
      new_without_review: { minutes: 4 },
    }).find((rule) => rule.key === 'new_without_review')
    expect(overridden?.thresholdMs).toBe(4 * MINUTE)

    const invalid = escalationRulesFor('normal', {
      new_without_review: { minutes: 0 },
    }).find((rule) => rule.key === 'new_without_review')
    expect(invalid?.thresholdMs).toBe(15 * MINUTE)
  })

  it('keeps the deadline percentages', () => {
    const rules = escalationRulesFor('low')

    expect(rules.find((rule) => rule.key === 'deadline_80_percent')?.percent).toBe(80)
    expect(rules.find((rule) => rule.key === 'deadline_exceeded')?.percent).toBe(100)
  })
})
