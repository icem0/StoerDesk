import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
  ESCALATION_ACTION_TYPES,
  ESCALATION_STAGE_KEYS,
  escalationActionKey,
  escalationConfigSchema,
  escalationFirstStageKey,
  escalationConditionDepth,
  escalationConditionLeafCount,
  escalationConditionSchema,
  escalationRuleKey,
  escalationStageClockEvents,
  escalationTimerLeaves,
  escalationTargetSchema,
  evaluateEscalationCondition,
  validateEscalationStageChain,
  type EscalationCondition,
  type EscalationConditionLeaf,
  type EscalationFacts,
  type EscalationStageConfig,
} from '../schemas/escalation-config.js'

const facts: EscalationFacts = {
  priority: 'high',
  status: 'IN_REVIEW',
  source: 'QR',
  systemType: 'BMA',
  objectExternalType: 'BMA 2000',
  assigned: false,
  deadlinePercent: 42,
  elapsedMinutes: 17,
  paused: false,
  stageReached: ['review'],
}

describe('the escalation stages', () => {
  it('are the milestones of the workflow', () => {
    expect([...ESCALATION_STAGE_KEYS]).toEqual([
      'new',
      'review',
      'work_order',
      'assignment',
      'acceptance',
      'acknowledgement',
    ])
  })

  it('carry a German and an English name', () => {
    for (const stage of DEFAULT_WORKFLOW_ESCALATION_STAGES) {
      expect(stage.names.de).toBeTruthy()
      expect(stage.names.en).toBeTruthy()
    }
  })

  it('accept a stage outside the default chain', () => {
    const result = escalationConfigSchema.safeParse({
      stages: [
        {
          key: 'office',
          names: { de: 'Büro', en: 'Office' },
          position: 1,
          active: true,
          predecessor: null,
          reachedBy: ['review_started'],
        },
      ],
      rules: [],
    })

    expect(result.success).toBe(true)
  })

  it('carry their predecessor and their reaching events', () => {
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[0]?.key).toBe('new')
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[0]?.predecessor).toBeNull()
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[0]?.reachedBy).toEqual([])
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[1]?.predecessor).toBe('new')
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[2]?.predecessor).toBe('review')
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[3]?.reachedBy).toEqual(['assigned', 'offered'])
  })
})

describe('the clock of a stage', () => {
  const chain = [
    { key: 'new', predecessor: null, reachedBy: [] },
    { key: 'review', predecessor: 'new', reachedBy: ['review_started'] },
    { key: 'work_order', predecessor: 'review', reachedBy: ['work_order_set'] },
  ]

  it('starts with the events that reach its predecessor', () => {
    expect(escalationStageClockEvents('work_order', chain)).toEqual(['review_started'])
  })

  it('is the report for the stage without a predecessor', () => {
    expect(escalationStageClockEvents('new', chain)).toEqual(['received_at'])
  })

  it('is inherited from a predecessor that is never reached', () => {
    expect(escalationStageClockEvents('review', chain)).toEqual(['received_at'])
  })
})

describe('the first stage of a chain', () => {
  it('is the stage without a predecessor with the smallest position', () => {
    expect(
      escalationFirstStageKey([
        { key: 'review', position: 1, predecessor: null },
        { key: 'work_order', position: 2, predecessor: 'review' },
      ]),
    ).toBe('review')
  })

  it('names the first stage of a chain with two stages without a predecessor', () => {
    expect(
      escalationFirstStageKey([
        { key: 'review', position: 1, predecessor: null },
        { key: 'extra', position: 3, predecessor: null },
      ]),
    ).toBe('review')
  })

  it('is nothing without a stage without a predecessor', () => {
    expect(
      escalationFirstStageKey([{ key: 'work_order', position: 2, predecessor: 'review' }]),
    ).toBeNull()
  })
})

