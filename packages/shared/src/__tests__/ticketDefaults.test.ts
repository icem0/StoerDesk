import { describe, expect, it } from 'vitest'

import {
  objectPriorityOverrideListSchema,
  ticketDefaultsSchema,
  ticketPrioritySchema,
} from '../schemas/ticket-defaults'

/**
 * The contracts of the standard priority and of the deviations (ADR-0029,
 * WP-M14-134b): the priority is one of the four values, the standard carries
 * exactly one, and the list of the deviations names the object and its
 * priority.
 */

describe('ticketPrioritySchema', () => {
  it.each(['low', 'normal', 'high', 'critical'])('accepts %s', (priority) => {
    expect(ticketPrioritySchema.parse(priority)).toBe(priority)
  })

  it('rejects an unknown priority', () => {
    expect(ticketPrioritySchema.safeParse('urgent').success).toBe(false)
  })
})

describe('ticketDefaultsSchema', () => {
  it('answers the standard of the instance', () => {
    expect(ticketDefaultsSchema.parse({ priority: 'high' })).toEqual({ priority: 'high' })
  })

  it('rejects a standard without a priority', () => {
    expect(ticketDefaultsSchema.safeParse({}).success).toBe(false)
  })
})

describe('objectPriorityOverrideListSchema', () => {
  it('names the object and the priority of every deviation', () => {
    const list = objectPriorityOverrideListSchema.parse({
      overrides: [
        {
          objectId: '0197f0e0-0000-7000-8000-000000000001',
          objectNo: '12345_01',
          objectName: 'Clinic',
          priority: 'critical',
        },
      ],
    })

    expect(list.overrides[0]?.objectNo).toBe('12345_01')
    expect(list.overrides[0]?.priority).toBe('critical')
  })

  it('accepts an empty list', () => {
    expect(objectPriorityOverrideListSchema.parse({ overrides: [] }).overrides).toHaveLength(0)
  })

  it('rejects a deviation without a priority', () => {
    expect(
      objectPriorityOverrideListSchema.safeParse({
        overrides: [
          {
            objectId: '0197f0e0-0000-7000-8000-000000000001',
            objectNo: '12345_01',
            objectName: 'Clinic',
          },
        ],
      }).success,
    ).toBe(false)
  })
})
