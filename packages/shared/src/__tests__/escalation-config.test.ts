import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
  ESCALATION_ACTION_TYPES,
  ESCALATION_STAGE_KEYS,
  escalationConfigSchema,
  escalationConditionDepth,
  escalationConditionLeafCount,
  escalationConditionSchema,
  escalationTargetSchema,
  evaluateEscalationCondition,
  validateEscalationStageChain,
  type EscalationCondition,
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
  it('are the five milestones of the workflow', () => {
    expect([...ESCALATION_STAGE_KEYS]).toEqual([
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
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[0]?.predecessor).toBeNull()
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[1]?.predecessor).toBe('review')
    expect(DEFAULT_WORKFLOW_ESCALATION_STAGES[2]?.reachedBy).toEqual(['assigned', 'offered'])
  })
})

describe('the stage chain validator', () => {
  const events = ['review_started', 'work_order_set', 'assigned', 'offered', 'accepted', 'acknowledged']

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
  it('cover the four former status rules and the two deadline rules', () => {
    const keys = DEFAULT_WORKFLOW_ESCALATION_RULES.map((rule) => rule.key)

    expect(keys).toEqual([
      'review',
      'work_order',
      'assignment',
      'acceptance_offer',
      'acceptance_assignment',
      'acknowledgement',
      'deadline_80_percent',
      'deadline_exceeded',
    ])
  })

  it('keep the deadlines of ADR-0008', () => {
    const review = DEFAULT_WORKFLOW_ESCALATION_RULES.find((rule) => rule.key === 'review')
    const offer = DEFAULT_WORKFLOW_ESCALATION_RULES.find((rule) => rule.key === 'acceptance_offer')
    const assignment = DEFAULT_WORKFLOW_ESCALATION_RULES.find((rule) => rule.key === 'acceptance_assignment')

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

  it('rejects a target without a kind and one without an id', () => {
    expect(
      escalationTargetSchema.safeParse({ id: poolTarget.id }).success,
    ).toBe(false)
    expect(escalationTargetSchema.safeParse({ kind: 'pool' }).success).toBe(false)
    expect(escalationTargetSchema.safeParse({ kind: 'team', id: poolTarget.id }).success).toBe(
      false,
    )
    expect(escalationTargetSchema.safeParse({ kind: 'pool', id: 'not-a-uuid' }).success).toBe(
      false,
    )
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
  it('rejects a leaf with a value of the wrong type', () => {    const result = escalationConditionSchema.safeParse({
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
    expect(evaluateEscalationCondition({ field: 'assigned', operator: 'eq', value: false }, facts)).toBe(
      true,
    )
    expect(evaluateEscalationCondition({ field: 'paused', operator: 'eq', value: true }, facts)).toBe(
      false,
    )
  })

  it('knows the stages the ticket has reached', () => {
    expect(
      evaluateEscalationCondition({ field: 'stageReached', operator: 'eq', value: 'review' }, facts),
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
    expect(
      evaluateEscalationCondition(condition, { ...facts, priority: 'low' }),
    ).toBe(false)
  })
})