describe('the stage chain validator', () => {
  const events = [
    'review_started',
    'work_order_set',
    'assigned',
    'offered',
    'accepted',
    'acknowledged',
  ]

  function stage(
    key: string,
    position: number,
    predecessor: string | null,
    reachedBy: string[] = [],
  ): EscalationStageConfig {
    return {
      key,
      names: { de: key, en: key },
      position,
      active: true,
      predecessor,
      reachedBy,
    }
  }

  it('accepts the default chain and an intermediate stage', () => {
    expect(validateEscalationStageChain(DEFAULT_WORKFLOW_ESCALATION_STAGES, events)).toEqual([])
    expect(
      validateEscalationStageChain(
        [
          stage('review', 1, null, ['review_started']),
          stage('work_order', 2, 'review', ['work_order_set']),
          stage('night_shift', 3, 'work_order', ['assigned']),
          stage('acceptance', 4, 'night_shift', ['accepted']),
        ],
        events,
      ),
    ).toEqual([])
  })

  it('names an unknown predecessor, a cycle and a contradictory position', () => {
    expect(
      validateEscalationStageChain(
        [stage('review', 1, null), stage('office', 2, 'missing')],
        events,
      ),
    ).toContain('stages.1.predecessor')

    expect(
      validateEscalationStageChain(
        [stage('review', 1, 'office'), stage('office', 2, 'review')],
        events,
      ),
    ).toContain('stages.0.predecessor')

    expect(
      validateEscalationStageChain(
        [stage('review', 2, null), stage('office', 1, 'review')],
        events,
      ),
    ).toContain('stages.1.position')
  })

  it('names a second stage without a predecessor', () => {
    const issues = validateEscalationStageChain(
      [
        { ...DEFAULT_WORKFLOW_ESCALATION_STAGES[0]! },
        {
          key: 'extra',
          names: { de: 'Zusatz', en: 'Extra' },
          position: 6,
          active: true,
          predecessor: null,
          reachedBy: [],
        },
      ],
      ['review_started', 'work_order_set', 'assigned', 'offered', 'accepted', 'acknowledged'],
    )

    expect(issues).toContain('stages.1.predecessor')
  })

  it('names a duplicate key and an unknown reaching event', () => {
    expect(
      validateEscalationStageChain([stage('review', 1, null), stage('review', 2, null)], events),
    ).toContain('stages.1.key')

    expect(
      validateEscalationStageChain([stage('review', 1, null, ['not_an_event'])], events),
    ).toContain('stages.0.reachedBy.0')
  })
})

describe('the default rules', () => {
  it('cover the rule of the stage NEW, the former status rules and the deadline rules', () => {
    const keys = DEFAULT_WORKFLOW_ESCALATION_RULES.map((rule) => rule.key)

    expect(keys).toEqual([
      'new#1',
      'review#1',
      'work_order#1',
      'assignment#1',
      'acceptance#1',
      'acceptance#2',
      'acknowledgement#1',
      'deadline#1',
      'deadline#2',
    ])
  })

  it('keep the deadlines of ADR-0008', () => {
    const review = DEFAULT_WORKFLOW_ESCALATION_RULES.find((rule) => rule.stageKey === 'review')
    const offer = DEFAULT_WORKFLOW_ESCALATION_RULES.find(
      (rule) => rule.stageKey === 'acceptance' && rule.reference === 'offered',
    )
    const assignment = DEFAULT_WORKFLOW_ESCALATION_RULES.find(
      (rule) => rule.stageKey === 'acceptance' && rule.reference === 'assigned',
    )

    expect(review?.minutes).toEqual({ low: 15, normal: 15, high: 15, critical: 5 })
    expect(offer?.minutes).toEqual({ low: 20, normal: 20, high: 20, critical: 10 })
    expect(assignment?.minutes).toEqual({ low: 15, normal: 15, high: 15, critical: 15 })
  })

  it('are a valid configuration', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: DEFAULT_WORKFLOW_ESCALATION_RULES,
    })

    expect(result.success).toBe(true)
  })
})

