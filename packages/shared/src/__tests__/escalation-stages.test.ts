import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ESCALATION_STAGES,
  escalationStagesSchema,
  nextEscalationStage,
  type EscalationStage,
} from '../schemas/escalation-stages'

const stages: EscalationStage[] = [
  { key: 'one', names: { de: 'Eins', en: 'One' }, deadlineMinutes: 15 },
  { key: 'two', names: { de: 'Zwei', en: 'Two' }, deadlineMinutes: 30 },
  { key: 'three', names: { de: 'Drei', en: 'Three' }, deadlineMinutes: 60 },
]

describe('nextEscalationStage', () => {
  it('starts at the first stage without a current stage', () => {
    expect(nextEscalationStage(stages, null)?.key).toBe('one')
  })

  it('advances one stage and clamps at the last stage', () => {
    expect(nextEscalationStage(stages, 'one')?.key).toBe('two')
    expect(nextEscalationStage(stages, 'two')?.key).toBe('three')
    expect(nextEscalationStage(stages, 'three')?.key).toBe('three')
  })

  it('falls back to the first stage for an unknown key', () => {
    expect(nextEscalationStage(stages, 'missing')?.key).toBe('one')
  })
})

describe('escalationStagesSchema', () => {
  it('accepts the defaults', () => {
    expect(escalationStagesSchema.safeParse({ stages: [...DEFAULT_ESCALATION_STAGES] }).success).toBe(
      true,
    )
  })

  it('rejects duplicate keys and a missing German name', () => {
    const duplicate = escalationStagesSchema.safeParse({
      stages: [stages[0], stages[0]],
    })
    const missingName = escalationStagesSchema.safeParse({
      stages: [{ ...stages[0], names: { en: 'One' } }],
    })

    expect(duplicate.success).toBe(false)
    expect(missingName.success).toBe(false)
  })

  it('rejects an empty catalog', () => {
    expect(escalationStagesSchema.safeParse({ stages: [] }).success).toBe(false)
  })
})
