import { describe, expect, it } from 'vitest'

import { escalationRuleTimerCondition, normalizeEscalationRows } from '../config'
import { escalationConfigSchema } from '@stoerdesk/shared'

const STAGE = {
  key: 'review',
  names: { de: 'Prüfung', en: 'Review' },
  position: 2,
  active: true,
  predecessor: 'new',
  reachedBy: ['review_started'],
}

const NEW_STAGE = {
  key: 'new',
  names: { de: 'Neu', en: 'New' },
  position: 1,
  active: true,
  predecessor: null,
  reachedBy: [],
}

describe('the read of an escalation configuration of an older installation', () => {
  it('answers the empty condition of an old rule', () => {
    const rules = [
      {
        key: 'review#1',
        stageKey: 'review',
        reference: 'received_at',
        minutes: { low: 15, normal: 15, high: 15, critical: 5 },
        percent: null,
        condition: {},
        actions: [],
        active: true,
      },
    ]
    const { rules: normalized } = normalizeEscalationRows([NEW_STAGE, STAGE], rules)

    // The empty condition takes the timer of the former clock fields (ADR-0064).
    expect(normalized[0]?.condition).toEqual({
      all: [
        {
          field: 'timer_expired',
          operator: 'expired',
          value: {
            reference: 'received_at',
            minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          },
        },
      ],
    })
    expect(normalized[0]?.reference).toBeNull()
    expect(normalized[0]?.minutes).toBeNull()
  })

  it('keeps an old assign action that names a technician as a target of the kind user', () => {
    const rules = [
      {
        key: 'assignment#1',
        stageKey: 'review',
        reference: 'received_at',
        minutes: { low: 10, normal: 10, high: 10, critical: 10 },
        percent: null,
        condition: { all: [] },
        active: true,
        actions: [
          {
            key: 'assignment#1#1',
            type: 'assign',
            mode: 'user',
            user: '11111111-1111-4111-8111-111111111111',
            acceptance: 'true',
            condition: {},
          },
        ],
      },
    ]
    const { rules: normalized } = normalizeEscalationRows([NEW_STAGE, STAGE], rules)
    const actions = normalized[0]?.actions as unknown as Record<string, unknown>[]
    const action = actions[0]

    expect(action?.target).toEqual({ kind: 'user', id: '11111111-1111-4111-8111-111111111111' })
    expect(action?.acceptance).toBe(true)
    expect(action?.condition).toEqual({ all: [] })
  })

  it('drops an action that named the pool of the office and a notify action without a recipient', () => {
    const rules = [
      {
        key: 'assignment#1',
        stageKey: 'review',
        reference: 'received_at',
        minutes: { low: 10, normal: 10, high: 10, critical: 10 },
        percent: null,
        condition: { all: [] },
        active: true,
        actions: [
          { key: 'assignment#1#1', type: 'assign', mode: 'pool', condition: { all: [] } },
          { key: 'assignment#1#2', type: 'notify', channels: [], condition: { all: [] } },
          { key: 'assignment#1#3', type: 'notify', channels: ['ntfy'], condition: { all: [] } },
        ],
      },
    ]
    const { rules: normalized } = normalizeEscalationRows([NEW_STAGE, STAGE], rules)

    expect(
      (normalized[0]?.actions as Record<string, unknown>[]).map((action) => action.key),
    ).toEqual(['assignment#1#3'])
  })

  it('answers a stage without the name of a locale and with the position of the row default', () => {
    const { stages: normalized } = normalizeEscalationRows(
      [
        {
          key: 'night_shift',
          names: { de: 'Nachtdienst' },
          position: 0,
          active: true,
          predecessor: 'review',
          reachedBy: [],
        },
      ],
      [],
    )
    const stage = normalized[0]

    expect(stage?.names).toEqual({ de: 'Nachtdienst', en: 'night_shift' })
    expect(stage?.position).toBe(1)
  })

  it('keeps the clock of the stage of a rule that carries both clocks', () => {
    const rules = [
      {
        key: 'review#1',
        stageKey: 'review',
        reference: 'received_at',
        minutes: { low: 15, normal: 15, high: 15, critical: 5 },
        percent: 80,
        condition: { all: [] },
        actions: [],
        active: true,
      },
    ]
    const { rules: normalized } = normalizeEscalationRows([NEW_STAGE, STAGE], rules)

    expect(normalized[0]?.percent).toBeNull()
    expect(normalized[0]?.minutes).toBeNull()
    expect(normalized[0]?.condition).toEqual({
      all: [
        {
          field: 'timer_expired',
          operator: 'expired',
          value: {
            reference: 'received_at',
            minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          },
        },
      ],
    })
  })

  it('answers a configuration that follows the contract after the normalization', () => {
    const rules = [
      {
        key: 'review',
        stageKey: 'review',
        reference: 'acknowledged',
        minutes: { low: 15, normal: 15, high: 15, critical: 5 },
        percent: null,
        condition: null,
        actions: [],
        active: true,
      },
    ]
    const parsed = escalationConfigSchema.safeParse(
      normalizeEscalationRows([NEW_STAGE, STAGE], rules),
    )

    expect(parsed.success).toBe(true)
  })
})