describe('the numbered keys of the taxonomy (§7.5)', () => {
  it('names a rule by the key of its stage and its number', () => {
    expect(escalationRuleKey('review', 1)).toBe('review#1')
    expect(escalationRuleKey('acceptance', 2)).toBe('acceptance#2')
  })

  it('names a rule without a stage under the root of the deadline rules', () => {
    expect(escalationRuleKey(null, 1)).toBe('deadline#1')
  })

  it('names an action by the key of its rule and its number', () => {
    expect(escalationActionKey('review#1', 1)).toBe('review#1#1')
    expect(escalationActionKey('review#1', 3)).toBe('review#1#3')
  })

  it('accepts the composed keys in the contract', () => {
    expect(
      escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [
          {
            key: 'review#1',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 15, normal: 15, high: 15, critical: 5 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'review#1#1',
                type: 'history',
                text: 'Das Büro wurde informiert.',
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      }).success,
    ).toBe(true)
  })

  it('rejects a key with a number that does not start at one', () => {
    expect(
      escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [
          {
            key: 'review#0',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 15, normal: 15, high: 15, critical: 5 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('the action contract', () => {
  it('carries the fourth action type status_change', () => {
    expect(ESCALATION_ACTION_TYPES).toContain('status_change')
  })

  it('accepts a status_change action with a status key', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [
        {
          key: 'review',
          stageKey: 'review',
          reference: 'received_at',
          minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          percent: null,
          condition: { all: [] },
          actions: [
            {
              key: 'to_work_order',
              type: 'status_change',
              toStatus: 'WORK_ORDER_CREATED',
              condition: { all: [] },
            },
          ],
          active: true,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a status_change action whose target is no status key', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [
        {
          key: 'review',
          stageKey: 'review',
          reference: 'received_at',
          minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          percent: null,
          condition: { all: [] },
          actions: [
            {
              key: 'to_lower',
              type: 'status_change',
              toStatus: 'work_order',
              condition: { all: [] },
            },
          ],
          active: true,
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('the offer and assign actions', () => {
  const poolTarget = { kind: 'pool', id: '0f5b9a4c-6c1e-4a51-9c1b-2f9d3f7a4b21' }
  const groupTarget = { kind: 'group', id: '7c2b1d84-9a44-4e93-8b2a-1f6c5d0e9b33' }
  const userTarget = { kind: 'user', id: '2d7c5e18-3b4a-4f62-8c9d-1e0a7b6c5d44' }

  it('carries the two new action types', () => {
    expect(ESCALATION_ACTION_TYPES).toContain('offer')
    expect(ESCALATION_ACTION_TYPES).toContain('assign')
  })

  it('accepts an offer action with a pool and an assign action with a group', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [
        {
          key: 'review',
          stageKey: 'review',
          reference: 'received_at',
          minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          percent: null,
          condition: { all: [] },
          actions: [
            {
              key: 'offer_the_pool',
              type: 'offer',
              target: poolTarget,
              condition: { all: [] },
            },
            {
              key: 'assign_the_group',
              type: 'assign',
              target: groupTarget,
              condition: { all: [] },
            },
          ],
          active: true,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('accepts a single technician as the target of an assignment', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [
        {
          key: 'review',
          stageKey: 'review',
          reference: 'received_at',
          minutes: { low: 15, normal: 15, high: 15, critical: 5 },
          percent: null,
          condition: { all: [] },
          actions: [
            {
              key: 'assign_the_technician',
              type: 'assign',
              target: userTarget,
              condition: { all: [] },
            },
          ],
          active: true,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a target without a kind and one without an id', () => {
    expect(escalationTargetSchema.safeParse({ id: poolTarget.id }).success).toBe(false)
    expect(escalationTargetSchema.safeParse({ kind: 'pool' }).success).toBe(false)
    expect(escalationTargetSchema.safeParse({ kind: 'team', id: poolTarget.id }).success).toBe(
      false,
    )
    expect(escalationTargetSchema.safeParse({ kind: 'pool', id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('the notify action', () => {
  const userTarget = { kind: 'user', id: '2d7c5e18-3b4a-4f62-8c9d-1e0a7b6c5d44' }
  const poolTarget = { kind: 'pool', id: '0f5b9a4c-6c1e-4a51-9c1b-2f9d3f7a4b21' }

  function ruleWith(action: Record<string, unknown>) {
    return {
      key: 'review',
      stageKey: 'review',
      reference: 'received_at',
      minutes: { low: 15, normal: 15, high: 15, critical: 5 },
      percent: null,
      condition: { all: [] },
      actions: [{ key: 'notify_target', type: 'notify', condition: { all: [] }, ...action }],
      active: true,
    }
  }

  it('accepts a target and an ntfy priority without channels', () => {
    for (const target of [userTarget, poolTarget]) {
      const result = escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [ruleWith({ target, priority: 'urgent' })],
      })

      expect(result.success).toBe(true)
    }
  })

  it('accepts the assignees of the ticket as the target', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [ruleWith({ target: { kind: 'assigned' } })],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a target of the notification without a kind', () => {
    expect(
      escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [ruleWith({ target: { id: userTarget.id } })],
      }).success,
    ).toBe(false)
  })

  it('keeps the channel-only action and its priority valid', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [ruleWith({ channels: ['ntfy'], priority: 'high' })],
    })

    expect(result.success).toBe(true)
  })

  it('rejects an action without target and without channel', () => {
    const result = escalationConfigSchema.safeParse({
      stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
      rules: [ruleWith({ channels: [] })],
    })

    expect(result.success).toBe(false)
  })

  it('rejects an unknown target kind and an unknown priority', () => {
    expect(
      escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [ruleWith({ target: { kind: 'group', id: userTarget.id } })],
      }).success,
    ).toBe(false)
    expect(
      escalationConfigSchema.safeParse({
        stages: DEFAULT_WORKFLOW_ESCALATION_STAGES,
        rules: [ruleWith({ target: userTarget, priority: 'max' })],
      }).success,
    ).toBe(false)
  })
})

describe('the condition contract', () => {
  it('rejects a leaf with a value of the wrong type', () => {
    const result = escalationConditionSchema.safeParse({
      field: 'priority',
      operator: 'eq',
      value: 42,
    })

    expect(result.success).toBe(false)
  })

  it('rejects an unknown field', () => {
    const result = escalationConditionSchema.safeParse({
      field: 'reporterName',
      operator: 'eq',
      value: 'anything',
    })

    expect(result.success).toBe(false)
  })

  it('counts the depth and the leaves of a tree', () => {
    const tree: EscalationCondition = {
      all: [
        { field: 'priority', operator: 'eq', value: 'high' },
        {
          any: [{ field: 'status', operator: 'eq', value: 'IN_REVIEW' }],
        },
      ],
    }

    expect(escalationConditionDepth(tree)).toBe(2)
    expect(escalationConditionLeafCount(tree)).toBe(2)
  })
})

describe('the condition evaluation', () => {
  it('matches an empty condition', () => {
    expect(evaluateEscalationCondition({ all: [] }, facts)).toBe(true)
    expect(evaluateEscalationCondition(null, facts)).toBe(true)
  })

  it('compares an enum field', () => {
    expect(
      evaluateEscalationCondition({ field: 'priority', operator: 'eq', value: 'high' }, facts),
    ).toBe(true)
    expect(
      evaluateEscalationCondition({ field: 'priority', operator: 'ne', value: 'high' }, facts),
    ).toBe(false)
    expect(
      evaluateEscalationCondition(
        { field: 'priority', operator: 'in', value: ['high', 'critical'] },
        facts,
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        { field: 'priority', operator: 'notIn', value: ['high', 'critical'] },
        facts,
      ),
    ).toBe(false)
  })

  it('searches a string field case-insensitively', () => {
    expect(
      evaluateEscalationCondition(
        { field: 'objectExternalType', operator: 'contains', value: 'bma 2000' },
        facts,
      ),
    ).toBe(true)
  })

  it('compares a number field', () => {
    expect(
      evaluateEscalationCondition({ field: 'deadlinePercent', operator: 'gte', value: 40 }, facts),
    ).toBe(true)
    expect(
      evaluateEscalationCondition({ field: 'elapsedMinutes', operator: 'gt', value: 30 }, facts),
    ).toBe(false)
  })

  it('compares a boolean field', () => {
    expect(
      evaluateEscalationCondition({ field: 'assigned', operator: 'eq', value: false }, facts),
    ).toBe(true)
    expect(
      evaluateEscalationCondition({ field: 'paused', operator: 'eq', value: true }, facts),
    ).toBe(false)
  })

  it('knows the stages the ticket has reached', () => {
    expect(
      evaluateEscalationCondition(
        { field: 'stageReached', operator: 'eq', value: 'review' },
        facts,
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        { field: 'stageReached', operator: 'ne', value: 'review' },
        facts,
      ),
    ).toBe(false)
    expect(
      evaluateEscalationCondition(
        { field: 'stageReached', operator: 'in', value: ['work_order', 'review'] },
        facts,
      ),
    ).toBe(true)
  })

  it('combines the leaves with all and any', () => {
    const condition: EscalationCondition = {
      all: [
        { field: 'priority', operator: 'in', value: ['high', 'critical'] },
        {
          any: [
            { field: 'status', operator: 'eq', value: 'IN_REVIEW' },
            { field: 'assigned', operator: 'eq', value: true },
          ],
        },
      ],
    }

    expect(evaluateEscalationCondition(condition, facts)).toBe(true)
    expect(evaluateEscalationCondition(condition, { ...facts, priority: 'low' })).toBe(false)
  })
})

describe('the readiness shift in a condition (§7.4, ADR-0030)', () => {
  const pool = '6f0a1b7c-5d4e-4f8a-9b2c-3d4e5f6a7b8c'
  const other = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

  it('matches a pool with a staffed shift', () => {
    expect(
      evaluateEscalationCondition(
        { field: 'shift', operator: 'eq', value: pool },
        { ...facts, staffedPools: [pool] },
      ),
    ).toBe(true)
  })

  it('does not match a pool without a staffed shift', () => {
    expect(
      evaluateEscalationCondition(
        { field: 'shift', operator: 'eq', value: other },
        { ...facts, staffedPools: [pool] },
      ),
    ).toBe(false)
  })

  it('asks for a pool without a shift with ne', () => {
    expect(
      evaluateEscalationCondition(
        { field: 'shift', operator: 'ne', value: other },
        { ...facts, staffedPools: [pool] },
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        { field: 'shift', operator: 'ne', value: pool },
        { ...facts, staffedPools: [pool] },
      ),
    ).toBe(false)
  })

  it('never matches without the readiness of the scan', () => {
    expect(
      evaluateEscalationCondition({ field: 'shift', operator: 'eq', value: pool }, facts),
    ).toBe(false)
    expect(
      evaluateEscalationCondition({ field: 'shift', operator: 'ne', value: pool }, facts),
    ).toBe(false)
  })

  it('accepts the leaf in the contract and refuses a value that is no uuid', () => {
    expect(
      escalationConditionSchema.safeParse({ field: 'shift', operator: 'eq', value: pool }).success,
    ).toBe(true)
    expect(
      escalationConditionSchema.safeParse({ field: 'shift', operator: 'eq', value: 'pool' })
        .success,
    ).toBe(false)
  })
})

describe('the waiting clock as a condition (ADR-0064)', () => {
  const minutes15 = { low: 15, normal: 15, high: 15, critical: 5 }
  const timerLeaf = (value: unknown, operator = 'expired'): EscalationConditionLeaf =>
    ({ field: 'timer_expired', operator, value }) as unknown as EscalationConditionLeaf

  it('accepts both value shapes', () => {
    expect(
      escalationConditionSchema.safeParse(
        timerLeaf({ reference: 'received_at', minutes: minutes15 }),
      ).success,
    ).toBe(true)
    expect(escalationConditionSchema.safeParse(timerLeaf({ percent: 80 })).success).toBe(true)
  })

  it('refuses an incomplete value and a foreign operator', () => {
    expect(
      escalationConditionSchema.safeParse(timerLeaf({ reference: 'received_at' })).success,
    ).toBe(false)
    expect(escalationConditionSchema.safeParse(timerLeaf({ minutes: minutes15 })).success).toBe(
      false,
    )
    expect(escalationConditionSchema.safeParse(timerLeaf({ percent: 0 })).success).toBe(false)
    expect(escalationConditionSchema.safeParse(timerLeaf({ percent: 101 })).success).toBe(false)
    expect(escalationConditionSchema.safeParse(timerLeaf(minutes15, 'gt')).success).toBe(false)
  })

  it('evaluates the delay of the priority of the ticket', () => {
    const withTimer: EscalationFacts = {
      ...facts,
      sinceEvent: { received_at: 20, offered: 5 },
    }

    expect(
      evaluateEscalationCondition(
        timerLeaf({ reference: 'received_at', minutes: minutes15 }),
        withTimer,
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        timerLeaf({ reference: 'offered', minutes: minutes15 }),
        withTimer,
      ),
    ).toBe(false)
    expect(
      evaluateEscalationCondition(
        timerLeaf({ reference: 'received_at', minutes: minutes15 }, 'notExpired'),
        withTimer,
      ),
    ).toBe(false)
  })

  it('never matches an anchor that never happened', () => {
    const withTimer: EscalationFacts = {
      ...facts,
      sinceEvent: { received_at: 20 },
    }

    expect(
      evaluateEscalationCondition(
        timerLeaf({ reference: 'accepted', minutes: minutes15 }),
        withTimer,
      ),
    ).toBe(false)
    expect(
      evaluateEscalationCondition(
        timerLeaf({ reference: 'accepted', minutes: minutes15 }, 'notExpired'),
        withTimer,
      ),
    ).toBe(true)
  })

  it('reads the delay of every priority and falls back to normal', () => {
    const value = {
      reference: 'received_at',
      minutes: { low: 30, normal: 15, high: 10, critical: 5 },
    }
    const at = (priority: string, elapsed: number) =>
      evaluateEscalationCondition(timerLeaf(value), {
        ...facts,
        priority,
        sinceEvent: { received_at: elapsed },
      })

    expect(at('critical', 5)).toBe(true)
    expect(at('critical', 4)).toBe(false)
    expect(at('low', 29)).toBe(false)
    expect(at('low', 30)).toBe(true)
    expect(at('unknown', 15)).toBe(true)
    expect(at('unknown', 14)).toBe(false)
  })

  it('never expires without the elapsed facts', () => {
    const value = { reference: 'received_at', minutes: minutes15 }
    const withoutFacts: EscalationFacts = { ...facts, sinceEvent: undefined }

    expect(evaluateEscalationCondition(timerLeaf(value), withoutFacts)).toBe(false)
    expect(evaluateEscalationCondition(timerLeaf(value, 'notExpired'), withoutFacts)).toBe(true)
  })

  it('compares the percent variant against the timeline', () => {
    expect(
      evaluateEscalationCondition(timerLeaf({ percent: 80 }), { ...facts, deadlinePercent: 80 }),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(timerLeaf({ percent: 100 }), { ...facts, deadlinePercent: 99 }),
    ).toBe(false)
    expect(
      evaluateEscalationCondition(timerLeaf({ percent: 100 }, 'notExpired'), {
        ...facts,
        deadlinePercent: 99,
      }),
    ).toBe(true)
    expect(evaluateEscalationCondition(timerLeaf({ percent: 40 }), facts)).toBe(true)
    expect(evaluateEscalationCondition(timerLeaf({ percent: 80 }), facts)).toBe(false)
  })

  it('answers the leaves of a condition tree', () => {
    const condition: EscalationCondition = {
      all: [
        timerLeaf({ reference: 'received_at', minutes: minutes15 }),
        { field: 'priority', operator: 'eq', value: 'high' },
      ],
    }

    const timerLeaves = escalationTimerLeaves(condition)

    expect(timerLeaves.length).toBe(1)
    expect(timerLeaves[0]?.operator).toBe('expired')
    expect(JSON.stringify(timerLeaves[0]?.value)).toContain('received_at')
    expect(escalationTimerLeaves({ all: [] })).toEqual([])
  })

  it('keeps a rule without clock fields valid when its condition carries the timer', () => {
    const result = escalationConfigSchema.safeParse({
      stages: [...DEFAULT_WORKFLOW_ESCALATION_STAGES],
      rules: [
        {
          key: 'review#1',
          stageKey: 'review',
          reference: null,
          minutes: null,
          percent: null,
          condition: { all: [timerLeaf({ reference: 'received_at', minutes: minutes15 })] },
          actions: [],
          active: true,
        },
      ],
    })

    expect(result.success).toBe(true)
  })
})
