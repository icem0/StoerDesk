import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
  ESCALATION_STAGE_KEYS,
  escalationConfigSchema,
  escalationConditionDepth,
  escalationConditionLeafCount,
  escalationConditionSchema,
  evaluateEscalationCondition,
  type EscalationCondition,
  type EscalationFacts,
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

  it('reject a stage key outside the workflow', () => {
    const result = escalationConfigSchema.safeParse({
      stages: [{ key: 'office', names: { de: 'Büro', en: 'Office' }, position: 1, active: true }],
      rules: [],
    })

    expect(result.success).toBe(false)
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