describe('the former clock fields of a rule become a timer (ADR-0064)', () => {
  const minutes = { low: 15, normal: 15, high: 15, critical: 5 }
  const stages = [NEW_STAGE, STAGE]
  const timer = (value: unknown) => ({ field: 'timer_expired', operator: 'expired', value })

  it('turns the reference and the minutes of a stage rule into a timer', () => {
    expect(
      escalationRuleTimerCondition(
        { stageKey: 'review', reference: 'received_at', minutes, percent: null, condition: {} },
        stages,
      ),
    ).toEqual({ all: [timer({ reference: 'received_at', minutes })] })
  })

  it('starts a rule without a reference at the clock of its stage', () => {
    const workOrder = { ...STAGE, key: 'work_order', position: 3, predecessor: 'review' }

    expect(
      escalationRuleTimerCondition(
        { stageKey: 'work_order', reference: null, minutes, percent: null, condition: null },
        [...stages, workOrder],
      ),
    ).toEqual({ all: [timer({ reference: 'review_started', minutes })] })
  })

  it('turns the percentage of a deadline rule into a percent timer', () => {
    expect(
      escalationRuleTimerCondition(
        { stageKey: null, reference: null, minutes: null, percent: 80, condition: { all: [] } },
        stages,
      ),
    ).toEqual({ all: [timer({ percent: 80 })] })
  })

  it('merges the timer with an old condition into one all group', () => {
    const priority = { field: 'priority', operator: 'eq', value: 'critical' }
    const any = { any: [priority] }

    expect(
      escalationRuleTimerCondition(
        {
          stageKey: 'review',
          reference: 'received_at',
          minutes,
          percent: null,
          condition: { all: [priority] },
        },
        stages,
      ),
    ).toEqual({ all: [timer({ reference: 'received_at', minutes }), priority] })
    expect(
      escalationRuleTimerCondition(
        { stageKey: 'review', reference: 'received_at', minutes, percent: null, condition: any },
        stages,
      ),
    ).toEqual({ all: [timer({ reference: 'received_at', minutes }), any] })
  })

  it('keeps a condition that already carries a timer and a rule without a clock', () => {
    const carried = { all: [timer({ percent: 100 })] }

    expect(
      escalationRuleTimerCondition(
        {
          stageKey: 'review',
          reference: 'received_at',
          minutes,
          percent: null,
          condition: carried,
        },
        stages,
      ),
    ).toEqual(carried)
    expect(
      escalationRuleTimerCondition(
        {
          stageKey: 'review',
          reference: null,
          minutes: null,
          percent: null,
          condition: { all: [] },
        },
        stages,
      ),
    ).toEqual({ all: [] })
  })
})
